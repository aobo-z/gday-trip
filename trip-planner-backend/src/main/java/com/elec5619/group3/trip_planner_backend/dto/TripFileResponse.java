package com.elec5619.group3.trip_planner_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * FR-18: File details shown in the trip file view and on activity pages.
 * Never contains the file's contents; those come from the download endpoint.
 */
@Getter
@AllArgsConstructor
@Builder
public class TripFileResponse {

    private Long fileId;
    private Long tripId;
    private String fileName;
    private String contentType;
    private long sizeBytes;
    private LocalDateTime uploadedAt;
    private Long uploaderId;
    private String uploaderName;
    // Null when the file isn't linked to an activity.
    private Long activityId;
    private String activityName;
    // Whether the current user may remove it (the uploader or a trip owner).
    private boolean canDelete;
}
