package com.elec5619.group3.trip_planner_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@AllArgsConstructor
@Builder
public class PlaceResult {

    private String placeId;
    private String name;
    private String address;
    private double latitude;
    private double longitude;
    private String primaryType;
}
