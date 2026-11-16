package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.Trip;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.List;
import org.springframework.data.domain.Pageable;

public interface TripRepository extends JpaRepository<Trip, Long>
{
    // Serialize automatic lane selection and membership switches within a trip.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Trip t where t.tripId = :tripId")
    Optional<Trip> lockForScheduling(@Param("tripId") Long tripId);

    @Query("select t from Trip t where t.status = 'PUBLISHED' order by t.updatedAt desc, t.tripId desc")
    List<Trip> findCommunityTrips(Pageable page);


    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Trip t where t.tripId = :tripId and t.status = 'PUBLISHED'")
    Optional<Trip> lockPublishedTrip(@Param("tripId") Long tripId);
    // One row lock per trip serializes payments and expense edits without a balance table.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Trip t where t.tripId = :tripId")
    Optional<Trip> lockFinancialWrites(@Param("tripId") Long tripId);
    // FR-4: serializes invite-code generation and code joins for one trip.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Trip t where t.tripId = :tripId")
    Optional<Trip> lockForMembershipChange(@Param("tripId") Long tripId);

    // FR-4: look up a trip from a shared invite code.
    Optional<Trip> findByInviteCode(String inviteCode);

    // FR-4: same lookup, locked, so a join can't race a code reset or a double submit.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Trip t where t.inviteCode = :inviteCode")
    Optional<Trip> lockByInviteCode(@Param("inviteCode") String inviteCode);

    boolean existsByInviteCode(String inviteCode);

    // FR-22: admin trip list, matching on trip name or destination.
    @Query("select t from Trip t where lower(t.name) like lower(concat('%', :query, '%'))"
            + " or lower(t.destination) like lower(concat('%', :query, '%'))")
    org.springframework.data.domain.Page<Trip> search(@Param("query") String query, Pageable page);
}
