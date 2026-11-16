package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.UpdateHistory;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;

public interface UpdateHistoryRepository extends JpaRepository<UpdateHistory, Long> {
    @Query("select distinct h.description from UpdateHistory h where h.trip.tripId = :tripId and h.changeType = :type")
    List<String> findDescriptions(@Param("tripId") Long tripId, @Param("type") String type);

    List<UpdateHistory> findTop50ByTrip_TripIdOrderByChangedAtDescLogIdDesc(Long tripId);

    // One query: the author is fetched with each entry, and only the requested change types are read.
    @Query("select h from UpdateHistory h join fetch h.changedBy where h.trip.tripId = :tripId and h.changeType in :types"
            + " order by h.changedAt desc, h.logId desc")
    List<UpdateHistory> findRecentOfTypes(@Param("tripId") Long tripId, @Param("types") Collection<String> types, Pageable page);
    boolean existsByTrip_TripIdAndChangeTypeAndDescriptionStartingWith(
            Long tripId, String changeType, String descriptionPrefix);
}
