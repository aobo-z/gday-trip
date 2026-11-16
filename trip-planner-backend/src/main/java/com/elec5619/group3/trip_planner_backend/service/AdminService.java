package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.AdminPageResponse;
import com.elec5619.group3.trip_planner_backend.dto.AdminTripResponse;
import com.elec5619.group3.trip_planner_backend.dto.AdminUserResponse;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.exception.ResourceNotFoundException;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** FR-22: the small set of user and trip actions an administrator needs. */
@Service
public class AdminService {

    private static final int PAGE_SIZE = 10;

    private final UserRepository userRepository;
    private final TripRepository tripRepository;
    private final TripMemberRepository tripMemberRepository;
    private final TripService tripService;
    private final AccountStatusService accountStatus;

    public AdminService(UserRepository userRepository, TripRepository tripRepository,
                        TripMemberRepository tripMemberRepository, TripService tripService,
                        AccountStatusService accountStatus) {
        this.userRepository = userRepository;
        this.tripRepository = tripRepository;
        this.tripMemberRepository = tripMemberRepository;
        this.tripService = tripService;
        this.accountStatus = accountStatus;
    }

    @Transactional(readOnly = true)
    public AdminPageResponse<AdminUserResponse> users(String query, int page) {
        return AdminPageResponse.of(userRepository.search(normalize(query), newestFirst(page)).map(this::toResponse));
    }

    public AdminUserResponse setDisabled(Long userId, boolean disabled) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        // Admins can't lock each other (or themselves) out; there is no way back in from the UI.
        if ("ADMIN".equals(user.getRole())) {
            throw new IllegalArgumentException("Administrator accounts can't be disabled.");
        }
        user.setDisabled(disabled);
        User saved = userRepository.save(user);
        accountStatus.remember(saved.getUserId(), saved.isDisabled());
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public AdminPageResponse<AdminTripResponse> trips(String query, int page) {
        return AdminPageResponse.of(tripRepository.search(normalize(query), newestFirst(page)).map(this::toResponse));
    }

    public void deleteTrip(Long tripId) {
        tripService.deleteTripAsAdmin(tripId);
    }

    private AdminUserResponse toResponse(User user) {
        return new AdminUserResponse(user.getUserId(), user.getUsername(), user.getEmail(), user.getRole(),
                user.isDisabled(), user.getCreatedAt());
    }

    private AdminTripResponse toResponse(Trip trip) {
        List<TripMember> joined = tripMemberRepository.findByTrip_TripId(trip.getTripId()).stream()
                .filter(TripMember::isActive)
                .toList();
        String owner = joined.stream()
                .filter(member -> "OWNER".equals(member.getRole()))
                .map(member -> member.getUser().getUsername())
                .findFirst()
                .orElse(null);
        List<AdminTripResponse.Member> members = joined.stream()
                .map(member -> new AdminTripResponse.Member(member.getUser().getUsername(), member.getRole()))
                .toList();
        return new AdminTripResponse(trip.getTripId(), trip.getName(), trip.getDestination(), trip.getStatus(),
                trip.getStartDate(), trip.getEndDate(), trip.getCreatedAt(), owner, members);
    }

    private static String normalize(String query) {
        return query == null ? "" : query.trim();
    }

    private static Pageable newestFirst(int page) {
        return PageRequest.of(Math.max(page, 0), PAGE_SIZE, Sort.by(Sort.Direction.DESC, "createdAt"));
    }
}
