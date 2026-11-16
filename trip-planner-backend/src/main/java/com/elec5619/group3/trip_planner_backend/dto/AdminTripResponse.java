package com.elec5619.group3.trip_planner_backend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record AdminTripResponse(Long tripId, String name, String destination, String status,
                                LocalDate startDate, LocalDate endDate, LocalDateTime createdAt,
                                String owner, List<Member> members) {

    public record Member(String username, String role) {
    }
}
