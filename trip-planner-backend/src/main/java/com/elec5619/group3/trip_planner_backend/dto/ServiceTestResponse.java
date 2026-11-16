package com.elec5619.group3.trip_planner_backend.dto;

/** FR-22: result of an admin "test connection" against an external service. */
public record ServiceTestResponse(boolean ok, long latencyMs, String message) {
}
