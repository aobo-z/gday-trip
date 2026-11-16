package com.elec5619.group3.trip_planner_backend;

import static com.elec5619.group3.trip_planner_backend.TestTimes.assertSameMicrosecond;
import com.elec5619.group3.trip_planner_backend.dto.*;
import com.elec5619.group3.trip_planner_backend.entity.*;
import com.elec5619.group3.trip_planner_backend.repository.*;
import com.elec5619.group3.trip_planner_backend.service.*;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.exception.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SettlementIntegrationTests {
    @Autowired BalanceService balances;
    @Autowired SettlementService payments;
    @Autowired ExpenseService expenses;
    @Autowired TripService tripService;
    @Autowired SettlementRepository settlementRepository;
    @Autowired ExpenseRepository expenseRepository;
    @Autowired TripMemberRepository memberships;
    @Autowired TripRepository trips;
    @Autowired UserRepository users;
    @Autowired MockMvc mvc;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    User amy, jack, mia, outsider;
    Trip trip, otherTrip;

    @ParameterizedTest @ValueSource(ints = {3, 4, 7})
    void simplifiedCyclesCancelWithoutWrites(int size) {
        var people = new java.util.ArrayList<>(List.of(amy, jack, mia));
        for (int i = 3; i < size; i++) { User u = user("Cycle" + i); join(trip, u, "MEMBER"); people.add(u); }
        for (int i = 0; i < size; i++) debt(people.get(i), people.get((i + 1) % size), "10.01");
        var before = jdbc.queryForList("select * from expense_shares order by expense_share_id");
        var plan = balances.simplify(trip.getTripId(), amy.getUserId());
        assertEquals(size, plan.originalPairwiseRelationships()); assertTrue(plan.transfers().isEmpty());
        assertEquals(before, jdbc.queryForList("select * from expense_shares order by expense_share_id"));
        assertEquals(size, expenseRepository.count()); assertEquals(0, settlementRepository.count());
    }
    @Test void simplifiedMixedDebtsIncludeSettlementsAndPreserveEveryNet() {
        User fourth = user("Fourth"), fifth = user("Fifth"), sixth = user("Sixth");
        for (User u : List.of(fourth, fifth, sixth)) join(trip, u, "MEMBER");
        debt(amy, jack, "30.01"); debt(amy, mia, "10.02"); debt(fourth, mia, "20.03");
        debt(fifth, sixth, "5.04"); debt(sixth, jack, "3.05");
        pay(amy, jack, "4.06");
        var before = jdbc.queryForList("select * from expenses order by expense_id");
        var paymentsBefore = jdbc.queryForList("select * from settlements order by settlement_id");
        var plan = balances.simplify(trip.getTripId(), amy.getUserId());
        assertEquals(plan, balances.simplify(trip.getTripId(), amy.getUserId()));
        assertEquals("AUD", plan.currency());
        for (User u : List.of(amy, jack, mia, fourth, fifth, sixth)) {
            BigDecimal net = BigDecimal.ZERO;
            for (var transfer : plan.transfers()) {
                assertTrue(transfer.amount().signum() > 0); assertEquals(2, transfer.amount().scale());
                assertNotEquals(transfer.fromUserId(), transfer.toUserId());
                if (transfer.fromUserId().equals(u.getUserId())) net = net.subtract(transfer.amount());
                if (transfer.toUserId().equals(u.getUserId())) net = net.add(transfer.amount());
            }
            assertEquals(0, net.compareTo(view(u).getNetBalance()));
        }
        assertTrue(plan.transfers().size() <= 5);
        assertEquals(before, jdbc.queryForList("select * from expenses order by expense_id"));
        assertEquals(paymentsBefore, jdbc.queryForList("select * from settlements order by settlement_id"));
    }
    @Test void simplifiedSettledEmptyAndUnauthorised() throws Exception {
        assertTrue(balances.simplify(trip.getTripId(), amy.getUserId()).transfers().isEmpty());
        debt(jack, amy, "10.01"); pay(jack, amy, "10.01");
        assertTrue(balances.simplify(trip.getTripId(), amy.getUserId()).transfers().isEmpty());
        mvc.perform(get("/api/trips/{id}/balances/simplified", trip.getTripId()).with(authentication(auth(outsider))))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/trips/{id}/balances/simplified", trip.getTripId())).andExpect(status().isUnauthorized());
    }
    @BeforeEach void setup() {
        settlementRepository.deleteAll(); expenseRepository.deleteAll(); memberships.deleteAll(); trips.deleteAll(); users.deleteAll();
        amy = user("Amy"); jack = user("Jack"); mia = user("Mia"); outsider = user("Outsider");
        trip = trip("First"); otherTrip = trip("Second");
        join(trip, amy, "OWNER"); join(trip, jack, "MEMBER"); join(trip, mia, "MEMBER");
        join(otherTrip, outsider, "OWNER");
    }
    User user(String name) {
        User u = new User(); u.setUsername(name); u.setEmail(name + "@example.test"); u.setPasswordHash("test-only");
        return users.save(u);
    }
    Trip trip(String name) {
        Trip t = new Trip(); t.setName(name); t.setDestination("Test");
        t.setStartDate(LocalDate.of(2026, 9, 1)); t.setEndDate(LocalDate.of(2026, 9, 10)); t.setPlannedBudget(new BigDecimal("100.00"));
        return trips.save(t);
    }
    TripMember join(Trip t, User u, String role) {
        TripMember m = new TripMember(); m.setTrip(t); m.setUser(u); m.setRole(role); return memberships.save(m);
    }
    void memberStatus(User u, String status) {
        TripMember m = memberships.findByTrip_TripIdAndUser_UserId(trip.getTripId(), u.getUserId()).orElseThrow();
        m.setInviteStatus(status); memberships.save(m);
    }
    ExpenseRequest request(User creditor, User debtor, String amount) {
        ExpenseRequest r = new ExpenseRequest(); r.setPayerId(creditor.getUserId()); r.setDescription("Test expense");
        r.setDate(LocalDate.of(2026, 9, 5)); r.setAmount(new BigDecimal(amount)); r.setSplitMode(ExpenseRequest.SplitMode.EQUAL);
        ExpenseRequest.Participant p = new ExpenseRequest.Participant(); p.setUserId(debtor.getUserId());
        r.setParticipants(List.of(p)); return r;
    }
    ExpenseResponse debt(User debtor, User creditor, String amount) {
        return expenses.create(trip.getTripId(), request(creditor, debtor, amount), amy.getUserId());
    }
    SettlementRequest payment(User payee, String amount) {
        SettlementRequest r = new SettlementRequest(); r.setPayeeId(payee.getUserId()); r.setAmount(new BigDecimal(amount)); return r;
    }
    SettlementResponse pay(User payer, User payee, String amount) {
        return payments.create(trip.getTripId(), payment(payee, amount), payer.getUserId());
    }
    BalanceResponse view(User u) { return balances.get(trip.getTripId(), u.getUserId()); }
    void owes(User debtor, User creditor, String amount) {
        BalanceResponse b = view(debtor);
        assertEquals(new BigDecimal(amount), b.getYouOwe().stream().filter(o -> o.getUserId().equals(creditor.getUserId()))
                .map(BalanceResponse.Obligation::getAmount).findFirst().orElse(new BigDecimal("0.00")));
        assertEquals(b.getTotalYouOwe(), expenses.summary(trip.getTripId(), debtor.getUserId()).getCurrentUserOwes());
    }
    SettlementUpdateRequest amount(String value) {
        SettlementUpdateRequest r = new SettlementUpdateRequest(); r.setAmount(new BigDecimal(value)); return r;
    }
    SettlementResponse edit(User payer, Long id, String value) {
        return payments.update(trip.getTripId(), id, amount(value), payer.getUserId());
    }
    UsernamePasswordAuthenticationToken auth(User u) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedUser(u.getUserId(), u.getEmail()), null, List.of());
    }

    @Test void noExpensesMeansZero() {
        BalanceResponse b = view(jack);
        assertEquals(new BigDecimal("0.00"), b.getNetBalance());
        assertEquals(new BigDecimal("0.00"), b.getTotalYouOwe());
        assertEquals(new BigDecimal("0.00"), b.getTotalYouAreOwed());
        assertTrue(b.getYouOwe().isEmpty()); assertTrue(b.getYouAreOwed().isEmpty());
        assertTrue(payments.list(trip.getTripId(), jack.getUserId()).isEmpty());
    }
    @Test void threeMemberSuggestionsRecalculateAfterPartialPayment() {
        debt(jack, amy, "60.00"); debt(mia, amy, "40.00");
        var before = balances.simplify(trip.getTripId(), jack.getUserId());
        assertEquals(2, before.transfers().size());
        assertEquals(jack.getUserId(), before.transfers().get(0).fromUserId());
        assertEquals(amy.getUserId(), before.transfers().get(0).toUserId());
        assertEquals(new BigDecimal("60.00"), before.transfers().get(0).amount());
        assertThrows(IllegalArgumentException.class, () -> pay(jack, amy, "60.01"));
        pay(jack, amy, "30.00"); owes(jack, amy, "30.00"); owes(mia, amy, "40.00");
        assertEquals(new BigDecimal("70.00"), view(amy).getNetBalance());
        var after = balances.simplify(trip.getTripId(), jack.getUserId());
        assertEquals(mia.getUserId(), after.transfers().get(0).fromUserId());
        assertEquals(new BigDecimal("40.00"), after.transfers().get(0).amount());
        assertEquals(jack.getUserId(), after.transfers().get(1).fromUserId());
        assertEquals(new BigDecimal("30.00"), after.transfers().get(1).amount());
        assertEquals(new BigDecimal("0.00"), view(amy).getNetBalance().add(view(jack).getNetBalance()).add(view(mia).getNetBalance()));
    }
    @Test void crossEdgePartialPaymentAndEditRecalculateOneLedger() {
        // Jack/Bob -> Mia/Charlie 60; Mia/Charlie -> Amy/Alice 100.
        debt(jack, mia, "60.00"); debt(mia, amy, "100.00");
        var original = balances.simplify(trip.getTripId(), jack.getUserId());
        assertEquals(2, original.originalDebts().size());
        assertEquals(2, original.baselineSimplifiedRelationships());
        owes(jack, amy, "60.00"); owes(mia, amy, "40.00");
        assertThrows(IllegalArgumentException.class, () -> pay(mia, amy, "80.00"));
        var payment = pay(jack, amy, "30.00");
        owes(jack, amy, "30.00"); owes(mia, amy, "40.00");
        assertEquals(new BigDecimal("70.00"), view(amy).getNetBalance());
        edit(jack, payment.getSettlementId(), "20.00");
        owes(jack, amy, "40.00"); owes(mia, amy, "40.00");
        assertEquals(new BigDecimal("80.00"), view(amy).getNetBalance());
        var after = balances.simplify(trip.getTripId(), jack.getUserId());
        assertEquals(original.originalDebts(), after.originalDebts());
        assertEquals(original.baselineSimplifiedRelationships(), after.baselineSimplifiedRelationships());
        assertEquals(new BigDecimal("0.00"), view(jack).getNetBalance().add(view(mia).getNetBalance()).add(view(amy).getNetBalance()));
        pay(jack, amy, "40.00"); pay(mia, amy, "40.00");
        assertTrue(balances.simplify(trip.getTripId(), jack.getUserId()).transfers().isEmpty());
        assertEquals(3, payments.list(trip.getTripId(), jack.getUserId()).size());
        assertEquals(2, expenseRepository.count());
    }
    @Test void payerOwnShareDoesNotCreateDebt() {
        ExpenseRequest r = request(amy, jack, "100.00"); r.setSplitMode(ExpenseRequest.SplitMode.CUSTOM);
        ExpenseRequest.Participant a = new ExpenseRequest.Participant(); a.setUserId(amy.getUserId()); a.setShareAmount(new BigDecimal("25.00"));
        ExpenseRequest.Participant j = r.getParticipants().get(0); j.setShareAmount(new BigDecimal("75.00")); r.setParticipants(List.of(a, j));
        expenses.create(trip.getTripId(), r, amy.getUserId());
        owes(jack, amy, "75.00"); assertTrue(view(amy).getYouOwe().isEmpty());
        assertEquals(jack.getUserId(), view(amy).getYouAreOwed().get(0).getUserId());
        assertEquals(new BigDecimal("75.00"), view(amy).getNetBalance());
        assertEquals(new BigDecimal("-75.00"), view(jack).getNetBalance());
    }
    @Test void selfOnlyExpenseIsBalanced() { debt(amy, amy, "100.00"); assertTrue(view(amy).getYouOwe().isEmpty()); assertTrue(view(amy).getYouAreOwed().isEmpty()); }
    @Test void multipleExpensesAggregate() { debt(jack, amy, "20.00"); debt(jack, amy, "30.00"); owes(jack, amy, "50.00"); }
    @Test void oppositeObligationsNetPairwise() {
        debt(jack, amy, "50.00"); debt(amy, jack, "20.00"); owes(jack, amy, "30.00");
        assertTrue(view(jack).getYouAreOwed().isEmpty()); assertTrue(view(amy).getYouOwe().isEmpty());
        assertThrows(IllegalArgumentException.class, () -> pay(amy, jack, "1.00"));
        assertThrows(IllegalArgumentException.class, () -> pay(jack, amy, "31.00"));
        pay(jack, amy, "10.00"); owes(jack, amy, "20.00");
    }
    @Test void zeroNetMemberHasNoCurrentPayableDespiteOriginalObligations() {
        debt(jack, amy, "20.00"); debt(amy, mia, "20.00");
        owes(jack, mia, "20.00"); owes(amy, mia, "0.00");
        assertEquals(new BigDecimal("0.00"), view(amy).getNetBalance());
        assertEquals(new BigDecimal("0.00"), view(amy).getTotalYouOwe());
        assertEquals(new BigDecimal("0.00"), view(amy).getTotalYouAreOwed());
        assertEquals(2, balances.simplify(trip.getTripId(), jack.getUserId()).originalDebts().size());
        pay(jack, mia, "20.00");
        assertTrue(view(jack).getYouOwe().isEmpty());
    }
    @Test void paymentReducesDebtAndSummaryWithoutChangingSpending() {
        debt(jack, amy, "50.00"); owes(jack, amy, "50.00");
        ExpenseSummaryResponse before = expenses.summary(trip.getTripId(), jack.getUserId());
        pay(jack, amy, "20.00"); owes(jack, amy, "30.00");
        assertEquals(new BigDecimal("30.00"), view(amy).getTotalYouAreOwed());
        ExpenseSummaryResponse after = expenses.summary(trip.getTripId(), jack.getUserId());
        assertEquals(before.getTotalSpending(), after.getTotalSpending()); assertEquals(before.getBudget(), after.getBudget());
        assertEquals(before.getRemaining(), after.getRemaining()); assertEquals(before.getBudgetUsedPercentage(), after.getBudgetUsedPercentage());
    }
    @Test void fullPaymentRemovesPair() {
        debt(jack, amy, "50.00"); pay(jack, amy, "50.00"); owes(jack, amy, "0.00");
        assertTrue(view(jack).getYouOwe().isEmpty()); assertTrue(view(amy).getYouAreOwed().isEmpty());
        assertThrows(IllegalArgumentException.class, () -> pay(jack, amy, "0.01"));
    }
    @Test void partialPaymentsAggregate() {
        debt(jack, amy, "50.00"); pay(jack, amy, "10.00"); pay(jack, amy, "15.00"); owes(jack, amy, "25.00");
        assertEquals(2, payments.list(trip.getTripId(), jack.getUserId()).size());
    }
    @Test void unrelatedOppositePairPaymentsDoNotAffectDebt() {
        join(trip, outsider, "MEMBER"); debt(jack, amy, "50.00"); debt(mia, outsider, "25.00"); pay(mia, outsider, "10.00");
        debt(outsider, mia, "30.00"); pay(outsider, mia, "5.00"); owes(jack, amy, "50.00"); owes(outsider, mia, "10.00");
    }
    @ParameterizedTest @ValueSource(strings = {"0", "-1", "1.001", "100000000"})
    void invalidPaymentAmountsRejected(String amount) {
        debt(jack, amy, "50.00"); assertThrows(IllegalArgumentException.class, () -> pay(jack, amy, amount));
        assertEquals(0, settlementRepository.count()); owes(jack, amy, "50.00");
    }
    @Test void requiredFieldsRejectedAtServiceBoundary() {
        SettlementRequest r = new SettlementRequest();
        assertThrows(IllegalArgumentException.class, () -> payments.create(trip.getTripId(), r, jack.getUserId()));
    }
    @Test void selfPaymentRejected() { assertThrows(IllegalArgumentException.class, () -> pay(jack, jack, "1.00")); }
    @Test void payeeOutsideTripRejected() { assertThrows(AccessDeniedException.class, () -> pay(jack, outsider, "1.00")); }
    @Test void missingPayeeRejected() {
        SettlementRequest r = payment(amy, "1.00"); r.setPayeeId(Long.MAX_VALUE);
        assertThrows(AccessDeniedException.class, () -> payments.create(trip.getTripId(), r, jack.getUserId()));
    }
    @Test void missingTripRejected() {
        assertThrows(ResourceNotFoundException.class, () -> payments.create(Long.MAX_VALUE, payment(amy, "1.00"), jack.getUserId()));
        assertThrows(ResourceNotFoundException.class, () -> balances.get(Long.MAX_VALUE, jack.getUserId()));
    }
    @ParameterizedTest @ValueSource(strings = {"INVITED", "PENDING", "DECLINED"})
    void inactivePayerCannotReadOrPay(String state) {
        debt(jack, amy, "50.00"); memberStatus(jack, state);
        assertThrows(AccessDeniedException.class, () -> view(jack));
        assertThrows(AccessDeniedException.class, () -> pay(jack, amy, "1.00"));
        assertThrows(AccessDeniedException.class, () -> payments.list(trip.getTripId(), jack.getUserId()));
    }
    @ParameterizedTest @ValueSource(strings = {"INVITED", "PENDING", "DECLINED"})
    void inactivePayeeCannotReceivePayment(String state) {
        debt(jack, amy, "50.00"); memberStatus(amy, state);
        assertThrows(AccessDeniedException.class, () -> pay(jack, amy, "1.00")); assertEquals(0, settlementRepository.count());
    }
    @Test void nonMemberCannotReadOrPay() {
        assertThrows(AccessDeniedException.class, () -> view(outsider));
        assertThrows(AccessDeniedException.class, () -> pay(outsider, amy, "1.00"));
        assertThrows(AccessDeniedException.class, () -> payments.list(trip.getTripId(), outsider.getUserId()));
    }
    @Test void overpaymentRejectedWithoutPersistence() {
        debt(jack, amy, "50.00"); pay(jack, amy, "20.00");
        assertThrows(IllegalArgumentException.class, () -> pay(jack, amy, "30.01"));
        assertEquals(1, settlementRepository.count()); owes(jack, amy, "30.00");
    }
    @Test void cannotPayMemberWithoutDebt() { assertThrows(IllegalArgumentException.class, () -> pay(jack, amy, "1.00")); }
    @Test void historyNewestFirstAndTripScoped() {
        debt(jack, amy, "50.00"); SettlementResponse first = pay(jack, amy, "10.00"); SettlementResponse second = pay(jack, amy, "15.00");
        assertEquals(List.of(second.getSettlementId(), first.getSettlementId()), payments.list(trip.getTripId(), mia.getUserId()).stream().map(SettlementResponse::getSettlementId).toList());
        join(otherTrip, jack, "MEMBER"); join(otherTrip, amy, "MEMBER");
        assertTrue(payments.list(otherTrip.getTripId(), jack.getUserId()).isEmpty());
        assertEquals(new BigDecimal("0.00"), balances.get(otherTrip.getTripId(), jack.getUserId()).getTotalYouOwe());
        assertThrows(IllegalArgumentException.class, () -> payments.create(otherTrip.getTripId(), payment(amy, "1.00"), jack.getUserId()));
    }
    @Test void centsStayExactAcrossRepeatedPayments() {
        debt(jack, amy, "0.10"); debt(jack, amy, "0.20");
        for (int i = 0; i < 29; i++) pay(jack, amy, "0.01");
        owes(jack, amy, "0.01"); pay(jack, amy, "0.01"); owes(jack, amy, "0.00");
    }
    @Test void concurrentPaymentsCannotOverpay() throws Exception {
        debt(jack, amy, "50.00"); ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        Callable<Boolean> attempt = () -> { start.await(); try { pay(jack, amy, "30.00"); return true; } catch (IllegalArgumentException e) { return false; } };
        try {
            Future<Boolean> a = pool.submit(attempt); Future<Boolean> b = pool.submit(attempt); start.countDown();
            assertNotEquals(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
            assertEquals(1, settlementRepository.count()); owes(jack, amy, "20.00");
        } finally { pool.shutdownNow(); }
    }
    @Test void expenseEditsAndDeletionRetainActualPayments() {
        ExpenseResponse e = debt(jack, amy, "50.00"); pay(jack, amy, "20.00");
        expenses.update(trip.getTripId(), e.getExpenseId(), request(amy, jack, "40.00"), amy.getUserId()); owes(jack, amy, "20.00");
        expenses.delete(trip.getTripId(), e.getExpenseId(), amy.getUserId());
        // The actual 20 payment remains; deleting the expense now leaves Amy owing Jack a refund.
        owes(amy, jack, "20.00"); assertEquals(1, payments.list(trip.getTripId(), jack.getUserId()).size());
    }
    @Test void tripDeletionCleansOnlyItsSettlements() {
        debt(jack, amy, "50.00"); pay(jack, amy, "20.00"); tripService.deleteTrip(trip.getTripId(), amy.getUserId());
        assertEquals(0, settlementRepository.count()); assertTrue(trips.existsById(otherTrip.getTripId()));
    }
    @Test void apiDerivesPayerFromPrincipalDespiteForgedField() throws Exception {
        debt(jack, amy, "50.00");
        mvc.perform(post("/api/trips/{id}/settlements", trip.getTripId()).with(authentication(auth(jack))).contentType("application/json")
                .content("{\"payerId\":%d,\"payeeId\":%d,\"amount\":20.00}".formatted(mia.getUserId(), amy.getUserId())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.payerId").value(jack.getUserId()))
                .andExpect(jsonPath("$.payeeId").value(amy.getUserId())).andExpect(jsonPath("$.amount").value(20.00))
                .andExpect(jsonPath("$.settledAt").exists()).andExpect(jsonPath("$.settlementId").exists())
                .andExpect(jsonPath("$.passwordHash").doesNotExist()).andExpect(jsonPath("$.payer").doesNotExist())
                .andExpect(jsonPath("$.email").doesNotExist()).andExpect(jsonPath("$.token").doesNotExist());
        owes(jack, amy, "30.00");
    }
    @Test void ownerCannotForgePaymentOnBehalfOfAnotherMember() throws Exception {
        debt(jack, mia, "50.00");
        mvc.perform(post("/api/trips/{id}/settlements", trip.getTripId()).with(authentication(auth(amy))).contentType("application/json")
                .content("{\"payerId\":%d,\"payeeId\":%d,\"amount\":20.00}".formatted(jack.getUserId(), mia.getUserId())))
                .andExpect(status().isBadRequest()); assertEquals(0, settlementRepository.count()); owes(jack, mia, "50.00");
    }
    @Test void apiBalancesAndSummaryAgreeAfterPayment() throws Exception {
        debt(jack, amy, "50.00"); pay(jack, amy, "20.00");
        mvc.perform(get("/api/trips/{id}/balances", trip.getTripId()).param("userId", amy.getUserId().toString()).with(authentication(auth(jack))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalYouOwe").value(30)).andExpect(jsonPath("$.netBalance").value(-30))
                .andExpect(jsonPath("$.youOwe[0].userId").value(amy.getUserId())).andExpect(jsonPath("$.youAreOwed").isEmpty());
        mvc.perform(get("/api/trips/{id}/expenses/summary", trip.getTripId()).with(authentication(auth(jack))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.currentUserOwes").value(30));
        mvc.perform(get("/api/trips/{id}/settlements", trip.getTripId()).with(authentication(auth(jack))))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].payerName").value("Jack")).andExpect(jsonPath("$[0].payeeName").value("Amy"));
    }
    @Test void apiRejectsMissingFieldsAndOverpayment() throws Exception {
        for (String json : List.of("{}", "{\"payeeId\":1}", "{\"amount\":1}", "{\"payeeId\":1,\"amount\":0}"))
            mvc.perform(post("/api/trips/{id}/settlements", trip.getTripId()).with(authentication(auth(jack))).contentType("application/json").content(json))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").isNotEmpty());
        debt(jack, amy, "50.00");
        mvc.perform(post("/api/trips/{id}/settlements", trip.getTripId()).with(authentication(auth(jack))).contentType("application/json")
                .content("{\"payeeId\":%d,\"amount\":50.01}".formatted(amy.getUserId())))
                .andExpect(status().isBadRequest()); assertEquals(0, settlementRepository.count());
    }
    @Test void apiRequiresAuthenticationAndActiveTripMembership() throws Exception {
        for (String route : List.of("balances", "settlements")) {
            mvc.perform(get("/api/trips/{id}/" + route, trip.getTripId())).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/trips/{id}/" + route, trip.getTripId()).with(authentication(auth(outsider)))).andExpect(status().isForbidden());
            mvc.perform(get("/api/trips/{id}/" + route, otherTrip.getTripId()).with(authentication(auth(jack)))).andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/trips/{id}/settlements", trip.getTripId()).contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/trips/{id}/settlements", otherTrip.getTripId()).with(authentication(auth(jack))).contentType("application/json")
                .content("{\"payeeId\":%d,\"amount\":1}".formatted(outsider.getUserId())))
                .andExpect(status().isForbidden());
        memberStatus(jack, "PENDING");
        mvc.perform(get("/api/trips/{id}/balances", trip.getTripId()).with(authentication(auth(jack)))).andExpect(status().isForbidden());
        mvc.perform(get("/api/trips/{id}/settlements", trip.getTripId()).with(authentication(auth(jack)))).andExpect(status().isForbidden());
    }

    @Test void correctionOfFullyAppliedPaymentPreservesIdentityAndCreationTime() {
        debt(jack, amy, "100.00"); var saved = pay(jack, amy, "100.00");
        var corrected = edit(jack, saved.getSettlementId(), "80.00");
        assertEquals(saved.getSettlementId(), corrected.getSettlementId());
        assertEquals(saved.getPayerId(), corrected.getPayerId()); assertEquals(saved.getPayeeId(), corrected.getPayeeId());
        assertSameMicrosecond(saved.getSettledAt(), corrected.getSettledAt());
        owes(jack, amy, "20.00");
        edit(jack, saved.getSettlementId(), "95.00"); owes(jack, amy, "5.00");
        var before = jdbc.queryForList("select * from settlements");
        assertThrows(IllegalArgumentException.class, () -> edit(jack, saved.getSettlementId(), "100.01"));
        assertEquals(before, jdbc.queryForList("select * from settlements")); owes(jack, amy, "5.00");
    }
    @Test void multipleSettlementsAndExpenseChangesRevalidateTheReplacement() {
        var expense = debt(jack, amy, "100.00"); var first = pay(jack, amy, "30.00"); pay(jack, amy, "20.00");
        edit(jack, first.getSettlementId(), "60.00"); owes(jack, amy, "20.00");
        expenses.update(trip.getTripId(), expense.getExpenseId(), request(amy, jack, "40.00"), amy.getUserId());
        assertEquals(new BigDecimal("40.00"), view(jack).getNetBalance());
        assertThrows(IllegalArgumentException.class, () -> edit(jack, first.getSettlementId(), "60.01"));
        // Excluding this payment leaves only 20 of eligible debt after the expense correction.
        assertThrows(IllegalArgumentException.class, () -> edit(jack, first.getSettlementId(), "50.00"));
        assertEquals(new BigDecimal("40.00"), view(jack).getNetBalance());
        edit(jack, first.getSettlementId(), "10.00"); owes(jack, amy, "10.00");
        assertEquals(2, settlementRepository.count());
    }
    @ParameterizedTest @ValueSource(strings = {"0", "-1", "1.001", "100000000"})
    void invalidEditsLeaveLedgerUnchanged(String value) {
        debt(jack, amy, "50.00"); var payment = pay(jack, amy, "20.00");
        var before = jdbc.queryForList("select * from settlements");
        assertThrows(IllegalArgumentException.class, () -> edit(jack, payment.getSettlementId(), value));
        assertEquals(before, jdbc.queryForList("select * from settlements")); owes(jack, amy, "30.00");
    }
    @Test void editsRequireOriginalPayerMembershipAndMatchingTrip() throws Exception {
        debt(jack, amy, "50.00"); var saved = pay(jack, amy, "20.00");
        var before = jdbc.queryForList("select * from settlements");
        for (User caller : List.of(amy, mia, outsider))
            mvc.perform(put("/api/trips/{trip}/settlements/{id}", trip.getTripId(), saved.getSettlementId())
                    .with(authentication(auth(caller))).contentType("application/json").content("{\"amount\":10}"))
                    .andExpect(status().isForbidden());
        join(otherTrip, jack, "MEMBER");
        mvc.perform(put("/api/trips/{trip}/settlements/{id}", otherTrip.getTripId(), saved.getSettlementId())
                .with(authentication(auth(jack))).contentType("application/json").content("{\"amount\":10}"))
                .andExpect(status().isNotFound());
        mvc.perform(put("/api/trips/{trip}/settlements/{id}", trip.getTripId(), saved.getSettlementId())
                .contentType("application/json").content("{\"amount\":10}"))
                .andExpect(status().isUnauthorized());
        memberStatus(jack, "PENDING");
        assertThrows(AccessDeniedException.class, () -> edit(jack, saved.getSettlementId(), "10.00"));
        assertEquals(before, jdbc.queryForList("select * from settlements"));
    }
    @Test void updateRouteCannotChangePayerTripIdOrCreationTime() throws Exception {
        debt(jack, amy, "50.00"); var saved = pay(jack, amy, "20.00");
        mvc.perform(put("/api/trips/{trip}/settlements/{id}", trip.getTripId(), saved.getSettlementId())
                .with(authentication(auth(jack))).contentType("application/json")
                .content("{\"amount\":25,\"payerId\":%d,\"payeeId\":%d,\"tripId\":%d,\"settlementId\":999,\"settledAt\":\"2000-01-01T00:00:00\"}".formatted(mia.getUserId(), amy.getUserId(), otherTrip.getTripId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.payerId").value(jack.getUserId()))
                .andExpect(jsonPath("$.payeeId").value(amy.getUserId())).andExpect(jsonPath("$.settlementId").value(saved.getSettlementId()));
        assertSameMicrosecond(saved.getSettledAt(), payments.list(trip.getTripId(), jack.getUserId()).get(0).getSettledAt());
        owes(jack, amy, "25.00");
        for (String body : List.of("{}", "{\"amount\":null}", "{\"amount\":1.001}", "{\"amount\":0}"))
            mvc.perform(put("/api/trips/{trip}/settlements/{id}", trip.getTripId(), saved.getSettlementId())
                    .with(authentication(auth(jack))).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        owes(jack, amy, "25.00");
    }
    @Test void manualPaymentCanChooseAnyNetCreditorButCannotExceedReceiverNet() {
        debt(jack, amy, "50.00"); debt(jack, mia, "20.00"); debt(mia, amy, "15.00");
        assertEquals(2, view(jack).getEligiblePayees().size());
        assertThrows(IllegalArgumentException.class, () -> pay(jack, mia, "5.01"));
        pay(jack, mia, "5.00");
        assertEquals(new BigDecimal("-65.00"), view(jack).getNetBalance());
        assertEquals(new BigDecimal("0.00"), view(mia).getNetBalance());
        assertThrows(IllegalArgumentException.class, () -> pay(jack, mia, "0.01"));
        assertThrows(IllegalArgumentException.class, () -> pay(amy, jack, "0.01"));
    }
    @Test void expenseOnlyComparisonSurvivesPaymentsAndChangesOnlyWithExpenses() {
        join(trip, outsider, "MEMBER");
        debt(jack, mia, "60.00"); debt(mia, amy, "100.00"); debt(outsider, amy, "10.00");
        var source = debt(outsider, mia, "10.00");
        var before = balances.simplify(trip.getTripId(), jack.getUserId());
        assertEquals(4, before.originalPairwiseRelationships()); assertEquals(4, before.originalDebts().size());
        assertEquals(3, before.baselineSimplifiedRelationships());
        pay(jack, amy, "60.00");
        var after = balances.simplify(trip.getTripId(), jack.getUserId());
        assertEquals(before.originalDebts(), after.originalDebts()); assertEquals(3, after.baselineSimplifiedRelationships());
        assertEquals(2, after.transfers().size());
        expenses.delete(trip.getTripId(), source.getExpenseId(), amy.getUserId());
        assertEquals(3, balances.simplify(trip.getTripId(), jack.getUserId()).originalDebts().size());
    }
    @Test void oppositePairsAndLegacyPaymentsNeverCreateOriginalExpenseEdges() {
        debt(jack, mia, "60.01"); debt(mia, jack, "10.01"); debt(mia, amy, "100.00");
        Settlement legacy = new Settlement(); legacy.setTrip(trip); legacy.setPayer(mia); legacy.setPayee(amy);
        legacy.setAmount(new BigDecimal("80.00")); settlementRepository.saveAndFlush(legacy);
        // A direct-debt payment allowed by the old code can exceed today's net debt. Keep its true signed effect.
        var plan = balances.simplify(trip.getTripId(), jack.getUserId());
        assertEquals(2, plan.originalDebts().size());
        assertTrue(plan.originalDebts().stream().anyMatch(t -> t.fromUserId().equals(jack.getUserId()) && t.amount().equals(new BigDecimal("50.00"))));
        assertEquals(new BigDecimal("-50.00"), view(jack).getNetBalance());
        assertEquals(new BigDecimal("30.00"), view(mia).getNetBalance());
        assertEquals(new BigDecimal("20.00"), view(amy).getNetBalance());
        assertEquals(2, plan.transfers().size());
        assertThrows(IllegalArgumentException.class, () -> edit(mia, legacy.getSettlementId(), "60.00"));
        edit(mia, legacy.getSettlementId(), "40.00");
        assertEquals(new BigDecimal("-10.00"), view(mia).getNetBalance());
    }
    @Test void staleCrossEdgeRecommendationRejectedWithoutWriting() {
        debt(jack, mia, "60.00"); debt(mia, amy, "100.00");
        var stale = balances.simplify(trip.getTripId(), jack.getUserId()).transfers().get(0);
        pay(jack, amy, "30.00");
        var before = jdbc.queryForList("select * from settlements");
        var error = assertThrows(IllegalArgumentException.class, () -> pay(jack, amy, stale.amount().toPlainString()));
        assertTrue(error.getMessage().contains("Refresh"));
        assertEquals(before, jdbc.queryForList("select * from settlements")); owes(jack, amy, "30.00");
    }
    @Test void concurrentCrossEdgeCreatesCannotOverpayAndReplayIsRevalidated() throws Exception {
        debt(jack, mia, "60.00"); debt(mia, amy, "100.00");
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        Callable<Boolean> attempt = () -> { start.await(); try { pay(jack, amy, "60.00"); return true; } catch (IllegalArgumentException e) { return false; } };
        try {
            var a = pool.submit(attempt); var b = pool.submit(attempt); start.countDown();
            assertNotEquals(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
            assertThrows(IllegalArgumentException.class, () -> pay(jack, amy, "60.00"));
            assertEquals(1, settlementRepository.count()); assertEquals(new BigDecimal("0.00"), view(jack).getNetBalance());
        } finally { pool.shutdownNow(); }
    }
    @Test void concurrentEditAndCreateShareTripLock() throws Exception {
        debt(jack, amy, "100.00"); var saved = pay(jack, amy, "60.00");
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        try {
            var a = pool.submit(() -> { start.await(); try { edit(jack, saved.getSettlementId(), "90.00"); return true; } catch (IllegalArgumentException e) { return false; } });
            var b = pool.submit(() -> { start.await(); try { pay(jack, amy, "30.00"); return true; } catch (IllegalArgumentException e) { return false; } });
            start.countDown(); assertNotEquals(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
            owes(jack, amy, "10.00");
        } finally { pool.shutdownNow(); }
    }
    @Test void concurrentEditsReadLatestOldAmountAndCannotDoubleApply() throws Exception {
        debt(jack, amy, "100.00"); var saved = pay(jack, amy, "60.00");
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        Callable<SettlementResponse> attempt = () -> { start.await(); return edit(jack, saved.getSettlementId(), "100.00"); };
        try {
            var a = pool.submit(attempt); var b = pool.submit(attempt); start.countDown();
            assertEquals(new BigDecimal("100.00"), a.get(15, TimeUnit.SECONDS).getAmount());
            assertEquals(new BigDecimal("100.00"), b.get(15, TimeUnit.SECONDS).getAmount());
            assertEquals(1, settlementRepository.count()); owes(jack, amy, "0.00");
        } finally { pool.shutdownNow(); }
    }

    SettlementResponse correct(User payer, Long id, User payee, String value) {
        var request = amount(value); request.setPayeeId(payee.getUserId());
        return payments.update(trip.getTripId(), id, request, payer.getUserId());
    }
    void assertZeroSumAndRecommendations() {
        var plan = balances.simplify(trip.getTripId(), jack.getUserId());
        BigDecimal total = BigDecimal.ZERO;
        for (User user : List.of(amy, jack, mia)) {
            BigDecimal net = view(user).getNetBalance(); total = total.add(net);
            BigDecimal suggestedNet = BigDecimal.ZERO;
            for (var transfer : plan.transfers()) {
                if (transfer.fromUserId().equals(user.getUserId())) suggestedNet = suggestedNet.subtract(transfer.amount());
                if (transfer.toUserId().equals(user.getUserId())) suggestedNet = suggestedNet.add(transfer.amount());
            }
            assertEquals(0, net.compareTo(suggestedNet));
        }
        assertEquals(0, total.signum());
    }
    @Test void recipientOnlyCorrectionRestoresOldPayeeAndAppliesNewPayeeExactlyOnce() {
        debt(jack, amy, "60.00"); debt(jack, mia, "40.00");
        var saved = pay(jack, amy, "30.00");
        var beforeExpenses = jdbc.queryForList("select * from expenses order by expense_id");
        var beforeShares = jdbc.queryForList("select * from expense_shares order by expense_share_id");
        var beforePlan = balances.simplify(trip.getTripId(), jack.getUserId());
        var corrected = correct(jack, saved.getSettlementId(), mia, "30.00");
        assertEquals(saved.getSettlementId(), corrected.getSettlementId());
        assertSameMicrosecond(saved.getSettledAt(), corrected.getSettledAt());
        assertEquals(jack.getUserId(), corrected.getPayerId()); assertEquals(mia.getUserId(), corrected.getPayeeId());
        assertEquals(new BigDecimal("-70.00"), view(jack).getNetBalance());
        assertEquals(new BigDecimal("60.00"), view(amy).getNetBalance());
        assertEquals(new BigDecimal("10.00"), view(mia).getNetBalance());
        assertEquals(1, settlementRepository.count());
        assertEquals(beforeExpenses, jdbc.queryForList("select * from expenses order by expense_id"));
        assertEquals(beforeShares, jdbc.queryForList("select * from expense_shares order by expense_share_id"));
        var afterPlan = balances.simplify(trip.getTripId(), jack.getUserId());
        assertEquals(beforePlan.originalDebts(), afterPlan.originalDebts());
        assertEquals(beforePlan.baselineSimplifiedRelationships(), afterPlan.baselineSimplifiedRelationships());
        assertZeroSumAndRecommendations();
    }
    @Test void recipientAndAmountCanChangeTogetherWithOtherPaymentsPresent() {
        debt(jack, amy, "60.00"); debt(jack, mia, "40.00");
        var saved = pay(jack, amy, "30.00"); pay(jack, mia, "5.00");
        correct(jack, saved.getSettlementId(), mia, "35.00");
        assertEquals(new BigDecimal("-60.00"), view(jack).getNetBalance());
        assertEquals(new BigDecimal("0.00"), view(mia).getNetBalance());
        correct(jack, saved.getSettlementId(), amy, "20.00");
        assertEquals(new BigDecimal("-75.00"), view(jack).getNetBalance());
        assertEquals(new BigDecimal("40.00"), view(amy).getNetBalance());
        assertEquals(new BigDecimal("35.00"), view(mia).getNetBalance());
        assertZeroSumAndRecommendations();
    }
    @Test void updateApiAcceptsRecipientAndAmountTogether() throws Exception {
        debt(jack, amy, "60.00"); debt(jack, mia, "40.00"); var saved = pay(jack, amy, "30.00");
        mvc.perform(put("/api/trips/{trip}/settlements/{id}", trip.getTripId(), saved.getSettlementId())
                .with(authentication(auth(jack))).contentType("application/json")
                .content("{\"amount\":35,\"payeeId\":%d}".formatted(mia.getUserId())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.payeeId").value(mia.getUserId()))
                .andExpect(jsonPath("$.amount").value(35)).andExpect(jsonPath("$.payerId").value(jack.getUserId()));
        assertZeroSumAndRecommendations();
    }
    @Test void invalidRecipientCorrectionsNeverWrite() {
        debt(jack, amy, "60.00"); debt(jack, mia, "40.00"); var saved = pay(jack, amy, "30.00");
        var before = jdbc.queryForList("select * from settlements");
        assertThrows(IllegalArgumentException.class, () -> correct(jack, saved.getSettlementId(), jack, "30.00"));
        assertThrows(AccessDeniedException.class, () -> correct(jack, saved.getSettlementId(), outsider, "30.00"));
        assertThrows(IllegalArgumentException.class, () -> correct(jack, saved.getSettlementId(), mia, "40.01"));
        var missing = amount("30.00"); missing.setPayeeId(Long.MAX_VALUE);
        assertThrows(AccessDeniedException.class, () -> payments.update(trip.getTripId(), saved.getSettlementId(), missing, jack.getUserId()));
        memberStatus(mia, "PENDING");
        assertThrows(AccessDeniedException.class, () -> correct(jack, saved.getSettlementId(), mia, "30.00"));
        assertEquals(before, jdbc.queryForList("select * from settlements"));
    }
    @Test void laterPaymentsCanInvalidateRecipientCorrection() {
        debt(jack, amy, "60.00"); debt(jack, mia, "40.00"); var saved = pay(jack, amy, "30.00");
        pay(jack, mia, "30.00");
        var before = jdbc.queryForList("select * from settlements order by settlement_id");
        var error = assertThrows(IllegalArgumentException.class, () -> correct(jack, saved.getSettlementId(), mia, "30.00"));
        assertTrue(error.getMessage().contains("Refresh"));
        assertEquals(before, jdbc.queryForList("select * from settlements order by settlement_id"));
        correct(jack, saved.getSettlementId(), mia, "10.00");
        assertEquals(new BigDecimal("-60.00"), view(jack).getNetBalance());
        assertZeroSumAndRecommendations();
    }
    @Test void correctionMayMoveAwayFromFormerMemberButNewRecipientMustBeActive() {
        debt(jack, amy, "60.00"); debt(jack, mia, "40.00"); var saved = pay(jack, amy, "30.00");
        memberStatus(amy, "DECLINED");
        correct(jack, saved.getSettlementId(), mia, "30.00");
        assertEquals(mia.getUserId(), payments.list(trip.getTripId(), jack.getUserId()).get(0).getPayeeId());
    }
    @Test void voidReversesExactlyOnceAndPreservesExpenseBudgetAndAuditHistory() throws Exception {
        debt(jack, amy, "60.00"); var saved = pay(jack, amy, "30.00");
        var beforeExpenses = jdbc.queryForList("select * from expenses order by expense_id");
        var beforeShares = jdbc.queryForList("select * from expense_shares order by expense_share_id");
        var beforePlan = balances.simplify(trip.getTripId(), jack.getUserId());
        var beforeSummary = expenses.summary(trip.getTripId(), jack.getUserId());
        mvc.perform(delete("/api/trips/{trip}/settlements/{id}", trip.getTripId(), saved.getSettlementId()).with(authentication(auth(jack))))
                .andExpect(status().isNoContent());
        owes(jack, amy, "60.00"); assertZeroSumAndRecommendations();
        var audit = payments.list(trip.getTripId(), jack.getUserId()).get(0);
        assertNotNull(audit.getVoidedAt()); assertSameMicrosecond(saved.getSettledAt(), audit.getSettledAt());
        assertEquals(saved.getAmount(), audit.getAmount()); assertEquals(1, settlementRepository.count());
        var afterPlan = balances.simplify(trip.getTripId(), jack.getUserId());
        assertEquals(beforePlan.originalDebts(), afterPlan.originalDebts());
        assertEquals(beforePlan.baselineSimplifiedRelationships(), afterPlan.baselineSimplifiedRelationships());
        var afterSummary = expenses.summary(trip.getTripId(), jack.getUserId());
        assertEquals(beforeSummary.getTotalSpending(), afterSummary.getTotalSpending());
        assertEquals(beforeSummary.getBudget(), afterSummary.getBudget()); assertEquals(beforeSummary.getRemaining(), afterSummary.getRemaining());
        assertEquals(beforeSummary.getBudgetUsedPercentage(), afterSummary.getBudgetUsedPercentage());
        assertEquals(beforeExpenses, jdbc.queryForList("select * from expenses order by expense_id"));
        assertEquals(beforeShares, jdbc.queryForList("select * from expense_shares order by expense_share_id"));
        var beforeRetry = jdbc.queryForList("select * from settlements");
        mvc.perform(delete("/api/trips/{trip}/settlements/{id}", trip.getTripId(), saved.getSettlementId()).with(authentication(auth(jack))))
                .andExpect(status().isBadRequest());
        assertThrows(IllegalStateException.class, () -> edit(jack, saved.getSettlementId(), "20.00"));
        assertEquals(beforeRetry, jdbc.queryForList("select * from settlements")); owes(jack, amy, "60.00");
        mvc.perform(get("/api/trips/{trip}/settlements", trip.getTripId()).with(authentication(auth(jack))))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].voidedAt").isNotEmpty());
        pay(jack, amy, "60.00"); owes(jack, amy, "0.00"); // A void must also be excluded from create validation.
    }
    @Test void voidRequiresAuthenticationOwnershipActiveMembershipAndMatchingTrip() throws Exception {
        debt(jack, amy, "60.00"); var saved = pay(jack, amy, "30.00");
        var before = jdbc.queryForList("select * from settlements");
        mvc.perform(delete("/api/trips/{trip}/settlements/{id}", trip.getTripId(), saved.getSettlementId())).andExpect(status().isUnauthorized());
        for (User caller : List.of(amy, mia, outsider))
            mvc.perform(delete("/api/trips/{trip}/settlements/{id}", trip.getTripId(), saved.getSettlementId()).with(authentication(auth(caller))))
                    .andExpect(status().isForbidden());
        join(otherTrip, jack, "MEMBER");
        mvc.perform(delete("/api/trips/{trip}/settlements/{id}", otherTrip.getTripId(), saved.getSettlementId()).with(authentication(auth(jack))))
                .andExpect(status().isNotFound());
        memberStatus(jack, "PENDING");
        assertThrows(AccessDeniedException.class, () -> payments.voidSettlement(trip.getTripId(), saved.getSettlementId(), jack.getUserId()));
        assertEquals(before, jdbc.queryForList("select * from settlements"));
    }
    @Test void legacyInsertWithoutVoidColumnRemainsActiveUntilExplicitlyVoided() {
        debt(jack, amy, "60.00");
        jdbc.update("insert into settlements (trip_id, payer_id, payee_id, amount, settled_at) values (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                trip.getTripId(), jack.getUserId(), amy.getUserId(), new BigDecimal("30.00"));
        var saved = payments.list(trip.getTripId(), jack.getUserId()).get(0);
        assertNull(saved.getVoidedAt()); owes(jack, amy, "30.00");
        edit(jack, saved.getSettlementId(), "20.00"); owes(jack, amy, "40.00");
        payments.voidSettlement(trip.getTripId(), saved.getSettlementId(), jack.getUserId()); owes(jack, amy, "60.00");
    }
    @Test void concurrentVoidRequestsReverseThePaymentOnlyOnce() throws Exception {
        debt(jack, amy, "60.00"); var saved = pay(jack, amy, "30.00");
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        Callable<Boolean> attempt = () -> { start.await(); try { payments.voidSettlement(trip.getTripId(), saved.getSettlementId(), jack.getUserId()); return true; } catch (IllegalStateException e) { return false; } };
        try {
            var a = pool.submit(attempt); var b = pool.submit(attempt); start.countDown();
            assertNotEquals(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
            owes(jack, amy, "60.00"); assertEquals(1, settlementRepository.count()); assertZeroSumAndRecommendations();
        } finally { pool.shutdownNow(); }
    }
    @Test void concurrentRecipientEditVoidAndCreateUseOneTripLock() throws Exception {
        debt(jack, amy, "60.00"); debt(jack, mia, "40.00"); var saved = pay(jack, amy, "30.00");
        ExecutorService pool = Executors.newFixedThreadPool(3); CountDownLatch start = new CountDownLatch(1);
        try {
            var edit = pool.submit(() -> { start.await(); try { correct(jack, saved.getSettlementId(), mia, "30.00"); return true; } catch (IllegalArgumentException | IllegalStateException e) { return false; } });
            var remove = pool.submit(() -> { start.await(); payments.voidSettlement(trip.getTripId(), saved.getSettlementId(), jack.getUserId()); return true; });
            var create = pool.submit(() -> { start.await(); try { pay(jack, amy, "60.00"); return true; } catch (IllegalArgumentException e) { return false; } });
            start.countDown(); edit.get(15, TimeUnit.SECONDS); assertTrue(remove.get(15, TimeUnit.SECONDS));
            boolean created = create.get(15, TimeUnit.SECONDS);
            assertNotNull(settlementRepository.findById(saved.getSettlementId()).orElseThrow().getVoidedAt());
            assertEquals(new BigDecimal(created ? "-40.00" : "-100.00"), view(jack).getNetBalance());
            assertEquals(new BigDecimal(created ? "0.00" : "60.00"), view(amy).getNetBalance());
            assertEquals(new BigDecimal("40.00"), view(mia).getNetBalance()); assertZeroSumAndRecommendations();
        } finally { pool.shutdownNow(); }
    }
}
