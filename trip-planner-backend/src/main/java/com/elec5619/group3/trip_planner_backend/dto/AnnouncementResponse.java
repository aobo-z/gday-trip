package com.elec5619.group3.trip_planner_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@AllArgsConstructor
@Builder
public class AnnouncementResponse {

    private Long announcementId;
    private Long tripId;
    private String title;
    private String content;
    private Long authorId;
    private String authorName;
    private LocalDateTime publishedAt;
    private LocalDateTime updatedAt;
    // True once the announcement has been changed after publishing.
    private boolean edited;
    // Whether the current user may edit or remove it (trip owners).
    private boolean canManage;
}
