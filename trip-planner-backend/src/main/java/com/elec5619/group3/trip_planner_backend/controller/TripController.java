package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.CreateTripRequest;
import com.elec5619.group3.trip_planner_backend.dto.UpdateTripRequest;
import com.elec5619.group3.trip_planner_backend.dto.TripResponse;
import com.elec5619.group3.trip_planner_backend.dto.TripSummaryResponse;
import com.elec5619.group3.trip_planner_backend.dto.VotingThresholdRequest;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.TripService;
import com.elec5619.group3.trip_planner_backend.service.TripSummaryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/trips")
public class TripController {

    private final TripService tripService;
    private final TripSummaryService tripSummaryService;

    public TripController(TripService tripService, TripSummaryService tripSummaryService) {
        this.tripService = tripService;
        this.tripSummaryService = tripSummaryService;
    }

    /**
     * FR-3: Create a new trip.
     * URL: POST http://localhost:8080/api/trips
     */
    @PostMapping
    public ResponseEntity<TripResponse> createTrip(@Valid @RequestBody CreateTripRequest request) {
        Long currentUserId = getCurrentUserId();
        TripResponse response = tripService.createTrip(request, currentUserId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * FR-3: Get all trips the logged-in user belongs to (for Dashboard).
     * URL: GET http://localhost:8080/api/trips
     */
    @GetMapping
    public ResponseEntity<List<TripResponse>> getUserTrips() {
        Long currentUserId = getCurrentUserId();
        List<TripResponse> trips = tripService.getUserTrips(currentUserId);
        return ResponseEntity.ok(trips);
    }

    /**
     * Card figures (members, plan progress, spending) for all the user's trips in one call.
     * URL: GET http://localhost:8080/api/trips/summaries
     */
    @GetMapping("/summaries")
    public ResponseEntity<List<TripSummaryResponse>> getTripSummaries() {
        return ResponseEntity.ok(tripSummaryService.summaries(getCurrentUserId()));
    }

    /**
     * FR-3: Get a single trip's overview details by ID.
     * URL: GET http://localhost:8080/api/trips/{tripId}
     */
    @GetMapping("/{tripId}")
    public ResponseEntity<TripResponse> getTripById(@PathVariable Long tripId) {
        Long currentUserId = getCurrentUserId();
        TripResponse trip = tripService.getTripById(tripId, currentUserId);
        return ResponseEntity.ok(trip);
    }

    /**
     * FR-3: Update an existing trip (Owner only).
     * URL: PUT http://localhost:8080/api/trips/{tripId}
     */
    @PutMapping("/{tripId}")
    public ResponseEntity<TripResponse> updateTrip(@PathVariable Long tripId, @Valid @RequestBody UpdateTripRequest request) {
        Long currentUserId = getCurrentUserId();
        TripResponse response = tripService.updateTrip(tripId, request, currentUserId);
        return ResponseEntity.ok(response);
    }

    /**
     * Start a trip (Owner only). PLANNING -> ONGOING.
     * URL: PUT http://localhost:8080/api/trips/{tripId}/start
     */
    @PutMapping("/{tripId}/start")
    public ResponseEntity<TripResponse> startTrip(@PathVariable Long tripId) {
        return ResponseEntity.ok(tripService.startTrip(tripId, getCurrentUserId()));
    }

    /**
     * Publish an archived trip to Community (Owner only). ARCHIVED -> PUBLISHED.
     * URL: PUT http://localhost:8080/api/trips/{tripId}/publish
     */
    @PutMapping("/{tripId}/publish")
    public ResponseEntity<TripResponse> publishTrip(@PathVariable Long tripId) {
        Long currentUserId = getCurrentUserId();
        TripResponse response = tripService.publishTrip(tripId, currentUserId);
        return ResponseEntity.ok(response);
    }

    /**
     * Remove a shared trip from Community (Owner only). PUBLISHED -> ARCHIVED.
     * URL: PUT http://localhost:8080/api/trips/{tripId}/unpublish
     */
    @PutMapping("/{tripId}/unpublish")
    public ResponseEntity<TripResponse> unpublishTrip(@PathVariable Long tripId) {
        Long currentUserId = getCurrentUserId();
        TripResponse response = tripService.unpublishTrip(tripId, currentUserId);
        return ResponseEntity.ok(response);
    }

    /**
     * FR-2/FR-20: Archive a trip (Owner only). ONGOING -> ARCHIVED.
     * URL: PUT http://localhost:8080/api/trips/{tripId}/archive
     */
    @PutMapping("/{tripId}/archive")
    public ResponseEntity<TripResponse> archiveTrip(@PathVariable Long tripId) {
        Long currentUserId = getCurrentUserId();
        TripResponse response = tripService.archiveTrip(tripId, currentUserId);
        return ResponseEntity.ok(response);
    }

    /**
     * FR-3: Delete an existing trip (Owner only).
     * URL: DELETE http://localhost:8080/api/trips/{tripId}
     */
    @DeleteMapping("/{tripId}")
    public ResponseEntity<Void> deleteTrip(@PathVariable Long tripId) {
        Long currentUserId = getCurrentUserId();
        tripService.deleteTrip(tripId, currentUserId);
        return ResponseEntity.noContent().build();
    }

    /**
     * FR-3: Upload or replace the trip's cover photo (Owner only).
     * URL: POST http://localhost:8080/api/trips/{tripId}/cover  (multipart field "file")
     */
    @PostMapping(value = "/{tripId}/cover", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TripResponse> uploadCoverImage(
            @PathVariable Long tripId,
            @RequestParam("file") MultipartFile file) {
        Long currentUserId = getCurrentUserId();
        return ResponseEntity.ok(tripService.updateCoverImage(tripId, file, currentUserId));
    }

    /**
     * FR-3: Remove the trip's cover photo (Owner only).
     * URL: DELETE http://localhost:8080/api/trips/{tripId}/cover
     */
    @DeleteMapping("/{tripId}/cover")
    public ResponseEntity<TripResponse> removeCoverImage(@PathVariable Long tripId) {
        Long currentUserId = getCurrentUserId();
        return ResponseEntity.ok(tripService.removeCoverImage(tripId, currentUserId));
    }


    @PutMapping("/{tripId}/voting-threshold")
    public ResponseEntity<TripResponse> updateVotingThreshold(
            @PathVariable Long tripId, @Valid @RequestBody VotingThresholdRequest request) {
        return ResponseEntity.ok(tripService.updateVotingThreshold(
                tripId, request.getVotingThreshold(), getCurrentUserId()));
    }

    /**
     * Helper method to extract the logged-in user's ID from their JWT token.
     */
    private Long getCurrentUserId() {
        AuthenticatedUser principal = (AuthenticatedUser)SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return principal.getUserId();
    }
}
