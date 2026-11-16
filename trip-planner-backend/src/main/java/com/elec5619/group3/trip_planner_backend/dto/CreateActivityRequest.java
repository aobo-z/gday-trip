package com.elec5619.group3.trip_planner_backend.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Getter
@Setter
public class CreateActivityRequest {
    @NotBlank @Size(max = 160)
    private String name;
    private LocalDate date;
    private LocalTime startTime;
    private LocalTime endTime;
    @NotBlank @Size(max = 200)
    private String location;
    @NotBlank @Size(max = 80)
    private String category;
    @Size(max = 2000)
    private String description;

    @Size(max = 10)
    private List<@NotBlank @Size(max = 40) String> tags;
    @Size(max = 8)
    private List<@NotBlank @Size(max = 2048) String> imageUrls;
    @DecimalMin("-90.0") @DecimalMax("90.0")
    private Double latitude;
    @DecimalMin("-180.0") @DecimalMax("180.0")
    private Double longitude;
}
