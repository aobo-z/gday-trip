package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.*;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.CommunityCommentService;
import com.elec5619.group3.trip_planner_backend.service.CommunityService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api")
public class CommunityController {
    private final CommunityService service;
    private final CommunityCommentService comments;
    public CommunityController(CommunityService service, CommunityCommentService comments) { this.service = service; this.comments = comments; }

    @GetMapping("/community/trips")
    public List<CommunityTripResponse> list(@AuthenticationPrincipal AuthenticatedUser user,
                                           @RequestParam(defaultValue = "0") int page) {
        return service.list(user.getUserId(), page);
    }
    @GetMapping("/community/trips/{id}")
    public CommunityTripResponse get(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.get(id, user.getUserId());
    }
    @PutMapping("/community/trips/{id}/like")
    public CommunityService.LikeResponse like(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user,
                                              @Valid @RequestBody LikeRequest request) {
        return service.like(id, user.getUserId(), request.liked());
    }
    /** Proposes a shared place in one of the caller's trips; the server copies it, coordinates and photos included. */
    @PostMapping("/community/places/{activityId}/copy")
    public ActivityResponse copy(@PathVariable Long activityId, @AuthenticationPrincipal AuthenticatedUser user,
                                 @Valid @RequestBody CopyRequest request) {
        return service.copyPlace(activityId, request.tripId(), user.getUserId());
    }
    @GetMapping("/community/trips/{id}/comments")
    public List<CommunityCommentResponse> comments(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return comments.list(id, user.getUserId());
    }
    @PostMapping("/community/trips/{id}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public CommunityCommentResponse comment(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user,
                                            @Valid @RequestBody CommunityCommentRequest request) {
        return comments.create(id, request.content(), user.getUserId());
    }
    @DeleteMapping("/community/trips/{id}/comments/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComment(@PathVariable Long id, @PathVariable Long commentId, @AuthenticationPrincipal AuthenticatedUser user) {
        comments.delete(id, commentId, user.getUserId());
    }
    public record CommunityCommentRequest(@NotBlank @Size(max = 1000) String content) {}
    public record LikeRequest(@NotNull Boolean liked) {}
    public record CopyRequest(@NotNull Long tripId) {}
}
