package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.PlaceRecommendationRequest;
import com.elec5619.group3.trip_planner_backend.dto.PlaceRecommendationResponse;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

@Service
public class AiRecommendationService {

    private static final String FALLBACK_REASON = "No recommendation available right now.";

    private final TripMemberRepository tripMemberRepository;
    private final ServiceSettingsService settings;
    private final GeminiClient gemini;

    public AiRecommendationService(TripMemberRepository tripMemberRepository,
                                    ServiceSettingsService settings,
                                    GeminiClient gemini) {
        this.tripMemberRepository = tripMemberRepository;
        this.settings = settings;
        this.gemini = gemini;
    }

    public PlaceRecommendationResponse recommend(Long tripId, Long userId, PlaceRecommendationRequest request) {
        TripMember membership = tripMemberRepository.findByTrip_TripIdAndUser_UserId(tripId, userId)
                .filter(TripMember::isActive)
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this trip"));
        settings.requireEnabled(ServiceSettingsService.ExternalService.AI_RECOMMENDATIONS);
        Trip trip = membership.getTrip();

        String reason = gemini.generate(buildPrompt(trip, request), null);
        return new PlaceRecommendationResponse(reason == null || reason.isBlank() ? FALLBACK_REASON : reason);
    }

    private String buildPrompt(Trip trip, PlaceRecommendationRequest place) {
        return """
                Trip destination: %s (%s to %s).
                Place: %s%s%s.
                In 1-2 short sentences, explain why this place could be worth visiting on this trip.
                """.formatted(
                trip.getDestination(), trip.getStartDate(), trip.getEndDate(),
                place.getName(),
                place.getPrimaryType() != null ? " (" + place.getPrimaryType() + ")" : "",
                place.getAddress() != null ? ", " + place.getAddress() : "");
    }
}
