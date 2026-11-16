package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.AuthResponse;
import com.elec5619.group3.trip_planner_backend.dto.ChangeEmailRequest;
import com.elec5619.group3.trip_planner_backend.dto.ChangePasswordRequest;
import com.elec5619.group3.trip_planner_backend.dto.ReviewResponse;
import com.elec5619.group3.trip_planner_backend.dto.UpdatePreferencesRequest;
import com.elec5619.group3.trip_planner_backend.dto.UpdateProfileRequest;
import com.elec5619.group3.trip_planner_backend.dto.UserProfileResponse;
import com.elec5619.group3.trip_planner_backend.dto.UserReviewSummaryResponse;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.AuthService;
import com.elec5619.group3.trip_planner_backend.service.ReviewService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Deliberately NOT under /api/auth/** (which is permitAll) — this path
// falls under the default anyRequest().authenticated() rule, so hitting
// it is itself a live test of "is this token still valid".
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final AuthService authService;
    private final ReviewService reviewService;

    public UserController(AuthService authService, ReviewService reviewService) {
        this.authService = authService;
        this.reviewService = reviewService;
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getCurrentUser() {
        AuthenticatedUser principal = (AuthenticatedUser)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        UserProfileResponse profile = authService.getCurrentUserProfile(principal.getUserId());
        return ResponseEntity.ok(profile);
    }

    @PutMapping("/me")
    public ResponseEntity<UserProfileResponse> updateCurrentUser(@Valid @RequestBody UpdateProfileRequest request) {
        AuthenticatedUser principal = (AuthenticatedUser)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        UserProfileResponse profile = authService.updateProfile(principal.getUserId(), request);
        return ResponseEntity.ok(profile);
    }

    /**
     * FR-21: Save display preferences (the interface accent colour).
     * URL: PUT http://localhost:8080/api/users/me/preferences
     */
    @PutMapping("/me/preferences")
    public ResponseEntity<UserProfileResponse> updatePreferences(@Valid @RequestBody UpdatePreferencesRequest request) {
        AuthenticatedUser principal = (AuthenticatedUser)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        return ResponseEntity.ok(authService.updatePreferences(principal.getUserId(), request));
    }

    @PutMapping("/me/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        AuthenticatedUser principal = (AuthenticatedUser)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        authService.changePassword(principal.getUserId(), request);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/me/email")
    public ResponseEntity<AuthResponse> changeEmail(@Valid @RequestBody ChangeEmailRequest request) {
        AuthenticatedUser principal = (AuthenticatedUser)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        AuthResponse response = authService.changeEmail(principal.getUserId(), request);
        return ResponseEntity.ok(response);
    }

    /**
     * A user's average rating and received reviews, for profile display. No email or
     * account details are included, so any signed-in user may view another's profile.
     * URL: GET http://localhost:8080/api/users/{userId}/reviews
     */
    @GetMapping("/{userId}/reviews")
    public ResponseEntity<UserReviewSummaryResponse> getUserReviews(@PathVariable Long userId) {
        AuthenticatedUser principal = (AuthenticatedUser)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        return ResponseEntity.ok(reviewService.getUserReviews(userId, principal.getUserId()));
    }

    /**
     * Reviews the signed-in user has written to other travellers, newest first.
     * URL: GET http://localhost:8080/api/users/me/reviews/written
     */
    @GetMapping("/me/reviews/written")
    public ResponseEntity<List<ReviewResponse>> getWrittenReviews() {
        AuthenticatedUser principal = (AuthenticatedUser)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();

        return ResponseEntity.ok(reviewService.getWrittenReviews(principal.getUserId()));
    }
}
