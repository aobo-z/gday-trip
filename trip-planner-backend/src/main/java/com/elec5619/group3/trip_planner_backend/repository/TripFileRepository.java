package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.TripFile;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TripFileRepository extends JpaRepository<TripFile, Long> {

    // FR-18: the central trip file view, newest first
    @EntityGraph(attributePaths = {"uploadedBy", "activity"})
    List<TripFile> findByTrip_TripIdOrderByUploadedAtDescFileIdDesc(Long tripId);

    // FR-18: files attached to one activity, newest first
    @EntityGraph(attributePaths = {"uploadedBy", "activity"})
    List<TripFile> findByTrip_TripIdAndActivity_IdOrderByUploadedAtDescFileIdDesc(Long tripId, Long activityId);

    // FR-18: locked lookup for deleting, so simultaneous deletes of one file run
    // one at a time and the later ones find it already gone
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select f from TripFile f where f.fileId = :fileId")
    Optional<TripFile> lockById(@Param("fileId") Long fileId);
}
