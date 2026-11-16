package com.elec5619.group3.trip_planner_backend.dto;

/** Full external-service settings, as shown on the admin page. */
public record ServiceSettingsResponse(
        boolean placeSearch,
        boolean placePhotos,
        boolean aiRecommendations,
        String aiModel,
        String defaultAiModel,
        String mapProvider) {
}
