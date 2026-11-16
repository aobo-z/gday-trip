package com.elec5619.group3.trip_planner_backend.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

// Deliberately separate from TripResponse and ActivityResponse to keep group data private.
public record CommunityTripResponse(Long tripId, String name, String destination,
                                    LocalDate startDate, LocalDate endDate,
                                    String coverImageId,
                                    List<Place> places, long likeCount, boolean likedByMe) {
    public record Place(Long id, String name, String location, String category,
                        List<String> tags, List<String> imageUrls,
                        LocalDate date, LocalTime startTime, LocalTime endTime) {}
}
