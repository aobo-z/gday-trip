package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PlaceRecommendationRequest {

    @NotBlank(message = "Place name is required")
    private String name;

    private String address;
    private String primaryType;
}
