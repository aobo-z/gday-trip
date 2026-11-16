package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.dto.ServiceStatusResponse;
import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Lets the frontend know, at runtime, which external services are on and which map to load. */
@RestController
public class ServiceStatusController {

    private final ServiceSettingsService settingsService;

    public ServiceStatusController(ServiceSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping("/api/services/status")
    public ServiceStatusResponse status() {
        return settingsService.status();
    }
}
