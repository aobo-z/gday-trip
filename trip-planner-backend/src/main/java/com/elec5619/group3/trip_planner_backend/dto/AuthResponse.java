package com.elec5619.group3.trip_planner_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@AllArgsConstructor
public class AuthResponse {

    private String token;
    private Long userId;
    private String username;
    private String email;
    private String role;
    // The user's interface theme; AURORA when they haven't picked one.
    private String accentColor;
    // When the account was created, shown as "since …" on the profile.
    private LocalDateTime createdAt;
}
