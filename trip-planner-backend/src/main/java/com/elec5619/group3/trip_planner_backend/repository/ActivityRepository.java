package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.Activity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;

public interface ActivityRepository extends JpaRepository<Activity, Long> {
    String VISIBLE_PLACE = """
            (exists (select m from TripMember m where m.trip = a.trip
                and m.user.userId = :userId and m.inviteStatus = 'JOINED')
            or (a.trip.status = 'PUBLISHED' and a.date is not null
                and a.startTime is not null and a.endTime is not null))
            """;

    @Query("select count(a) from Activity a join a.imageUrls image where image = :url and " + VISIBLE_PLACE)
    long countAccessibleImage(@Param("url") String url, @Param("userId") Long userId);
    List<Activity> findByTrip_TripIdOrderByCreatedAtAscIdAsc(Long tripId);

    @Query("select a.trip.tripId from Activity a where a.id = :id")
    Optional<Long> findTripIdForScheduling(@Param("id") Long id);

    // Undated proposals follow dated records; ties are stable across reloads.
    @Query("""
            select a from Activity a where a.trip.tripId = :tripId
            order by case when a.date is null then 1 else 0 end, a.date,
                     case when a.startTime is null then 1 else 0 end, a.startTime,
                     a.createdAt, a.id
            """)
    List<Activity> findChronologically(@Param("tripId") Long tripId);

    // Serialize vote upserts, including concurrent first votes by the same user.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Activity a where a.id = :id")
    Optional<Activity> findForVoting(@Param("id") Long id);
}
