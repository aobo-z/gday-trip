package com.elec5619.group3.trip_planner_backend.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * The figures a trip card on the Trips page shows: who is in it, how much of the group plan
 * is scheduled, and what has been spent (in the trip's base currency).
 */
public record TripSummaryResponse(Long tripId, List<Member> members, long plans, long scheduledPlans, BigDecimal spent) {
    public record Member(Long userId, String username) { }
}
