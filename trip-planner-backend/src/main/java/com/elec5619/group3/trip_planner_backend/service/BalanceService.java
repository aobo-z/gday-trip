package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.BalanceResponse;
import com.elec5619.group3.trip_planner_backend.dto.SimplifiedDebtResponse;
import com.elec5619.group3.trip_planner_backend.dto.BalanceResponse.Obligation;
import com.elec5619.group3.trip_planner_backend.dto.SimplifiedDebtResponse.Transfer;
import com.elec5619.group3.trip_planner_backend.entity.Expense;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.repository.ExpenseRepository;
import com.elec5619.group3.trip_planner_backend.repository.SettlementRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class BalanceService {
    private static final BigDecimal ZERO = new BigDecimal("0.00");
    private final ExpenseRepository expenses;
    private final SettlementRepository settlements;
    private final TripMemberService members;

    public BalanceService(ExpenseRepository expenses, SettlementRepository settlements, TripMemberService members) {
        this.expenses = expenses;
        this.settlements = settlements;
        this.members = members;
    }

    public BalanceResponse get(Long tripId, Long userId) {
        members.verifyUserIsMember(tripId, userId);
        return calculate(tripId, userId, expenses.findByTrip_TripIdOrderByDateDescExpenseIdDesc(tripId));
    }

    // Callers verify membership. Summary reuses its already fetched expenses.
    BalanceResponse calculate(Long tripId, Long userId, List<Expense> records) {
        Ledger ledger = ledger(tripId, records);
        BigDecimal net = ledger.nets().getOrDefault(userId, ZERO);
        List<Transfer> transfers = match(ledger.nets(), ledger.names());
        List<Obligation> owe = transfers.stream().filter(t -> t.fromUserId().equals(userId))
                .map(t -> new Obligation(t.toUserId(), t.toName(), t.amount())).toList();
        List<Obligation> owed = transfers.stream().filter(t -> t.toUserId().equals(userId))
                .map(t -> new Obligation(t.fromUserId(), t.fromName(), t.amount())).toList();
        // Manual payments may go to any eligible net creditor, not just this greedy matching.
        List<Obligation> payees = new ArrayList<>();
        if (net.signum() < 0) ledger.nets().forEach((id, value) -> {
            if (value.signum() > 0) payees.add(new Obligation(id, ledger.names().get(id), net.negate().min(value)));
        });
        return new BalanceResponse(net, net.negate().max(ZERO), net.max(ZERO), owe, owed, payees);
    }

    // Internal write-time validation uses the exact same ledger as both read APIs.
    Map<Long, BigDecimal> currentNets(Long tripId) {
        return currentNets(tripId, null);
    }

    // Used under the Trip write lock before mutating the target record.
    Map<Long, BigDecimal> currentNets(Long tripId, Long excludedSettlementId) {
        return ledger(tripId, expenses.findByTrip_TripIdOrderByDateDescExpenseIdDesc(tripId), excludedSettlementId).nets();
    }

    public SimplifiedDebtResponse simplify(Long tripId, Long userId) {
        String currency = members.verifyUserIsMember(tripId, userId).getTrip().getBaseCurrency();
        Ledger ledger = ledger(tripId, expenses.findByTrip_TripIdOrderByDateDescExpenseIdDesc(tripId));
        return new SimplifiedDebtResponse(currency, ledger.originalDebts().size(),
                match(ledger.nets(), ledger.names()), ledger.originalDebts(),
                match(ledger.expenseNets(), ledger.names()).size());
    }

    private record Ledger(Map<Long, BigDecimal> nets, Map<Long, BigDecimal> expenseNets,
                          Map<Long, String> names, List<Transfer> originalDebts) {}
    private record Pair(Long first, Long second) {}

    private Ledger ledger(Long tripId, List<Expense> records) {
        return ledger(tripId, records, null);
    }

    private Ledger ledger(Long tripId, List<Expense> records, Long excludedSettlementId) {
        Map<Long, BigDecimal> nets = new TreeMap<>();
        Map<Long, String> names = new HashMap<>();
        Map<Pair, BigDecimal> pairs = new TreeMap<>(Comparator.comparing(Pair::first).thenComparing(Pair::second));
        for (Expense expense : records) {
            // Persisted base accounting amounts only. ExpenseService allocates rounded cents exactly.
            position(nets, names, expense.getPayer(), expense.getAmount());
            for (var share : expense.getShares()) {
                position(nets, names, share.getUser(), share.getShareAmount().negate());
                Long from = share.getUser().getUserId(), to = expense.getPayer().getUserId();
                if (from.equals(to)) continue;
                boolean ascending = from < to;
                pairs.merge(new Pair(ascending ? from : to, ascending ? to : from),
                        ascending ? share.getShareAmount() : share.getShareAmount().negate(), BigDecimal::add);
            }
        }
        Map<Long, BigDecimal> expenseNets = new TreeMap<>(nets);
        List<Transfer> original = new ArrayList<>();
        pairs.forEach((pair, amount) -> {
            if (amount.signum() == 0) return;
            Long from = amount.signum() > 0 ? pair.first() : pair.second();
            Long to = amount.signum() > 0 ? pair.second() : pair.first();
            original.add(new Transfer(from, names.get(from), to, names.get(to), amount.abs()));
        });
        for (var payment : settlements.findByTrip_TripIdOrderBySettledAtDescSettlementIdDesc(tripId)) {
            if (payment.getVoidedAt() != null || payment.getSettlementId().equals(excludedSettlementId)) continue;
            // Payments change signed nets, never the historical expense-only pairwise relationships.
            position(nets, names, payment.getPayer(), payment.getAmount());
            position(nets, names, payment.getPayee(), payment.getAmount().negate());
        }
        return new Ledger(nets, expenseNets, names, original);
    }

    private void position(Map<Long, BigDecimal> nets, Map<Long, String> names, User user, BigDecimal amount) {
        nets.merge(user.getUserId(), amount, BigDecimal::add);
        names.put(user.getUserId(), user.getUsername());
    }

    private record Position(Long userId, BigDecimal amount) {}
    private List<Transfer> match(Map<Long, BigDecimal> nets, Map<Long, String> names) {
        Comparator<Position> order = Comparator.comparing(Position::amount).reversed().thenComparing(Position::userId);
        Queue<Position> debtors = new PriorityQueue<>(order);
        Queue<Position> creditors = new PriorityQueue<>(order);
        nets.forEach((id, net) -> {
            if (net.signum() < 0) debtors.add(new Position(id, net.negate()));
            if (net.signum() > 0) creditors.add(new Position(id, net));
        });
        List<Transfer> transfers = new ArrayList<>();
        // Greedy matching is deterministic and preserves net positions; it does not claim a globally minimal plan.
        while (!debtors.isEmpty() && !creditors.isEmpty()) {
            Position debtor = debtors.remove(), creditor = creditors.remove();
            BigDecimal amount = debtor.amount().min(creditor.amount());
            transfers.add(new Transfer(debtor.userId(), names.get(debtor.userId()),
                    creditor.userId(), names.get(creditor.userId()), amount));
            if (debtor.amount().compareTo(amount) > 0) debtors.add(new Position(debtor.userId(), debtor.amount().subtract(amount)));
            if (creditor.amount().compareTo(amount) > 0) creditors.add(new Position(creditor.userId(), creditor.amount().subtract(amount)));
        }
        if (!debtors.isEmpty() || !creditors.isEmpty()) throw new IllegalStateException("Trip net balances are inconsistent");
        return transfers;
    }
}
