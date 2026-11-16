package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;

/** Recipient/amount correction. Omitted payeeId retains the current recipient for older clients. */
@Getter
@Setter
public class SettlementUpdateRequest {
    @Positive private Long payeeId;
    @NotNull @DecimalMin("0.01") @Digits(integer = 8, fraction = 2)
    private BigDecimal amount;
}
