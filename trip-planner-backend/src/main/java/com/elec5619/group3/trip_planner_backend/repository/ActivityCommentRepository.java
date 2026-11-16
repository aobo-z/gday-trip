package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.ActivityComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ActivityCommentRepository extends JpaRepository<ActivityComment, Long> {
    List<ActivityComment> findByActivity_IdOrderByCreatedAtAscIdAsc(Long activityId);
    long countByActivity_Id(Long activityId);

    interface ActivityCount {
        Long getActivityId();
        long getCount();
    }

    @Query("select c.activity.id as activityId, count(c) as count from ActivityComment c where c.activity.trip.tripId = :tripId group by c.activity.id")
    List<ActivityCount> countByTrip(@Param("tripId") Long tripId);
}
