package com.elec5619.group3.trip_planner_backend.dto;

import java.time.LocalDateTime;

/** `canDelete`: the caller wrote it or owns the shared trip. */
public record CommunityCommentResponse(Long id, String content, Long authorId, String authorName,
                                       LocalDateTime createdAt, boolean canDelete) {}
