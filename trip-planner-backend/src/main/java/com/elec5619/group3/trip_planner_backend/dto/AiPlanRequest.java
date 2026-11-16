package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** AI Planner: what the user asks for. Nothing is saved until they confirm the edited draft. */
@Getter
@Setter
public class AiPlanRequest {

    public enum Pace { RELAXED, BALANCED, PACKED }

    @NotBlank(message = "Destination is required")
    @Size(max = 100, message = "Destination must be at most 100 characters")
    private String destination;

    @NotNull(message = "Start date is required")
    private LocalDate startDate;

    // Capped so one generation stays well inside the AI request time limit.
    @NotNull(message = "Number of days is required")
    @Min(value = 1, message = "A trip needs at least 1 day")
    @Max(value = 10, message = "The AI Planner can plan up to 10 days at a time")
    private Integer days;

    @NotNull(message = "Number of travellers is required")
    @Min(value = 1, message = "At least 1 traveller is required")
    @Max(value = 20, message = "The AI Planner can plan for up to 20 travellers")
    private Integer travellers;

    // Optional: when missing, the AI suggests a total budget.
    @DecimalMin(value = "0.0", message = "Budget cannot be negative")
    @Digits(integer = 8, fraction = 2, message = "Budget must be at most 99,999,999.99 with up to 2 decimal places")
    private BigDecimal budget;

    private String baseCurrency;

    @Size(max = 8, message = "Choose at most 8 interests")
    private List<@NotBlank @Size(max = 40) String> interests;

    @NotNull(message = "Pace is required")
    private Pace pace;

    @Size(max = 300, message = "Notes must be at most 300 characters")
    private String notes;
}
