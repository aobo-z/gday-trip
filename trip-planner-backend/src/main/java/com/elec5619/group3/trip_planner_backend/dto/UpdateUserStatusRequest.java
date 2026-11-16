package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UpdateUserStatusRequest {
    @NotNull(message = "Disabled flag is required")
    private Boolean disabled;
}
