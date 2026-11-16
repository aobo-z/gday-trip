package com.elec5619.group3.trip_planner_backend.dto;

/** What every signed-in user's browser needs to know: which services are available and which map to load. */
public record ServiceStatusResponse(
        boolean placeSearch,
        boolean placePhotos,
        boolean aiRecommendations,
        String mapProvider) {
}
