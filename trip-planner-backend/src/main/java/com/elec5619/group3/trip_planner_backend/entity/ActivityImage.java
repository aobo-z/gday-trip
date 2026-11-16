package com.elec5619.group3.trip_planner_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

@Entity
@Table(name = "activity_image_uploads")
@Getter @Setter
public class ActivityImage {
    @Id @Column(length = 36)
    private String id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "uploaded_by", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User uploadedBy;
    @Column(nullable = false, length = 30)
    private String contentType;
    @Lob @Column(nullable = false, columnDefinition = "LONGBLOB")
    private byte[] data;
}
