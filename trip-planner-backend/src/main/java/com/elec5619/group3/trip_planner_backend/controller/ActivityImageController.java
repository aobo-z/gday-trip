package com.elec5619.group3.trip_planner_backend.controller;

import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.ActivityImageService;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/activity-images")
public class ActivityImageController {
    private final ActivityImageService service;
    public ActivityImageController(ActivityImageService service) { this.service = service; }
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public UploadResponse upload(@RequestParam("file") MultipartFile file, @AuthenticationPrincipal AuthenticatedUser user) {
        return new UploadResponse(service.upload(file, user.getUserId()));
    }
    @GetMapping("/{id}")
    public ResponseEntity<byte[]> read(@PathVariable String id, @AuthenticationPrincipal AuthenticatedUser user) {
        var image = service.read(id, user.getUserId());
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.contentType()))
                .cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff").body(image.data());
    }
    public record UploadResponse(String url) {}
}
