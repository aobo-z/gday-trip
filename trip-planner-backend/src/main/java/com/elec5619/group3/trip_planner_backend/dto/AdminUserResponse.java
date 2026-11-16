package com.elec5619.group3.trip_planner_backend.dto;

import java.time.LocalDateTime;

public record AdminUserResponse(Long userId, String username, String email, String role,
                                boolean disabled, LocalDateTime createdAt) {
}
