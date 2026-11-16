package com.elec5619.group3.trip_planner_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "activities")
@Getter
@Setter
@NoArgsConstructor
public class Activity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "activity_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trip_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Trip trip;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(nullable = false, length = 160)
    private String name;

    private LocalDate date;
    private LocalTime startTime;
    private LocalTime endTime;

    // Optional map position, from Discover or pinned on the trip map; null means "not on the map".
    private Double latitude;
    private Double longitude;

    @Column(nullable = false)
    private boolean everScheduled;

    // A branch skips voting and only the members who pick it attend; an idea that becomes a branch keeps its row.
    @Column(name = "direct_scheduled_plan", nullable = false, columnDefinition = "boolean default false")
    private boolean branch;

    @Column(nullable = false, length = 200)
    private String location;

    @Column(nullable = false, length = 80)
    private String category;

    @Column(length = 2000)
    private String description;

    @BatchSize(size = 50)
    @ElementCollection
    @CollectionTable(name = "activity_tags", joinColumns = @JoinColumn(name = "activity_id"))
    @Column(name = "tag", length = 40, nullable = false)
    @OrderColumn(name = "tag_order")
    private List<String> tags = new ArrayList<>();

    @BatchSize(size = 50)
    @ElementCollection
    @CollectionTable(name = "activity_images", joinColumns = @JoinColumn(name = "activity_id"))
    @Column(name = "image_url", length = 2048, nullable = false)
    @OrderColumn(name = "image_order")
    private List<String> imageUrls = new ArrayList<>();

    @BatchSize(size = 50)
    @ManyToMany
    @JoinTable(name = "activity_members",
            joinColumns = @JoinColumn(name = "activity_id"),
            inverseJoinColumns = @JoinColumn(name = "trip_member_id"),
            uniqueConstraints = @UniqueConstraint(columnNames = {"activity_id", "trip_member_id"}))
    private Set<TripMember> assignedMembers = new LinkedHashSet<>();

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
