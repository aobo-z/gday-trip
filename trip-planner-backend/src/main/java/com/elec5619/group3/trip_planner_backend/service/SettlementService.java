package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.*;
import com.elec5619.group3.trip_planner_backend.entity.Settlement;
import com.elec5619.group3.trip_planner_backend.repository.SettlementRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import jakarta.validation.Validator;
import com.elec5619.group3.trip_planner_backend.exception.ResourceNotFoundException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.time.LocalDateTime;

@Service
@Transactional(readOnly = true)
public class SettlementService {
    private final SettlementRepository settlements;
    private final TripRepository trips;
    private final TripMemberService members;
    private final BalanceService balances;
    private final Validator validator;

    public SettlementService(SettlementRepository settlements, TripRepository trips, TripMemberService members,
                             BalanceService balances, Validator validator) {
        this.settlements = settlements;
        this.trips = trips;
        this.members = members;
        this.balances = balances;
        this.validator = validator;
    }

    public List<SettlementResponse> list(Long tripId, Long userId) {
        members.verifyUserIsMember(tripId, userId);
        return settlements.findByTrip_TripIdOrderBySettledAtDescSettlementIdDesc(tripId).stream()
                .map(this::response).toList();
    }

    @Transactional
    public SettlementResponse create(Long tripId, SettlementRequest request, Long userId) {
        // Acquire before any snapshot reads so a waiting payment sees the preceding committed payment.
        trips.lockFinancialWrites(tripId);
        var payer = members.verifyUserIsMember(tripId, userId);
        var violations = validator.validate(request);
        if (!violations.isEmpty()) throw new IllegalArgumentException(violations.iterator().next().getMessage());
        if (userId.equals(request.getPayeeId())) throw new IllegalArgumentException("You cannot pay yourself");
        var payee = members.verifyUserIsMember(tripId, request.getPayeeId());
        validatePayment(balances.currentNets(tripId), userId, request.getPayeeId(), request.getAmount());
        Settlement payment = new Settlement();
        payment.setTrip(payer.getTrip());
        payment.setPayer(payer.getUser());
        payment.setPayee(payee.getUser());
        payment.setAmount(request.getAmount().setScale(2));
        return response(settlements.saveAndFlush(payment));
    }

    @Transactional
    public SettlementResponse update(Long tripId, Long settlementId, SettlementUpdateRequest request, Long userId) {
        trips.lockFinancialWrites(tripId);
        Settlement payment = ownedActive(tripId, settlementId, userId);
        var violations = validator.validate(request);
        if (!violations.isEmpty()) throw new IllegalArgumentException(violations.iterator().next().getMessage());
        Long payeeId = request.getPayeeId() == null ? payment.getPayee().getUserId() : request.getPayeeId();
        if (userId.equals(payeeId)) throw new IllegalArgumentException("You cannot pay yourself");
        var payee = members.verifyUserIsMember(tripId, payeeId);
        // Skip exactly this active payment before validating its replacement. Do not mutate a managed
        // entity first: a query could auto-flush it and double-apply the correction.
        validatePayment(balances.currentNets(tripId, settlementId), userId, payeeId, request.getAmount());
        payment.setPayee(payee.getUser());
        payment.setAmount(request.getAmount().setScale(2));
        return response(settlements.saveAndFlush(payment));
    }

    @Transactional
    public void voidSettlement(Long tripId, Long settlementId, Long userId) {
        trips.lockFinancialWrites(tripId);
        Settlement payment = ownedActive(tripId, settlementId, userId);
        payment.setVoidedAt(LocalDateTime.now());
        settlements.saveAndFlush(payment);
    }

    private Settlement ownedActive(Long tripId, Long settlementId, Long userId) {
        members.verifyUserIsMember(tripId, userId);
        Settlement payment = settlements.findBySettlementIdAndTrip_TripId(settlementId, tripId)
                .orElseThrow(() -> new ResourceNotFoundException("Settlement not found in this trip"));
        if (!payment.getPayer().getUserId().equals(userId))
            throw new AccessDeniedException("Only the original payer can edit or delete this settlement");
        if (payment.getVoidedAt() != null)
            throw new IllegalStateException("This settlement has already been voided. Refresh settlement history.");
        return payment;
    }

    private void validatePayment(Map<Long, BigDecimal> nets, Long payerId, Long payeeId, BigDecimal amount) {
        BigDecimal payerNet = nets.getOrDefault(payerId, BigDecimal.ZERO);
        BigDecimal payeeNet = nets.getOrDefault(payeeId, BigDecimal.ZERO);
        if (payerNet.signum() >= 0 || payeeNet.signum() <= 0)
            throw new IllegalArgumentException("Balances have changed: payer must owe a net debt and recipient must be a net creditor. Refresh the recommendations.");
        BigDecimal maximum = payerNet.negate().min(payeeNet);
        if (amount.compareTo(maximum) > 0)
            throw new IllegalArgumentException("Balances have changed: payment or corrected payment cannot exceed " + maximum
                    + " in trip currency. Refresh the recommendations and reduce the amount.");
    }

    private SettlementResponse response(Settlement payment) {
        return new SettlementResponse(payment.getSettlementId(), payment.getPayer().getUserId(),
                payment.getPayer().getUsername(), payment.getPayee().getUserId(), payment.getPayee().getUsername(),
                payment.getAmount(), payment.getSettledAt(), payment.getVoidedAt());
    }
}
