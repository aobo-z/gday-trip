package com.elec5619.group3.trip_planner_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@AllArgsConstructor
@Builder
public class ReviewableMemberResponse {

    private Long userId;
    private String username;
    private boolean alreadyReviewed;
}
