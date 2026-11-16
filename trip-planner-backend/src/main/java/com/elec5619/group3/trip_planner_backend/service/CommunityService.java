package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.*;
import com.elec5619.group3.trip_planner_backend.entity.*;
import com.elec5619.group3.trip_planner_backend.repository.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

@Service
public class CommunityService {
    private final TripRepository trips;
    private final ActivityRepository activities;
    private final TripLikeRepository likes;
    private final UserRepository users;
    private final ActivityService activityService;

    public CommunityService(TripRepository trips, ActivityRepository activities, TripLikeRepository likes, UserRepository users,
                            ActivityService activityService) {
        this.trips = trips; this.activities = activities; this.likes = likes; this.users = users; this.activityService = activityService;
    }

    @Transactional(readOnly = true)
    public List<CommunityTripResponse> list(Long userId, int page) {
        // Every published trip is visible to everyone, its own members included.
        return trips.findCommunityTrips(PageRequest.of(Math.max(0, page), 20)).stream()
                .map(trip -> response(trip, userId)).toList();
    }

    @Transactional(readOnly = true)
    public CommunityTripResponse get(Long tripId, Long userId) {
        Trip trip = trips.findById(tripId).filter(this::published)
                .orElseThrow(() -> new NoSuchElementException("Published trip not found"));
        return response(trip, userId);
    }

    @Transactional
    public LikeResponse like(Long tripId, Long userId, boolean liked) {
        // Lock covers both first likes and retries; the unique constraint is the final guard.
        Trip trip = trips.lockPublishedTrip(tripId)
                .orElseThrow(() -> new NoSuchElementException("Published trip not found"));
        var existing = likes.findByTrip_TripIdAndUser_UserId(tripId, userId);
        if (liked && existing.isEmpty()) {
            TripLike entry = new TripLike(); entry.setTrip(trip);
            entry.setUser(users.findById(userId).orElseThrow());
            likes.saveAndFlush(entry);
        } else if (!liked && existing.isPresent()) {
            likes.delete(existing.get()); likes.flush();
        }
        return new LikeResponse(likes.countByTrip_TripId(tripId), liked);
    }

    /**
     * Proposes a shared place in one of the caller's trips. The copy is made from the stored activity,
     * so its photos and map position come along; votes, comments and the schedule start fresh.
     */
    @Transactional
    public ActivityResponse copyPlace(Long activityId, Long tripId, Long userId) {
        Activity source = activities.findById(activityId)
                .filter(a -> published(a.getTrip()) && isSharedPlace(a))
                .orElseThrow(() -> new NoSuchElementException("This place is no longer shared"));
        CreateActivityRequest copy = new CreateActivityRequest();
        copy.setName(source.getName());
        copy.setLocation(source.getLocation());
        copy.setCategory(source.getCategory());
        copy.setTags(new ArrayList<>(source.getTags()));
        copy.setImageUrls(new ArrayList<>(source.getImageUrls()));
        copy.setLatitude(source.getLatitude());
        copy.setLongitude(source.getLongitude());
        return activityService.create(tripId, copy, userId);
    }

    /** Only scheduled stops of a published trip are shown in Community. */
    private static boolean isSharedPlace(Activity a) {
        return a.getDate() != null && a.getStartTime() != null && a.getEndTime() != null && !"Scheduling test".equals(a.getCategory());
    }

    private boolean published(Trip trip) {
        return "PUBLISHED".equals(trip.getStatus());
    }

    private CommunityTripResponse response(Trip trip, Long userId) {
        var places = activities.findChronologically(trip.getTripId()).stream()
                .filter(CommunityService::isSharedPlace)
                .map(a -> new CommunityTripResponse.Place(a.getId(), a.getName(), a.getLocation(), a.getCategory(),
                        List.copyOf(a.getTags()), List.copyOf(a.getImageUrls()), a.getDate(), a.getStartTime(), a.getEndTime()))
                .toList();
        return new CommunityTripResponse(trip.getTripId(), trip.getName(), trip.getDestination(),
                trip.getStartDate(), trip.getEndDate(), trip.getCoverImageId(), places, likes.countByTrip_TripId(trip.getTripId()),
                likes.findByTrip_TripIdAndUser_UserId(trip.getTripId(), userId).isPresent());
    }

    public record LikeResponse(long likeCount, boolean likedByMe) {}
}
