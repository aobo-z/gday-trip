package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.*;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.ActivityService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api")
public class ActivityController {
    private final ActivityService service;

    public ActivityController(ActivityService service) { this.service = service; }

    @PostMapping("/trips/{tripId}/activities")
    @ResponseStatus(HttpStatus.CREATED)
    public ActivityResponse create(@PathVariable Long tripId, @Valid @RequestBody CreateActivityRequest request,
                                   @AuthenticationPrincipal AuthenticatedUser user) {
        return service.create(tripId, request, user.getUserId());
    }

    @GetMapping("/trips/{tripId}/activities")
    public List<ActivityResponse> list(@PathVariable Long tripId, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.list(tripId, user.getUserId());
    }

    @PostMapping("/trips/{tripId}/branches")
    @ResponseStatus(HttpStatus.CREATED)
    public ActivityResponse createBranch(@PathVariable Long tripId, @Valid @RequestBody BranchActivityRequest request,
                                         @AuthenticationPrincipal AuthenticatedUser user) {
        return service.createBranch(tripId, request, user.getUserId());
    }

    @PutMapping("/branches/{id}")
    public ActivityResponse updateBranch(@PathVariable Long id, @Valid @RequestBody BranchActivityRequest request,
                                         @AuthenticationPrincipal AuthenticatedUser user) {
        return service.updateBranch(id, request, user.getUserId());
    }

    @DeleteMapping("/activities/{id}/branch")
    public ActivityResponse removeBranch(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.removeBranch(id, user.getUserId());
    }

    @GetMapping("/activities/{id}")
    public ActivityResponse get(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.get(id, user.getUserId());
    }

    @PutMapping("/activities/{id}")
    public ActivityResponse update(@PathVariable Long id, @Valid @RequestBody CreateActivityRequest request,
                                   @AuthenticationPrincipal AuthenticatedUser user) {
        return service.update(id, request, user.getUserId());
    }

    @PutMapping("/activities/{id}/location")
    public ActivityResponse updateLocation(@PathVariable Long id, @Valid @RequestBody ActivityLocationRequest request,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        return service.updateLocation(id, request, user.getUserId());
    }

    @PutMapping("/activities/{id}/schedule")
    public ActivityResponse updateSchedule(@PathVariable Long id, @RequestBody ActivityScheduleRequest request,
                                           @AuthenticationPrincipal AuthenticatedUser user) {
        return service.updateSchedule(id, request, user.getUserId());
    }

    @PostMapping("/activities/{id}/members/me")
    public ActivityResponse joinSchedule(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.joinSchedule(id, user.getUserId());
    }

    @DeleteMapping("/activities/{id}/members/me")
    public ActivityResponse leaveSchedule(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.leaveSchedule(id, user.getUserId());
    }

    @DeleteMapping("/activities/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        service.delete(id, user.getUserId());
    }

    @PutMapping("/activities/{id}/vote")
    public ActivityResponse vote(@PathVariable Long id, @Valid @RequestBody VoteRequest request,
                                 @AuthenticationPrincipal AuthenticatedUser user) {
        return service.vote(id, request.getVote(), user.getUserId());
    }

    @DeleteMapping("/activities/{id}/vote")
    public ActivityResponse withdrawVote(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.withdrawVote(id, user.getUserId());
    }

    @GetMapping("/activities/{id}/preferences")
    public ActivityPreferencesResponse preferences(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.listPreferences(id, user.getUserId());
    }

    @DeleteMapping("/activities/{id}/preferences/me")
    public ActivityPreferencesResponse deletePreference(@PathVariable Long id,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate date,
            @AuthenticationPrincipal AuthenticatedUser user) {
        return service.deletePreference(id, date, user.getUserId());
    }

    @PutMapping("/activities/{id}/preferences/me")
    public ActivityPreferencesResponse savePreference(@PathVariable Long id,
            @Valid @RequestBody ActivityPreferenceRequest request, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.savePreference(id, request, user.getUserId());
    }

    @GetMapping("/activities/{id}/comments")
    public List<CommentResponse> comments(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser user) {
        return service.listComments(id, user.getUserId());
    }

    @PostMapping("/activities/{id}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public CommentResponse addComment(@PathVariable Long id, @Valid @RequestBody CommentRequest request,
                                      @AuthenticationPrincipal AuthenticatedUser user) {
        return service.addComment(id, request.getContent(), user.getUserId());
    }

    @DeleteMapping("/activities/{id}/comments/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComment(@PathVariable Long id, @PathVariable Long commentId,
                              @AuthenticationPrincipal AuthenticatedUser user) {
        service.deleteComment(id, commentId, user.getUserId());
    }
}
