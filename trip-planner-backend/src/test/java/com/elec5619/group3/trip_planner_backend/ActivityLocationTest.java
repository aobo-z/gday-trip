package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.dto.ActivityLocationRequest;
import com.elec5619.group3.trip_planner_backend.dto.ActivityResponse;
import com.elec5619.group3.trip_planner_backend.dto.CreateActivityRequest;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import com.elec5619.group3.trip_planner_backend.service.ActivityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
class ActivityLocationTest {
    @Autowired ActivityService activityService;
    @Autowired TripRepository tripRepository;
    @Autowired TripMemberRepository memberRepository;
    @Autowired UserRepository userRepository;

    private Trip trip;
    private User owner;
    private User member;

    @BeforeEach
    void setUp() {
        owner = user("Owner");
        member = user("Member");
        trip = new Trip();
        trip.setName("Sydney"); trip.setDestination("Sydney");
        trip.setStartDate(LocalDate.of(2026, 8, 1)); trip.setEndDate(LocalDate.of(2026, 8, 5));
        trip.setPlannedBudget(BigDecimal.valueOf(1000));
        trip = tripRepository.save(trip);
        membership(owner, "OWNER");
        membership(member, "MEMBER");
    }

    @Test
    void coordinatesFromDiscoverSurviveEditsThatLeaveThemOut() {
        ActivityResponse created = activityService.create(trip.getTripId(), place(-33.8568, 151.2153), owner.getUserId());
        assertThat(created.getLatitude()).isEqualTo(-33.8568);
        assertThat(created.getLongitude()).isEqualTo(151.2153);

        CreateActivityRequest edit = place(null, null);
        edit.setName("Opera House tour");
        ActivityResponse edited = activityService.update(created.getId(), edit, owner.getUserId());

        assertThat(edited.getName()).isEqualTo("Opera House tour");
        assertThat(edited.getLatitude()).isEqualTo(-33.8568);
        assertThat(edited.getLongitude()).isEqualTo(151.2153);
    }

    @Test
    void activitiesWithoutCoordinatesCanBePinnedLater() {
        ActivityResponse created = activityService.create(trip.getTripId(), place(null, null), member.getUserId());
        assertThat(created.getLatitude()).isNull();

        ActivityResponse pinned = activityService.updateLocation(created.getId(), location(-33.86, 151.21), member.getUserId());

        assertThat(pinned.getLatitude()).isEqualTo(-33.86);
        assertThat(pinned.getLongitude()).isEqualTo(151.21);
    }

    @Test
    void onlyTheCreatorOrAnOwnerCanMoveAPin() {
        ActivityResponse created = activityService.create(trip.getTripId(), place(null, null), owner.getUserId());

        assertThatThrownBy(() -> activityService.updateLocation(created.getId(), location(-33.86, 151.21), member.getUserId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void halfACoordinatePairIsRejected() {
        assertThatThrownBy(() -> activityService.create(trip.getTripId(), place(-33.86, null), owner.getUserId()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("together");
    }

    private CreateActivityRequest place(Double latitude, Double longitude) {
        CreateActivityRequest request = new CreateActivityRequest();
        request.setName("Sydney Opera House");
        request.setLocation("Bennelong Point, Sydney NSW 2000, Australia");
        request.setCategory("Culture");
        request.setLatitude(latitude);
        request.setLongitude(longitude);
        return request;
    }

    private ActivityLocationRequest location(double latitude, double longitude) {
        ActivityLocationRequest request = new ActivityLocationRequest();
        request.setLatitude(latitude);
        request.setLongitude(longitude);
        return request;
    }

    private User user(String name) {
        User user = new User();
        user.setUsername(name);
        user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash("hash");
        return userRepository.save(user);
    }

    private void membership(User user, String role) {
        TripMember membership = new TripMember();
        membership.setTrip(trip);
        membership.setUser(user);
        membership.setRole(role);
        memberRepository.save(membership);
    }
}
