package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.CreateReviewRequest;
import com.elec5619.group3.trip_planner_backend.dto.ReviewResponse;
import com.elec5619.group3.trip_planner_backend.dto.ReviewableMemberResponse;
import com.elec5619.group3.trip_planner_backend.dto.UserReviewSummaryResponse;
import com.elec5619.group3.trip_planner_backend.entity.Review;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.exception.ResourceNotFoundException;
import com.elec5619.group3.trip_planner_backend.repository.ReviewRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final TripRepository tripRepository;
    private final TripMemberRepository tripMemberRepository;

    public ReviewService(ReviewRepository reviewRepository, TripRepository tripRepository, TripMemberRepository tripMemberRepository) {
        this.reviewRepository = reviewRepository;
        this.tripRepository = tripRepository;
        this.tripMemberRepository = tripMemberRepository;
    }

    /**
     * FR-20: Submit a review for another member of a completed trip.
     */
    @Transactional
    public ReviewResponse createReview(Long tripId, Long reviewerId, CreateReviewRequest request) {
        TripMember reviewerMembership = tripMemberRepository.findByTrip_TripIdAndUser_UserId(tripId, reviewerId)
                .filter(TripMember::isActive)
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this trip"));

        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new ResourceNotFoundException("Trip not found"));

        if (!trip.isFinished()) {
            throw new IllegalArgumentException("Reviews can only be submitted after the trip is archived");
        }

        if (request.getRevieweeId().equals(reviewerId)) {
            throw new IllegalArgumentException("You cannot review yourself");
        }

        TripMember revieweeMembership = tripMemberRepository.findByTrip_TripIdAndUser_UserId(tripId, request.getRevieweeId())
                .filter(TripMember::isActive)
                .orElseThrow(() -> new IllegalArgumentException("Reviewee is not a member of this trip"));

        if (reviewRepository.existsByTrip_TripIdAndReviewer_UserIdAndReviewee_UserId(tripId, reviewerId, request.getRevieweeId())) {
            throw new IllegalArgumentException("You have already reviewed this member for this trip");
        }

        Review review = new Review();
        review.setTrip(trip);
        review.setReviewer(reviewerMembership.getUser());
        review.setReviewee(revieweeMembership.getUser());
        review.setRating(request.getRating());
        review.setComment(request.getComment());

        return toResponse(reviewRepository.save(review));
    }

    /**
     * FR-20: List the other members of a completed trip, and whether the
     * current user has already reviewed each one.
     */
    public List<ReviewableMemberResponse> getReviewableMembers(Long tripId, Long reviewerId) {
        tripMemberRepository.findByTrip_TripIdAndUser_UserId(tripId, reviewerId)
                .filter(TripMember::isActive)
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this trip"));

        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new ResourceNotFoundException("Trip not found"));

        if (!trip.isFinished()) {
            throw new IllegalArgumentException("Reviews are only available after the trip is archived");
        }

        Set<Long> alreadyReviewed = reviewRepository.findByTrip_TripIdAndReviewer_UserId(tripId, reviewerId).stream()
                .map(review -> review.getReviewee().getUserId())
                .collect(Collectors.toSet());

        return tripMemberRepository.findByTrip_TripId(tripId).stream()
                .filter(TripMember::isActive)
                .filter(member -> !member.getUser().getUserId().equals(reviewerId))
                .map(member -> ReviewableMemberResponse.builder()
                        .userId(member.getUser().getUserId())
                        .username(member.getUser().getUsername())
                        .alreadyReviewed(alreadyReviewed.contains(member.getUser().getUserId()))
                        .build())
                .toList();
    }

    /**
     * A user's average rating and received reviews, for display on their profile.
     * Another viewer sees the trip a review came from only when they were on that
     * trip or it has been shared to Community; otherwise it stays private.
     */
    @Transactional(readOnly = true)
    public UserReviewSummaryResponse getUserReviews(Long userId, Long viewerId) {
        List<Review> reviews = reviewRepository.findByReviewee_UserIdOrderByCreatedAtDesc(userId);
        double average = reviews.stream().mapToInt(Review::getRating).average().orElse(0.0);
        Set<Long> viewerTrips = userId.equals(viewerId) ? Set.of() : tripMemberRepository.findByUser_UserId(viewerId).stream()
                .filter(TripMember::isActive)
                .map(member -> member.getTrip().getTripId())
                .collect(Collectors.toSet());

        return UserReviewSummaryResponse.builder()
                .averageRating(Math.round(average * 10) / 10.0)
                .reviewCount(reviews.size())
                .reviews(reviews.stream().map(review -> {
                    Trip source = review.getTrip();
                    boolean visible = userId.equals(viewerId) || viewerTrips.contains(source.getTripId()) || "PUBLISHED".equals(source.getStatus());
                    return toResponse(review, visible);
                }).toList())
                .build();
    }

    /** Reviews the user has written, newest first. Only ever shown to the author, so the trip is always included. */
    @Transactional(readOnly = true)
    public List<ReviewResponse> getWrittenReviews(Long reviewerId) {
        return reviewRepository.findByReviewer_UserIdOrderByCreatedAtDesc(reviewerId).stream().map(this::toResponse).toList();
    }

    private ReviewResponse toResponse(Review review) {
        return toResponse(review, true);
    }

    private ReviewResponse toResponse(Review review, boolean showTrip) {
        return ReviewResponse.builder()
                .reviewId(review.getReviewId())
                .tripId(showTrip ? review.getTrip().getTripId() : null)
                .tripName(showTrip ? review.getTrip().getName() : null)
                .reviewerId(review.getReviewer().getUserId())
                .reviewerName(review.getReviewer().getUsername())
                .revieweeId(review.getReviewee().getUserId())
                .revieweeName(review.getReviewee().getUsername())
                .rating(review.getRating())
                .comment(review.getComment())
                .createdAt(review.getCreatedAt())
                .build();
    }
}
