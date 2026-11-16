package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.CreateReviewRequest;
import com.elec5619.group3.trip_planner_backend.dto.ReviewResponse;
import com.elec5619.group3.trip_planner_backend.dto.ReviewableMemberResponse;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.ReviewService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/trips/{tripId}/reviews")
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    /**
     * FR-20: Submit a review for another member of a completed trip.
     * URL: POST http://localhost:8080/api/trips/{tripId}/reviews
     */
    @PostMapping
    public ResponseEntity<ReviewResponse> createReview(@PathVariable Long tripId, @Valid @RequestBody CreateReviewRequest request) {
        Long currentUserId = getCurrentUserId();
        ReviewResponse response = reviewService.createReview(tripId, currentUserId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * FR-20: List the other members of a completed trip and whether you've already reviewed each one.
     * URL: GET http://localhost:8080/api/trips/{tripId}/reviews/reviewable-members
     */
    @GetMapping("/reviewable-members")
    public ResponseEntity<List<ReviewableMemberResponse>> getReviewableMembers(@PathVariable Long tripId) {
        Long currentUserId = getCurrentUserId();
        return ResponseEntity.ok(reviewService.getReviewableMembers(tripId, currentUserId));
    }

    private Long getCurrentUserId() {
        AuthenticatedUser principal = (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return principal.getUserId();
    }
}
