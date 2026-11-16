package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.PlaceRecommendationRequest;
import com.elec5619.group3.trip_planner_backend.dto.PlaceRecommendationResponse;
import com.elec5619.group3.trip_planner_backend.dto.PlaceResult;
import com.elec5619.group3.trip_planner_backend.dto.PlaceSearchRequest;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.AiRecommendationService;
import com.elec5619.group3.trip_planner_backend.service.DiscoveryService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/trips/{tripId}/discover")
public class DiscoveryController {

    private final DiscoveryService discoveryService;
    private final AiRecommendationService aiRecommendationService;

    public DiscoveryController(DiscoveryService discoveryService, AiRecommendationService aiRecommendationService) {
        this.discoveryService = discoveryService;
        this.aiRecommendationService = aiRecommendationService;
    }

    @PostMapping("/search")
    public ResponseEntity<List<PlaceResult>> search(@PathVariable Long tripId,
                                                      @Valid @RequestBody PlaceSearchRequest request) {
        Long currentUserId = getCurrentUserId();
        List<PlaceResult> results = discoveryService.searchPlaces(tripId, currentUserId, request.getQuery());
        return ResponseEntity.ok(results);
    }

    @PostMapping("/recommend")
    public ResponseEntity<PlaceRecommendationResponse> recommend(@PathVariable Long tripId,
                                                                   @Valid @RequestBody PlaceRecommendationRequest request) {
        Long currentUserId = getCurrentUserId();
        PlaceRecommendationResponse response = aiRecommendationService.recommend(tripId, currentUserId, request);
        return ResponseEntity.ok(response);
    }

    // 204 when the destination isn't a recognisable place, so the map falls back to its default view.
    @GetMapping("/area")
    public ResponseEntity<DiscoveryService.MapBounds> area(@PathVariable Long tripId) {
        DiscoveryService.MapBounds bounds = discoveryService.destinationBounds(tripId, getCurrentUserId());
        return bounds == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(bounds);
    }

    // Raw image bytes for the frontend to upload as an activity image; 204 if the place has no photo.
    @GetMapping("/places/{placeId}/photo")
    public ResponseEntity<byte[]> photo(@PathVariable Long tripId, @PathVariable String placeId) {
        DiscoveryService.PlacePhoto photo = discoveryService.fetchFirstPhoto(tripId, getCurrentUserId(), placeId);
        if (photo == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(photo.contentType())).body(photo.data());
    }

    private Long getCurrentUserId() {
        AuthenticatedUser principal = (AuthenticatedUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return principal.getUserId();
    }
}
