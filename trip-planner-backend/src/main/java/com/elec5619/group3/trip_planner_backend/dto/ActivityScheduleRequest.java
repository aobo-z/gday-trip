package com.elec5619.group3.trip_planner_backend.dto;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

@Getter
@Setter
public class ActivityScheduleRequest {
    private LocalDate date;
    private LocalTime startTime;
    private LocalTime endTime;
    private Set<Long> memberIds;
}
