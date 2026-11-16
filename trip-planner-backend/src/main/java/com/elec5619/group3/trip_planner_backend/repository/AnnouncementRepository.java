package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.Announcement;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AnnouncementRepository extends JpaRepository<Announcement, Long> {

    // FR-19: newest first; id breaks ties between announcements published in the same instant
    @EntityGraph(attributePaths = {"author"})
    List<Announcement> findByTrip_TripIdOrderByPublishedAtDescAnnouncementIdDesc(Long tripId);

    // FR-19: locked lookup for editing or removing, so two owners acting on the
    // same announcement at once run one at a time
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Announcement a where a.announcementId = :announcementId")
    Optional<Announcement> lockById(@Param("announcementId") Long announcementId);
}
