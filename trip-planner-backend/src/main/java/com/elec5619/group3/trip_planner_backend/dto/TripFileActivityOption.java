package com.elec5619.group3.trip_planner_backend.dto;

import java.time.LocalDate;

/**
 * FR-18: An activity a file can be linked to, for the upload form.
 */
public record TripFileActivityOption(Long activityId, String name, LocalDate date) {
}
