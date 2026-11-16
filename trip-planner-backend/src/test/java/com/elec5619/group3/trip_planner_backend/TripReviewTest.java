package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import com.elec5619.group3.trip_planner_backend.util.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** FR-20: members review each other once a trip is over. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TripReviewTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired TripRepository trips;
    @Autowired TripMemberRepository members;
    @Autowired JwtUtil jwtUtil;

    private User alice;
    private User bob;
    private Trip trip;

    @BeforeEach
    void setUp() {
        alice = user("alice");
        bob = user("bob");
        trip = new Trip();
        trip.setName("Kyoto");
        trip.setDestination("Kyoto");
        trip.setStartDate(LocalDate.of(2026, 9, 1));
        trip.setEndDate(LocalDate.of(2026, 9, 5));
        trip.setPlannedBudget(BigDecimal.valueOf(1000));
        trip = trips.save(trip);
        join(alice, "OWNER");
        join(bob, "MEMBER");
    }

    @Test
    void reviewsOpenOnlyOnceTheTripIsArchived() throws Exception {
        review(alice, bob, 5)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Reviews can only be submitted after the trip is archived"));

        complete();
        review(alice, bob, 5)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.rating").value(5));
    }

    @Test
    void reviewsOpenWhenArchivedAndStayOpenAfterPublishing() throws Exception {
        lifecycle("start").andExpect(jsonPath("$.status").value("ONGOING"));
        review(alice, bob, 5).andExpect(status().isBadRequest());

        lifecycle("archive").andExpect(jsonPath("$.status").value("ARCHIVED"));
        review(alice, bob, 5).andExpect(status().isCreated());

        lifecycle("publish").andExpect(jsonPath("$.status").value("PUBLISHED"));
        review(bob, alice, 4).andExpect(status().isCreated());
    }

    @Test
    void eachMemberCanBeReviewedOnceAndNeverByThemselves() throws Exception {
        complete();

        review(alice, alice, 5)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("You cannot review yourself"));
        review(alice, bob, 4).andExpect(status().isCreated());
        review(alice, bob, 1)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("You have already reviewed this member for this trip"));
    }

    @Test
    void onlyMembersCanReviewOrBeReviewed() throws Exception {
        complete();
        User outsider = user("outsider");

        review(outsider, bob, 5).andExpect(status().isForbidden());
        review(alice, outsider, 5)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Reviewee is not a member of this trip"));
    }

    @Test
    void authorsSeeTheReviewsTheyWrote() throws Exception {
        complete();
        review(alice, bob, 4).andExpect(status().isCreated());

        String token = jwtUtil.generateToken(alice.getUserId(), alice.getEmail(), alice.getRole());
        mvc.perform(get("/api/users/me/reviews/written").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].revieweeName").value("bob"))
                .andExpect(jsonPath("$[0].tripName").value("Kyoto"))
                .andExpect(jsonPath("$[0].rating").value(4));
        String bobToken = jwtUtil.generateToken(bob.getUserId(), bob.getEmail(), bob.getRole());
        mvc.perform(get("/api/users/me/reviews/written").header("Authorization", "Bearer " + bobToken))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void anotherTravellerSeesTheRatingButNotTripsTheyWereNotOn() throws Exception {
        complete();
        review(alice, bob, 4).andExpect(status().isCreated());
        User stranger = user("stranger");

        profile(stranger, bob)
                .andExpect(jsonPath("$.averageRating").value(4.0))
                .andExpect(jsonPath("$.reviews[0].reviewerName").value("alice"))
                .andExpect(jsonPath("$.reviews[0].tripName").doesNotExist())
                .andExpect(jsonPath("$.reviews[0].tripId").doesNotExist());
        profile(alice, bob).andExpect(jsonPath("$.reviews[0].tripName").value("Kyoto"));
        profile(bob, bob).andExpect(jsonPath("$.reviews[0].tripName").value("Kyoto"));

        trip.setStatus("PUBLISHED");
        trips.save(trip);
        profile(stranger, bob).andExpect(jsonPath("$.reviews[0].tripName").value("Kyoto"));
    }

    private ResultActions profile(User viewer, User owner) throws Exception {
        String token = jwtUtil.generateToken(viewer.getUserId(), viewer.getEmail(), viewer.getRole());
        return mvc.perform(get("/api/users/{userId}/reviews", owner.getUserId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    private ResultActions review(User reviewer, User reviewee, int rating) throws Exception {
        String token = jwtUtil.generateToken(reviewer.getUserId(), reviewer.getEmail(), reviewer.getRole());
        return mvc.perform(post("/api/trips/{tripId}/reviews", trip.getTripId())
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"revieweeId":%d,"rating":%d,"comment":"Great travel buddy"}""".formatted(reviewee.getUserId(), rating)));
    }

    /** Moves the trip one lifecycle step as its owner. */
    private ResultActions lifecycle(String step) throws Exception {
        String token = jwtUtil.generateToken(alice.getUserId(), alice.getEmail(), alice.getRole());
        return mvc.perform(put("/api/trips/{tripId}/" + step, trip.getTripId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    private void complete() {
        trip.setStatus("ARCHIVED");
        trip = trips.save(trip);
    }

    private User user(String username) {
        User user = new User();
        user.setUsername(username);
        user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash("unused");
        return users.save(user);
    }

    private void join(User user, String role) {
        TripMember member = new TripMember();
        member.setTrip(trip);
        member.setUser(user);
        member.setRole(role);
        members.save(member);
    }
}
