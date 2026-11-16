package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.CommunityComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, Long> {
    List<CommunityComment> findByTrip_TripIdOrderByCreatedAtAscIdAsc(Long tripId);
}
