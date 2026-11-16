package com.elec5619.group3.trip_planner_backend.controller;

import java.util.List;
import java.time.Duration;
import com.elec5619.group3.trip_planner_backend.service.DiscoveryService;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.http.MediaType;
import org.springframework.http.CacheControl;
import com.elec5619.group3.trip_planner_backend.dto.AiCoverOption;
import com.elec5619.group3.trip_planner_backend.dto.AiPlanDraft;
import com.elec5619.group3.trip_planner_backend.dto.AiPlanRequest;
import com.elec5619.group3.trip_planner_backend.dto.SaveAiPlanRequest;
import com.elec5619.group3.trip_planner_backend.dto.TripResponse;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.AiPlannerService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** AI Planner: generate an editable trip draft, then save the edited version as a new trip. */
@RestController
@RequestMapping("/api/ai-planner")
public class AiPlannerController {

    private final AiPlannerService plannerService;

    public AiPlannerController(AiPlannerService plannerService) {
        this.plannerService = plannerService;
    }

    /**
     * Ask Gemini for a plan. Nothing is saved.
     * URL: POST http://localhost:8080/api/ai-planner/draft
     */
    @PostMapping("/draft")
    public AiPlanDraft draft(@Valid @RequestBody AiPlanRequest request) {
        return plannerService.draft(request);
    }

    /**
     * Cover photos to choose from: photos of the destination's two best-known landmarks (picked by the AI).
     * URL: GET http://localhost:8080/api/ai-planner/covers?destination=Kyoto
     */
    @GetMapping("/covers")
    public List<AiCoverOption> covers(@RequestParam String destination) {
        return plannerService.coverOptions(destination);
    }

    /**
     * One of those photos; the API key stays on the server.
     * URL: GET http://localhost:8080/api/ai-planner/covers/photo?name=places/.../photos/...
     */
    @GetMapping("/covers/photo")
    public ResponseEntity<byte[]> coverPhoto(@RequestParam String name) {
        DiscoveryService.PlacePhoto photo = plannerService.coverPhoto(name);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .body(photo.data());
    }

    /**
     * Save the edited plan as a new trip owned by the caller, with each activity as a proposal.
     * URL: POST http://localhost:8080/api/ai-planner/trips
     */
    @PostMapping("/trips")
    public ResponseEntity<TripResponse> save(@Valid @RequestBody SaveAiPlanRequest request) {
        AuthenticatedUser principal = (AuthenticatedUser)
                SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED).body(plannerService.save(request, principal.getUserId()));
    }
}
