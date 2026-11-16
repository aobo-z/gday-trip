package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.Vote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VoteRepository extends JpaRepository<Vote, Long> {
    Optional<Vote> findByActivity_IdAndUser_UserId(Long activityId, Long userId);
    List<Vote> findByActivity_Id(Long activityId);
    List<Vote> findByActivity_Trip_TripId(Long tripId);
}
