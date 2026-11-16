package com.elec5619.group3.trip_planner_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

/**
 * FR-18: The bytes of a TripFile, kept in a separate table (same id) so file
 * lists can be loaded without reading every file's contents.
 */
@Entity
@Table(name = "trip_file_contents")
@Getter
@Setter
@NoArgsConstructor
public class TripFileContent {

    @Id
    @Column(name = "file_id")
    private Long fileId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "file_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    private TripFile file;

    @Lob
    @Column(nullable = false, length = TripFile.MAX_BYTES)
    private byte[] data;

    public TripFileContent(TripFile file, byte[] data) {
        this.file = file;
        this.data = data;
    }
}
