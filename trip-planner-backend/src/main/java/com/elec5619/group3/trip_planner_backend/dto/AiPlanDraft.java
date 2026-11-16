package com.elec5619.group3.trip_planner_backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** AI Planner: a generated plan the user reviews and edits before saving. Not stored. */
public record AiPlanDraft(
        String tripName,
        String destination,
        LocalDate startDate,
        LocalDate endDate,
        String baseCurrency,
        BigDecimal plannedBudget,
        String summary,
        List<BudgetLine> budgetBreakdown,
        List<DayTheme> days,
        List<PlannedActivity> activities) {

    public record BudgetLine(String category, BigDecimal amount) {
    }

    public record DayTheme(LocalDate date, String theme) {
    }

    /** Times and cost are null when the AI's value was unusable; the user can fill them in. */
    public record PlannedActivity(LocalDate date, LocalTime startTime, LocalTime endTime, String name,
                                  String location, String category, BigDecimal estimatedCost, String description) {
    }
}
