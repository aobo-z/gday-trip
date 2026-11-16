package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.TripFileActivityOption;
import com.elec5619.group3.trip_planner_backend.dto.TripFileResponse;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.TripFileService;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/trips/{tripId}/files")
public class TripFileController {

    private final TripFileService tripFileService;

    public TripFileController(TripFileService tripFileService) {
        this.tripFileService = tripFileService;
    }

    /**
     * FR-18: List the trip's files (optionally only one activity's).
     * URL: GET http://localhost:8080/api/trips/{tripId}/files?activityId={activityId}
     */
    @GetMapping
    public ResponseEntity<List<TripFileResponse>> getFiles(
            @PathVariable Long tripId,
            @RequestParam(required = false) Long activityId) {
        return ResponseEntity.ok(tripFileService.getFiles(tripId, activityId, getCurrentUserId()));
    }

    /**
     * FR-18: Upload a file (multipart field "file"; optional field "activityId").
     * URL: POST http://localhost:8080/api/trips/{tripId}/files
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TripFileResponse> uploadFile(
            @PathVariable Long tripId,
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) Long activityId) {
        TripFileResponse response = tripFileService.uploadFile(tripId, file, activityId, getCurrentUserId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * FR-18: View (inline=true) or download a file. Members only, so the
     * frontend fetches it with the JWT rather than linking to it directly.
     * URL: GET http://localhost:8080/api/trips/{tripId}/files/{fileId}/download?inline=true
     */
    @GetMapping("/{fileId}/download")
    public ResponseEntity<byte[]> downloadFile(
            @PathVariable Long tripId,
            @PathVariable Long fileId,
            @RequestParam(defaultValue = "false") boolean inline) {
        TripFileService.FileDownload file = tripFileService.downloadFile(tripId, fileId, getCurrentUserId());
        ContentDisposition disposition = (inline ? ContentDisposition.inline() : ContentDisposition.attachment())
                .filename(file.fileName(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                .contentLength(file.data().length)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .cacheControl(CacheControl.noStore())
                .body(file.data());
    }

    /**
     * FR-18: Remove a file (its uploader or a trip owner).
     * URL: DELETE http://localhost:8080/api/trips/{tripId}/files/{fileId}
     */
    @DeleteMapping("/{fileId}")
    public ResponseEntity<Void> deleteFile(
            @PathVariable Long tripId,
            @PathVariable Long fileId) {
        tripFileService.deleteFile(tripId, fileId, getCurrentUserId());
        return ResponseEntity.noContent().build();
    }

    /**
     * FR-18: Activities a file can be attached to (for the upload form).
     * URL: GET http://localhost:8080/api/trips/{tripId}/files/activities
     */
    @GetMapping("/activities")
    public ResponseEntity<List<TripFileActivityOption>> getActivityOptions(@PathVariable Long tripId) {
        return ResponseEntity.ok(tripFileService.getActivityOptions(tripId, getCurrentUserId()));
    }

    private Long getCurrentUserId() {
        AuthenticatedUser principal = (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return principal.getUserId();
    }
}
