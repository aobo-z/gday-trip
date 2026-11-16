package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDate;
import java.time.LocalTime;

@Getter
@Setter
public class ActivityPreferenceRequest {
    @NotNull
    private LocalDate preferredDate;
    private LocalTime preferredStartTime;
    private LocalTime preferredEndTime;
}
