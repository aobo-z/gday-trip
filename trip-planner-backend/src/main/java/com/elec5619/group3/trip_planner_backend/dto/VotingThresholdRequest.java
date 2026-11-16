package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;

@Getter
@Setter
public class VotingThresholdRequest {
    @NotNull
    @DecimalMin(value = "0", inclusive = false)
    @DecimalMax("1")
    @Digits(integer = 1, fraction = 2)
    private BigDecimal votingThreshold;
}
