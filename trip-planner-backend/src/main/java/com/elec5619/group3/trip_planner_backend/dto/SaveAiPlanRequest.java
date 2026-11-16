package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** AI Planner: the plan as the user edited it, saved as a new trip plus activity proposals. */
@Getter
@Setter
public class SaveAiPlanRequest {

    @NotBlank(message = "Trip name is required")
    @Size(max = 100, message = "Trip name must be at most 100 characters")
    private String tripName;

    @NotBlank(message = "Destination is required")
    @Size(max = 100, message = "Destination must be at most 100 characters")
    private String destination;

    @NotNull(message = "Start date is required")
    private LocalDate startDate;

    @NotNull(message = "End date is required")
    private LocalDate endDate;

    @NotNull(message = "Planned budget is required")
    @DecimalMin(value = "0.0", message = "Planned budget cannot be negative")
    @Digits(integer = 8, fraction = 2, message = "Planned budget must be at most 99,999,999.99 with up to 2 decimal places")
    private BigDecimal plannedBudget;

    private String baseCurrency;

    @NotEmpty(message = "Keep at least one activity in the plan")
    @Size(max = 80, message = "A plan can have at most 80 activities")
    private List<@Valid @NotNull Activity> activities;

    @Getter
    @Setter
    public static class Activity {
        private LocalDate date;
        private LocalTime startTime;
        private LocalTime endTime;

        @NotBlank(message = "Activity name is required")
        @Size(max = 160, message = "Activity name must be at most 160 characters")
        private String name;

        @NotBlank(message = "Activity location is required")
        @Size(max = 200, message = "Activity location must be at most 200 characters")
        private String location;

        @NotBlank(message = "Activity category is required")
        @Size(max = 80, message = "Activity category must be at most 80 characters")
        private String category;

        // Leaves room in the 2000-character activity description for the suggested time and cost.
        @Size(max = 1500, message = "Activity description must be at most 1500 characters")
        private String description;

        @DecimalMin(value = "0.0", message = "Estimated cost cannot be negative")
        @Digits(integer = 8, fraction = 2, message = "Estimated cost must be at most 99,999,999.99")
        private BigDecimal estimatedCost;
    }
}
