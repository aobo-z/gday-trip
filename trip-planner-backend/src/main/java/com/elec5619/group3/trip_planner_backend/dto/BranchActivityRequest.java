package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

@Getter
@Setter
public class BranchActivityRequest {
    private Long sourceActivityId;
    @NotBlank @Size(max = 160)
    private String name;
    @NotBlank @Size(max = 200)
    private String location;
    @NotBlank @Size(max = 80)
    private String category;
    @Size(max = 2000)
    private String description;
    private LocalDate date;
    private LocalTime startTime;
    private LocalTime endTime;
    private Set<Long> memberIds;
    /** A new place only: the same tags, photos and pin as an activity form sends. */
    private List<String> tags;
    private List<String> imageUrls;
    private Double latitude;
    private Double longitude;
}
