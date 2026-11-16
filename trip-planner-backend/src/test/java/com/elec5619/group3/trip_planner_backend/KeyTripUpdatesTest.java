package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import com.elec5619.group3.trip_planner_backend.service.UpdateHistoryService;
import com.elec5619.group3.trip_planner_backend.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The trip overview only shows the latest key changes; the full history endpoint is unchanged. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class KeyTripUpdatesTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired TripRepository trips;
    @Autowired TripMemberRepository members;
    @Autowired UpdateHistoryService history;
    @Autowired JwtUtil jwtUtil;

    @Test
    void onlyTheLatestKeyChangesAreListedAndOnlyForMembers() throws Exception {
        User alice = user("alice");
        User outsider = user("outsider");
        Trip trip = trip(alice);

        history.record(trip, alice, "VOTE_CHANGED", "Voted APPROVE on #1: Market");
        history.record(trip, alice, "COMMENT_ADDED", "Commented on #1: Market");
        for (int i = 1; i <= 9; i++) {
            history.record(trip, alice, "PROPOSAL_CREATED", "Proposed activity #" + i + ": Place " + i);
        }
        history.record(trip, alice, "ACTIVITY_SCHEDULED", "Scheduled #9: Place 9");

        mvc.perform(get("/api/trips/{id}/updates/key", trip.getTripId()).header("Authorization", bearer(alice)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(8))
                .andExpect(jsonPath("$[0].changeType").value("ACTIVITY_SCHEDULED"))
                .andExpect(jsonPath("$[0].changedByUsername").value("alice"))
                .andExpect(jsonPath("$[?(@.changeType == 'VOTE_CHANGED' || @.changeType == 'COMMENT_ADDED')]").isEmpty());

        // The full history still includes every type.
        mvc.perform(get("/api/trips/{id}/updates", trip.getTripId()).header("Authorization", bearer(alice)))
                .andExpect(jsonPath("$.length()").value(12));

        mvc.perform(get("/api/trips/{id}/updates/key", trip.getTripId()).header("Authorization", bearer(outsider)))
                .andExpect(status().isForbidden());
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

    private Trip trip(User owner) {
        Trip trip = new Trip();
        trip.setName("Kyoto");
        trip.setDestination("Kyoto");
        trip.setStartDate(LocalDate.of(2026, 11, 1));
        trip.setEndDate(LocalDate.of(2026, 11, 5));
        trip.setPlannedBudget(BigDecimal.valueOf(1000));
        trip = trips.save(trip);
        TripMember member = new TripMember();
        member.setTrip(trip);
        member.setUser(owner);
        member.setRole("OWNER");
        members.save(member);
        return trip;
    }
}
