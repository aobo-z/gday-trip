package com.elec5619.group3.trip_planner_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;

/**
 * FR-18: A travel document (PDF or image) uploaded to a trip, optionally linked
 * to one of its activities. Columns follow the TripFile table in the ERD.
 *
 * The ERD's file_url assumed an external file host. The project has none, and
 * files must only be readable by trip members, so the bytes are stored in
 * TripFileContent and served through the authenticated download endpoint
 * instead. Keeping the bytes in their own table means listing files never
 * loads file contents.
 */
@Entity
@Table(name = "trip_files", indexes = {
        @Index(name = "idx_trip_files_trip_uploaded", columnList = "trip_id, uploaded_at"),
        @Index(name = "idx_trip_files_activity", columnList = "activity_id")
})
@Getter
@Setter
@NoArgsConstructor
public class TripFile {

    public static final int MAX_BYTES = 10 * 1024 * 1024;
    public static final int FILE_NAME_MAX = 255;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "file_id")
    private Long fileId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "uploaded_by", nullable = false)
    private User uploadedBy;

    // Deleting a trip deletes its files.
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Trip trip;

    // Optional. Deleting the activity keeps the file as a general trip file.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "activity_id")
    @OnDelete(action = OnDeleteAction.SET_NULL)
    private Activity activity;

    @Column(name = "file_name", nullable = false, length = FILE_NAME_MAX)
    private String fileName;

    @Column(name = "content_type", nullable = false, length = 30)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private LocalDateTime uploadedAt;

    @PrePersist
    protected void onCreate() {
        uploadedAt = LocalDateTime.now();
    }
}
