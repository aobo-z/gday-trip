package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.UpdateHistoryResponse;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.UpdateHistory;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UpdateHistoryRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import java.util.stream.Collectors;
import java.util.NoSuchElementException;

@Service
public class UpdateHistoryService {
    // The few changes worth showing on the trip overview; the full list stays available from list().
    private static final List<String> KEY_CHANGES = List.of("PROPOSAL_CREATED", "ACTIVITY_SCHEDULED", "ACTIVITY_DELETED");
    private static final int KEY_CHANGE_LIMIT = 8;

    private final UpdateHistoryRepository repository;
    private final TripRepository tripRepository;
    private final TripMemberService memberService;

    public UpdateHistoryService(UpdateHistoryRepository repository, TripRepository tripRepository,
                                TripMemberService memberService) {
        this.repository = repository;
        this.tripRepository = tripRepository;
        this.memberService = memberService;
    }

    // Joins the caller's transaction: failed changes must not leave a history entry.
    @Transactional
    public void record(Trip trip, User actor, String type, String description) {
        UpdateHistory entry = new UpdateHistory();
        entry.setTrip(trip);
        entry.setChangedBy(actor);
        entry.setChangeType(type);
        entry.setDescription(description);
        repository.save(entry);
    }

    @Transactional(readOnly = true)
    public boolean wasActivityScheduled(Long tripId, Long activityId) {
        return repository.existsByTrip_TripIdAndChangeTypeAndDescriptionStartingWith(
                tripId, "ACTIVITY_SCHEDULED", "Scheduled #" + activityId + ":");
    }

    @Transactional(readOnly = true)
    public Set<Long> scheduledActivityIds(Long tripId) {
        return activityIds(tripId, "ACTIVITY_SCHEDULED", Pattern.compile("^Scheduled #(\\d+):"));
    }

    private Set<Long> activityIds(Long tripId, String type, Pattern pattern) {
        return repository.findDescriptions(tripId, type).stream().map(pattern::matcher)
                .filter(Matcher::find)
                .map(match -> Long.valueOf(match.group(1) != null ? match.group(1) : match.group(2)))
                .collect(Collectors.toSet());
    }

    @Transactional(readOnly = true)
    public List<UpdateHistoryResponse> keyChanges(Long tripId, Long userId) {
        if (!tripRepository.existsById(tripId)) throw new NoSuchElementException("Trip not found");
        memberService.verifyUserIsMember(tripId, userId);
        return repository.findRecentOfTypes(tripId, KEY_CHANGES, PageRequest.of(0, KEY_CHANGE_LIMIT)).stream()
                .map(entry -> new UpdateHistoryResponse(entry.getLogId(), tripId,
                        entry.getChangedBy().getUserId(), entry.getChangedBy().getUsername(),
                        entry.getChangeType(), entry.getDescription(), entry.getChangedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<UpdateHistoryResponse> list(Long tripId, Long userId) {
        if (!tripRepository.existsById(tripId)) throw new NoSuchElementException("Trip not found");
        memberService.verifyUserIsMember(tripId, userId);
        return repository.findTop50ByTrip_TripIdOrderByChangedAtDescLogIdDesc(tripId).stream()
                .map(entry -> new UpdateHistoryResponse(entry.getLogId(), tripId,
                        entry.getChangedBy().getUserId(), entry.getChangedBy().getUsername(),
                        entry.getChangeType(), entry.getDescription(), entry.getChangedAt()))
                .toList();
    }
}
