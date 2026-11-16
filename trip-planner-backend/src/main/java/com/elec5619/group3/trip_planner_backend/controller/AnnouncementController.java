package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.AnnouncementRequest;
import com.elec5619.group3.trip_planner_backend.dto.AnnouncementResponse;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.AnnouncementService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/trips/{tripId}/announcements")
public class AnnouncementController {

    private final AnnouncementService announcementService;

    public AnnouncementController(AnnouncementService announcementService) {
        this.announcementService = announcementService;
    }

    /**
     * FR-19: Get a trip's announcements, newest first.
     * URL: GET http://localhost:8080/api/trips/{tripId}/announcements
     */
    @GetMapping
    public ResponseEntity<List<AnnouncementResponse>> getAnnouncements(@PathVariable Long tripId) {
        return ResponseEntity.ok(announcementService.getAnnouncements(tripId, getCurrentUserId()));
    }

    /**
     * FR-19: Publish an announcement (Owner only).
     * URL: POST http://localhost:8080/api/trips/{tripId}/announcements
     */
    @PostMapping
    public ResponseEntity<AnnouncementResponse> createAnnouncement(
            @PathVariable Long tripId,
            @Valid @RequestBody AnnouncementRequest request) {
        AnnouncementResponse response = announcementService.createAnnouncement(tripId, request, getCurrentUserId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * FR-19: Edit an announcement (Owner only).
     * URL: PUT http://localhost:8080/api/trips/{tripId}/announcements/{announcementId}
     */
    @PutMapping("/{announcementId}")
    public ResponseEntity<AnnouncementResponse> updateAnnouncement(
            @PathVariable Long tripId,
            @PathVariable Long announcementId,
            @Valid @RequestBody AnnouncementRequest request) {
        return ResponseEntity.ok(announcementService.updateAnnouncement(tripId, announcementId, request, getCurrentUserId()));
    }

    /**
     * FR-19: Remove an announcement (Owner only).
     * URL: DELETE http://localhost:8080/api/trips/{tripId}/announcements/{announcementId}
     */
    @DeleteMapping("/{announcementId}")
    public ResponseEntity<Void> deleteAnnouncement(
            @PathVariable Long tripId,
            @PathVariable Long announcementId) {
        announcementService.deleteAnnouncement(tripId, announcementId, getCurrentUserId());
        return ResponseEntity.noContent().build();
    }

    private Long getCurrentUserId() {
        AuthenticatedUser principal = (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return principal.getUserId();
    }
}
