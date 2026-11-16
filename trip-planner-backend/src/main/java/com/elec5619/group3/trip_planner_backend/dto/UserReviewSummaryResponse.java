package com.elec5619.group3.trip_planner_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
@Builder
public class UserReviewSummaryResponse {

    private double averageRating;
    private int reviewCount;
    private List<ReviewResponse> reviews;
}
