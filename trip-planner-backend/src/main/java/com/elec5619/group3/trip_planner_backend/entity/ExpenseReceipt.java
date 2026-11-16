package com.elec5619.group3.trip_planner_backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Entity @Table(name = "expense_receipts") @Getter @Setter
public class ExpenseReceipt {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @OneToOne(fetch = FetchType.LAZY) @JoinColumn(name = "expense_id", nullable = false, unique = true)
    private Expense expense;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "uploaded_by", nullable = false)
    private User uploadedBy;
    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;
    @Column(name = "content_type", nullable = false, length = 30)
    private String contentType;
    @Column(name = "uploaded_at", nullable = false)
    private LocalDateTime uploadedAt;
    @Lob @Column(nullable = false, columnDefinition = "LONGBLOB")
    private byte[] content;
}
