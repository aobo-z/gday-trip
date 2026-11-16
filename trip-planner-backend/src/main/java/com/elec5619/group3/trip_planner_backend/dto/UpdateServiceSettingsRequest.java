package com.elec5619.group3.trip_planner_backend.dto;

import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService;
import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService.MapProvider;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UpdateServiceSettingsRequest {
    @NotNull(message = "Place search setting is required")
    private Boolean placeSearch;

    @NotNull(message = "Place photos setting is required")
    private Boolean placePhotos;

    @NotNull(message = "AI recommendations setting is required")
    private Boolean aiRecommendations;

    @NotBlank(message = "AI model is required")
    @Size(max = 80, message = "AI model must be at most 80 characters")
    @Pattern(regexp = ServiceSettingsService.AI_MODEL_PATTERN, message = "AI model may only contain lowercase letters, digits, dots and dashes")
    private String aiModel;

    @NotNull(message = "Map provider is required")
    private MapProvider mapProvider;
}
