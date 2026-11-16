package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.entity.Activity;
import com.elec5619.group3.trip_planner_backend.entity.Expense;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.repository.ActivityRepository;
import com.elec5619.group3.trip_planner_backend.repository.ExpenseRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import com.elec5619.group3.trip_planner_backend.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class TripSummaryTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired TripRepository trips;
    @Autowired TripMemberRepository members;
    @Autowired ActivityRepository activities;
    @Autowired ExpenseRepository expenses;
    @Autowired JwtUtil jwtUtil;

    @Test
    void oneCallReturnsMembersPlanProgressAndSpendingForEachJoinedTrip() throws Exception {
        User alice = user("alice");
        User bob = user("bob");
        User invited = user("invited");
        User stranger = user("stranger");

        Trip kyoto = trip("Kyoto");
        join(kyoto, alice, "JOINED");
        join(kyoto, bob, "JOINED");
        join(kyoto, invited, "PENDING");
        activity(kyoto, alice, true, false);
        activity(kyoto, alice, false, false);
        activity(kyoto, alice, true, true);
        expense(kyoto, alice, "120.50");
        expense(kyoto, bob, "79.50");

        Trip empty = trip("Empty");
        join(empty, alice, "JOINED");

        Trip other = trip("Not mine");
        join(other, stranger, "JOINED");
        expense(other, stranger, "999.00");

        mvc.perform(get("/api/trips/summaries").header("Authorization", bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                // Pending invites are not members yet; a scheduled branch counts like any scheduled plan.
                .andExpect(jsonPath("$[?(@.tripId == %d)].members.length()".formatted(kyoto.getTripId())).value(2))
                .andExpect(jsonPath("$[?(@.tripId == %d)].plans".formatted(kyoto.getTripId())).value(3))
                .andExpect(jsonPath("$[?(@.tripId == %d)].scheduledPlans".formatted(kyoto.getTripId())).value(2))
                .andExpect(jsonPath("$[?(@.tripId == %d)].spent".formatted(kyoto.getTripId())).value(200.00))
                .andExpect(jsonPath("$[?(@.tripId == %d)].plans".formatted(empty.getTripId())).value(0))
                .andExpect(jsonPath("$[?(@.tripId == %d)].spent".formatted(empty.getTripId())).value(0.00));

        mvc.perform(get("/api/trips/summaries")).andExpect(status().isUnauthorized());
    }

    private String bearer(User user) {
        return "Bearer " + jwtUtil.generateToken(user.getUserId(), user.getEmail(), user.getRole());
    }

    private User user(String username) {
        User user = new User();
        user.setUsername(username);
        user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash("unused");
        return users.save(user);
    }

    private Trip trip(String name) {
        Trip trip = new Trip();
        trip.setName(name);
        trip.setDestination(name);
        trip.setStartDate(LocalDate.of(2026, 11, 1));
        trip.setEndDate(LocalDate.of(2026, 11, 5));
        trip.setPlannedBudget(BigDecimal.valueOf(1000));
        return trips.save(trip);
    }

    private void join(Trip trip, User user, String inviteStatus) {
        TripMember member = new TripMember();
        member.setTrip(trip);
        member.setUser(user);
        member.setRole("MEMBER");
        member.setInviteStatus(inviteStatus);
        members.save(member);
    }

    private void activity(Trip trip, User creator, boolean scheduled, boolean alternative) {
        Activity activity = new Activity();
        activity.setTrip(trip);
        activity.setCreatedBy(creator);
        activity.setName("Plan");
        activity.setLocation("Somewhere");
        activity.setCategory("Sights");
        activity.setBranch(alternative);
        if (scheduled) {
            activity.setDate(LocalDate.of(2026, 11, 2));
            activity.setStartTime(LocalTime.of(9, 0));
            activity.setEndTime(LocalTime.of(11, 0));
        }
        activities.save(activity);
    }

    private void expense(Trip trip, User payer, String amount) {
        Expense expense = new Expense();
        expense.setTrip(trip);
        expense.setPayer(payer);
        expense.setCreatedBy(payer);
        expense.setDescription("Dinner");
        expense.setAmount(new BigDecimal(amount));
        expense.setDate(LocalDate.of(2026, 11, 2));
        expenses.save(expense);
    }
}
