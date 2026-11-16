package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PlaceSearchRequest {

    @NotBlank(message = "Search query is required")
    private String query;
}
