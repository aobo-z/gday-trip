package com.elec5619.group3.trip_planner_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import java.math.BigDecimal;
import java.util.List;

@Getter
@AllArgsConstructor
public class BalanceResponse {
    // Current signed ledger after settlements. Totals are the negative/positive parts of netBalance.
    private BigDecimal netBalance;
    private BigDecimal totalYouOwe;
    private BigDecimal totalYouAreOwed;
    // Current greedy recommendations involving the authenticated user, not original expense pairs.
    private List<Obligation> youOwe;
    private List<Obligation> youAreOwed;
    // Per-creditor maximum for manual payments; membership is checked again on write.
    private List<Obligation> eligiblePayees;

    @Getter
    @AllArgsConstructor
    public static class Obligation {
        private Long userId;
        private String name;
        private BigDecimal amount;
    }
}
