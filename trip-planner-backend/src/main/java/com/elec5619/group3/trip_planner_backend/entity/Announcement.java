package com.elec5619.group3.trip_planner_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;

/**
 * FR-19: A trip-wide announcement published by a trip owner.
 * Columns follow the Announcement table in the ERD.
 */
@Entity
@Table(name = "announcements",
        indexes = @Index(name = "idx_announcements_trip_published", columnList = "trip_id, published_at"))
@Getter
@Setter
@NoArgsConstructor
public class Announcement {

    public static final int TITLE_MAX = 100;
    public static final int CONTENT_MAX = 5000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "announcement_id")
    private Long announcementId;

    // Deleting a trip deletes its announcements.
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Trip trip;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    private User author;

    @Column(nullable = false, length = TITLE_MAX)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "published_at", nullable = false, updatable = false)
    private LocalDateTime publishedAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        publishedAt = LocalDateTime.now();
        updatedAt = publishedAt;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
