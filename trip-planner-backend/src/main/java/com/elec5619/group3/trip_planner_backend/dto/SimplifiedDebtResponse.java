package com.elec5619.group3.trip_planner_backend.dto;

import java.math.BigDecimal;
import java.util.List;

/** Original details/count and baseline simplified count exclude settlements; transfers include them. */
public record SimplifiedDebtResponse(String currency, long originalPairwiseRelationships, List<Transfer> transfers,
                                     List<Transfer> originalDebts, int baselineSimplifiedRelationships) {
    public record Transfer(Long fromUserId, String fromName, Long toUserId, String toName, BigDecimal amount) {}
}
