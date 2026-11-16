package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.AdminPageResponse;
import com.elec5619.group3.trip_planner_backend.dto.AdminTripResponse;
import com.elec5619.group3.trip_planner_backend.dto.AdminUserResponse;
import com.elec5619.group3.trip_planner_backend.dto.AiModelOption;
import com.elec5619.group3.trip_planner_backend.dto.ServiceSettingsResponse;
import com.elec5619.group3.trip_planner_backend.dto.ServiceTestResponse;
import com.elec5619.group3.trip_planner_backend.dto.UpdateServiceSettingsRequest;
import com.elec5619.group3.trip_planner_backend.dto.UpdateUserStatusRequest;
import com.elec5619.group3.trip_planner_backend.exception.ResourceNotFoundException;
import com.elec5619.group3.trip_planner_backend.service.AdminService;
import com.elec5619.group3.trip_planner_backend.service.ExternalServiceProbe;
import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** FR-22: administrator-only endpoints. SecurityConfig restricts /api/admin/** to ROLE_ADMIN. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Map<String, ExternalServiceProbe.Target> TEST_TARGETS = Map.of(
            "place-search", ExternalServiceProbe.Target.PLACE_SEARCH,
            "place-photos", ExternalServiceProbe.Target.PLACE_PHOTOS,
            "ai", ExternalServiceProbe.Target.AI);

    private final ServiceSettingsService settingsService;
    private final ExternalServiceProbe probe;
    private final AdminService adminService;

    public AdminController(ServiceSettingsService settingsService, ExternalServiceProbe probe,
                           AdminService adminService) {
        this.settingsService = settingsService;
        this.probe = probe;
        this.adminService = adminService;
    }

    @GetMapping("/services")
    public ServiceSettingsResponse services() {
        return settingsService.settings();
    }

    @PutMapping("/services")
    public ServiceSettingsResponse updateServices(@Valid @RequestBody UpdateServiceSettingsRequest request) {
        return settingsService.update(request);
    }

    /** Runs a real request against the service. `model` lets the AI test try an unsaved choice. */
    @PostMapping("/services/{service}/test")
    public ServiceTestResponse testService(
            @PathVariable String service,
            @RequestParam(required = false) String model) {
        ExternalServiceProbe.Target target = TEST_TARGETS.get(service);
        if (target == null) {
            throw new ResourceNotFoundException("Unknown service: " + service);
        }
        // The model name goes into the Gemini URL, same rule as saving it.
        if (model != null && (model.length() > 80 || !model.matches(ServiceSettingsService.AI_MODEL_PATTERN))) {
            throw new IllegalArgumentException("AI model may only contain lowercase letters, digits, dots and dashes");
        }
        return probe.test(target, model);
    }

    @GetMapping("/ai-models")
    public List<AiModelOption> aiModels() {
        return probe.aiModels();
    }

    @GetMapping("/users")
    public AdminPageResponse<AdminUserResponse> users(@RequestParam(defaultValue = "") String query,
                                                      @RequestParam(defaultValue = "0") int page) {
        return adminService.users(query, page);
    }

    @PutMapping("/users/{userId}/status")
    public AdminUserResponse updateUserStatus(@PathVariable Long userId,
                                              @Valid @RequestBody UpdateUserStatusRequest request) {
        return adminService.setDisabled(userId, request.getDisabled());
    }

    @GetMapping("/trips")
    public AdminPageResponse<AdminTripResponse> trips(@RequestParam(defaultValue = "") String query,
                                                      @RequestParam(defaultValue = "0") int page) {
        return adminService.trips(query, page);
    }

    @DeleteMapping("/trips/{tripId}")
    public ResponseEntity<Void> deleteTrip(@PathVariable Long tripId) {
        adminService.deleteTrip(tripId);
        return ResponseEntity.noContent().build();
    }
}
