package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.CommunityCommentResponse;
import com.elec5619.group3.trip_planner_backend.entity.CommunityComment;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.repository.CommunityCommentRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;

/** Public comments on a shared trip: anyone signed in reads and posts; the author or a trip owner deletes. */
@Service
@Transactional(readOnly = true)
public class CommunityCommentService {
    private final CommunityCommentRepository comments;
    private final TripRepository trips;
    private final TripMemberRepository members;
    private final UserRepository users;

    public CommunityCommentService(CommunityCommentRepository comments, TripRepository trips, TripMemberRepository members, UserRepository users) {
        this.comments = comments; this.trips = trips; this.members = members; this.users = users;
    }

    public List<CommunityCommentResponse> list(Long tripId, Long userId) {
        Trip trip = published(tripId);
        boolean owner = isOwner(tripId, userId);
        return comments.findByTrip_TripIdOrderByCreatedAtAscIdAsc(trip.getTripId()).stream().map(c -> response(c, userId, owner)).toList();
    }

    @Transactional
    public CommunityCommentResponse create(Long tripId, String content, Long userId) {
        CommunityComment c = new CommunityComment();
        c.setTrip(published(tripId));
        c.setAuthor(users.findById(userId).orElseThrow());
        c.setContent(content.trim());
        c.setCreatedAt(LocalDateTime.now());
        return response(comments.saveAndFlush(c), userId, isOwner(tripId, userId));
    }

    @Transactional
    public void delete(Long tripId, Long commentId, Long userId) {
        published(tripId);
        CommunityComment c = comments.findById(commentId).filter(x -> x.getTrip().getTripId().equals(tripId))
                .orElseThrow(() -> new NoSuchElementException("Comment not found"));
        if (!c.getAuthor().getUserId().equals(userId) && !isOwner(tripId, userId))
            throw new AccessDeniedException("Only the author or a trip owner can delete this comment");
        comments.delete(c);
    }

    private Trip published(Long tripId) {
        return trips.findById(tripId).filter(t -> "PUBLISHED".equals(t.getStatus()))
                .orElseThrow(() -> new NoSuchElementException("Published trip not found"));
    }

    private boolean isOwner(Long tripId, Long userId) {
        return members.findByTrip_TripIdAndUser_UserId(tripId, userId).map(m -> "OWNER".equals(m.getRole())).orElse(false);
    }

    private static CommunityCommentResponse response(CommunityComment c, Long userId, boolean owner) {
        boolean mine = c.getAuthor().getUserId().equals(userId);
        return new CommunityCommentResponse(c.getId(), c.getContent(), c.getAuthor().getUserId(), c.getAuthor().getUsername(), c.getCreatedAt(), mine || owner);
    }
}
