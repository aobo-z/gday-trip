package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.TripLike;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface TripLikeRepository extends JpaRepository<TripLike, Long> {
    long countByTrip_TripId(Long tripId);
    Optional<TripLike> findByTrip_TripIdAndUser_UserId(Long tripId, Long userId);
}
