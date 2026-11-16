package com.elec5619.group3.trip_planner_backend.dto;

import com.elec5619.group3.trip_planner_backend.entity.Vote.VoteValue;
import lombok.Builder;
import lombok.Getter;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@Getter
@Builder
public class ActivityResponse {
    private Long id;
    private Long tripId;
    private Long createdById;
    private String createdByUsername;
    private String name;
    private String location;
    private String category;
    private String description;
    private List<String> tags;
    private List<String> imageUrls;
    private LocalDate date;
    private LocalTime startTime;
    private LocalTime endTime;
    private Double latitude;
    private Double longitude;
    private boolean branch;
    private List<Long> memberIds;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private long approveCount;
    private long rejectCount;
    private long eligibleMemberCount;
    private long requiredApprovals;
    private long remainingEligibleVotes;
    private boolean canModify;
    private boolean canSchedule;
    private long commentCount;
    private VoteValue currentUserVote;
    private ProposalStatus status;

    /** BRANCH: taken out of voting; it stays a branch until someone sends it back. */
    public enum ProposalStatus { PENDING, APPROVED, REJECTED, BRANCH }
}
