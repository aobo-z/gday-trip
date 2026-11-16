package com.elec5619.group3.trip_planner_backend.dto;

import com.elec5619.group3.trip_planner_backend.entity.AccentColor;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UpdatePreferencesRequest {

    // An unknown colour name fails JSON parsing and is answered with 400.
    @NotNull(message = "Accent colour is required")
    private AccentColor accentColor;
}
