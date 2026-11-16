package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.Review;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    boolean existsByTrip_TripIdAndReviewer_UserIdAndReviewee_UserId(Long tripId, Long reviewerId, Long revieweeId);

    // FR-20: reviews received by a user, shown on their profile
    @EntityGraph(attributePaths = {"reviewer", "reviewee", "trip"})
    List<Review> findByReviewee_UserIdOrderByCreatedAtDesc(Long revieweeId);

    // Reviews a user has written, for their own review history
    @EntityGraph(attributePaths = {"reviewer", "reviewee", "trip"})
    List<Review> findByReviewer_UserIdOrderByCreatedAtDesc(Long reviewerId);

    // Who the current user has already reviewed on this trip, so the review
    // page can show what's left to do
    @EntityGraph(attributePaths = {"reviewee"})
    List<Review> findByTrip_TripIdAndReviewer_UserId(Long tripId, Long reviewerId);

    // FR-3: remove a trip's reviews when the trip itself is deleted
    void deleteByTrip_TripId(Long tripId);
}
