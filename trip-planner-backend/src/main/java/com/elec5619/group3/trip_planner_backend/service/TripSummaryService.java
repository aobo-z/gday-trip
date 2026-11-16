package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.TripSummaryResponse;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Card figures for every trip the user has joined, in four queries in total rather than
 * three requests per trip.
 */
@Service
public class TripSummaryService {

    private final EntityManager entityManager;

    public TripSummaryService(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Transactional(readOnly = true)
    public List<TripSummaryResponse> summaries(Long userId) {
        List<Long> tripIds = entityManager.createQuery("""
                        select m.trip.tripId from TripMember m
                        where m.user.userId = :userId and m.inviteStatus = 'JOINED'
                        """, Long.class)
                .setParameter("userId", userId)
                .getResultList();
        if (tripIds.isEmpty()) return List.of();

        Map<Long, List<TripSummaryResponse.Member>> members = new LinkedHashMap<>();
        entityManager.createQuery("""
                        select m.trip.tripId, u.userId, u.username from TripMember m join m.user u
                        where m.trip.tripId in :tripIds and m.inviteStatus = 'JOINED'
                        order by m.joinedAt, m.tripMemberId
                        """, Object[].class)
                .setParameter("tripIds", tripIds)
                .getResultList()
                .forEach(row -> members.computeIfAbsent((Long) row[0], id -> new ArrayList<>())
                        .add(new TripSummaryResponse.Member((Long) row[1], (String) row[2])));

        // Every activity counts, branches included: a scheduled branch is scheduled like any other plan.
        Map<Long, long[]> plans = new HashMap<>();
        entityManager.createQuery("""
                        select a.trip.tripId, count(a),
                               sum(case when a.date is not null and a.startTime is not null then 1 else 0 end)
                        from Activity a
                        where a.trip.tripId in :tripIds
                        group by a.trip.tripId
                        """, Object[].class)
                .setParameter("tripIds", tripIds)
                .getResultList()
                .forEach(row -> plans.put((Long) row[0], new long[] {((Number) row[1]).longValue(), ((Number) row[2]).longValue()}));

        Map<Long, BigDecimal> spent = new HashMap<>();
        entityManager.createQuery("""
                        select e.trip.tripId, sum(e.amount) from Expense e
                        where e.trip.tripId in :tripIds
                        group by e.trip.tripId
                        """, Object[].class)
                .setParameter("tripIds", tripIds)
                .getResultList()
                .forEach(row -> spent.put((Long) row[0], (BigDecimal) row[1]));

        return tripIds.stream().map(tripId -> {
            long[] counts = plans.getOrDefault(tripId, new long[] {0, 0});
            return new TripSummaryResponse(tripId, members.getOrDefault(tripId, List.of()), counts[0], counts[1],
                    spent.getOrDefault(tripId, BigDecimal.ZERO.setScale(2)));
        }).toList();
    }
}
