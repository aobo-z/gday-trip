package com.elec5619.group3.trip_planner_backend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public record ActivityPreferencesResponse(
        Long activityId, int eligibleMemberCount, long respondingMemberCount,
        List<Preference> currentUserPreferences, List<Slot> slots) {
    public record Preference(Long preferenceId, LocalDate preferredDate, LocalTime preferredStartTime,
                             LocalTime preferredEndTime, LocalDateTime createdAt) {}
    // Exact date/time groups, not an inferred schedule or an overlap calculation.
    public record Slot(LocalDate preferredDate, LocalTime preferredStartTime,
                       LocalTime preferredEndTime, long memberCount) {}
}
