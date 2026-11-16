package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.dto.*;
import com.elec5619.group3.trip_planner_backend.entity.*;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.repository.*;
import com.elec5619.group3.trip_planner_backend.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * FR-3 / FR-4: rules around editing, deleting and leaving trips.
 */
@SpringBootTest(properties = "app.scheduling.sample-data=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TripRulesIntegrationTests {
    @Autowired TripMemberService memberService;
    @Autowired TripService tripService;
    @Autowired ActivityService activityService;
    @Autowired ReviewService reviewService;
    @Autowired ActivityCommentRepository commentRepository;
    @Autowired ActivityPreferenceRepository preferenceRepository;
    @Autowired UpdateHistoryRepository historyRepository;
    @Autowired VoteRepository voteRepository;
    @Autowired ActivityRepository activityRepository;
    @Autowired SettlementRepository settlementRepository;
    @Autowired ExpenseRepository expenseRepository;
    @Autowired ReviewRepository reviewRepository;
    @Autowired TripMemberRepository memberships;
    @Autowired TripRepository trips;
    @Autowired UserRepository users;
    @Autowired MockMvc mvc;
    User owner, member;
    Trip trip;

    @BeforeEach void setup() {
        commentRepository.deleteAll(); preferenceRepository.deleteAll(); historyRepository.deleteAll();
        voteRepository.deleteAll(); activityRepository.deleteAll(); settlementRepository.deleteAll();
        expenseRepository.deleteAll(); reviewRepository.deleteAll(); memberships.deleteAll(); trips.deleteAll(); users.deleteAll();
        owner = user("Owner"); member = user("Member");
        trip = new Trip(); trip.setName("Tokyo"); trip.setDestination("Japan");
        trip.setStartDate(LocalDate.of(2026, 12, 1)); trip.setEndDate(LocalDate.of(2026, 12, 10));
        trip.setPlannedBudget(new BigDecimal("1000.00"));
        trip = trips.save(trip);
        join(owner, "OWNER"); join(member, "MEMBER");
    }
    User user(String name) {
        User u = new User(); u.setUsername(name); u.setEmail(name.toLowerCase() + "@example.test"); u.setPasswordHash("test-only");
        return users.save(u);
    }
    void join(User u, String role) {
        TripMember m = new TripMember(); m.setTrip(trip); m.setUser(u); m.setRole(role); memberships.save(m);
    }
    Long membershipId(User u) {
        return memberships.findByTrip_TripIdAndUser_UserId(trip.getTripId(), u.getUserId()).orElseThrow().getTripMemberId();
    }
    UsernamePasswordAuthenticationToken auth(User u) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedUser(u.getUserId(), u.getEmail()), null, List.of());
    }
    String tripJson(String budget, String extra) {
        return "{\"name\":\"Trip\",\"destination\":\"Kyoto\",\"startDate\":\"2026-12-01\",\"endDate\":\"2026-12-10\",\"plannedBudget\":" + budget + extra + "}";
    }

    @Test void memberAssignedToActivitiesCanStillLeave() {
        // Opening the plan assigns every member to the sample activities.
        List<ActivityResponse> plan = activityService.list(trip.getTripId(), owner.getUserId());
        assertTrue(plan.stream().anyMatch(a -> a.getMemberIds().contains(member.getUserId())));

        memberService.removeMember(trip.getTripId(), membershipId(member), member.getUserId());

        assertTrue(memberships.findByTrip_TripIdAndUser_UserId(trip.getTripId(), member.getUserId()).isEmpty());
        assertTrue(activityService.list(trip.getTripId(), owner.getUserId()).stream()
                .noneMatch(a -> a.getMemberIds().contains(member.getUserId())));
    }

    @Test void ownerCanRemoveMemberAssignedToActivities() {
        activityService.list(trip.getTripId(), owner.getUserId());
        memberService.removeMember(trip.getTripId(), membershipId(member), owner.getUserId());
        assertEquals(1, memberService.getTripMembers(trip.getTripId(), owner.getUserId()).size());
    }

    @Test void editingATripCannotChangeItsStatus() throws Exception {
        for (String status : List.of("ARCHIVED", "BANANA")) {
            mvc.perform(put("/api/trips/" + trip.getTripId()).with(authentication(auth(owner)))
                            .contentType(MediaType.APPLICATION_JSON).content(tripJson("500", ",\"status\":\"" + status + "\"")))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("PLANNING"))
                    .andExpect(jsonPath("$.destination").value("Kyoto"));
        }
        assertEquals("ONGOING", tripService.startTrip(trip.getTripId(), owner.getUserId()).getStatus());
    }

    @Test void completedTripWithReviewsCanBeDeleted() {
        tripService.startTrip(trip.getTripId(), owner.getUserId());
        tripService.archiveTrip(trip.getTripId(), owner.getUserId());
        CreateReviewRequest review = new CreateReviewRequest();
        review.setRevieweeId(member.getUserId()); review.setRating(5); review.setComment("Great travel buddy");
        reviewService.createReview(trip.getTripId(), owner.getUserId(), review);

        tripService.deleteTrip(trip.getTripId(), owner.getUserId());

        assertFalse(trips.existsById(trip.getTripId()));
        assertEquals(0, reviewRepository.count());
    }

    @Test void plannedBudgetMustFitTheDatabaseColumn() throws Exception {
        mvc.perform(post("/api/trips").with(authentication(auth(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(tripJson("99999999.99", "")))
                .andExpect(status().isCreated());
        for (String budget : List.of("100000000", "1e30", "10.999")) {
            mvc.perform(post("/api/trips").with(authentication(auth(owner)))
                            .contentType(MediaType.APPLICATION_JSON).content(tripJson(budget, "")))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message", containsString("Planned budget must be at most 99,999,999.99")));
            mvc.perform(put("/api/trips/" + trip.getTripId()).with(authentication(auth(owner)))
                            .contentType(MediaType.APPLICATION_JSON).content(tripJson(budget, "")))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test void branchPlaceCanBeAddedWithoutAScheduleAndDraggedOntoAndOffTheDay() throws Exception {
        mvc.perform(post("/api/trips/" + trip.getTripId() + "/branches").with(authentication(auth(member)))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"name":"Blue Mountains National Park","location":"New South Wales, Australia","category":"Activity"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.branch").value(true))
                .andExpect(jsonPath("$.date").isEmpty())
                .andExpect(jsonPath("$.startTime").isEmpty())
                .andExpect(jsonPath("$.endTime").isEmpty())
                .andExpect(jsonPath("$.approveCount").value(0));
        Long id = activityRepository.findAll().get(0).getId();
        mvc.perform(put("/api/activities/" + id + "/schedule").with(authentication(auth(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"date":"2026-12-01","startTime":"10:00","endTime":"11:00"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.date").value("2026-12-01"))
                .andExpect(jsonPath("$.startTime").value("10:00:00"))
                .andExpect(jsonPath("$.endTime").value("11:00:00"));
        mvc.perform(put("/api/activities/" + id + "/schedule").with(authentication(auth(member)))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"date":null,"startTime":null,"endTime":null}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.date").isEmpty())
                .andExpect(jsonPath("$.branch").value(true));
        mvc.perform(get("/api/activities/" + id).with(authentication(auth(member))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.date").isEmpty())
                .andExpect(jsonPath("$.branch").value(true));
        mvc.perform(put("/api/activities/" + id + "/vote").with(authentication(auth(member)))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"vote\":\"APPROVE\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/activities/" + id + "/branch").with(authentication(auth(member))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.branch").value(false))
                .andExpect(jsonPath("$.status").value("PENDING"));
        mvc.perform(put("/api/activities/" + id + "/vote").with(authentication(auth(member)))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"vote\":\"APPROVE\"}"))
                .andExpect(status().isOk());
    }

    @Test void aCommentCanBeDeletedByItsAuthorOrAnOwnerOnly() throws Exception {
        Long id = activityService.list(trip.getTripId(), owner.getUserId()).get(0).getId();
        Long mine = activityService.addComment(id, "Member's note", member.getUserId()).getId();
        Long owners = activityService.addComment(id, "Owner's note", owner.getUserId()).getId();
        mvc.perform(delete("/api/activities/" + id + "/comments/" + owners).with(authentication(auth(member))))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/activities/" + id + "/comments/" + mine).with(authentication(auth(member))))
                .andExpect(status().isNoContent());
        mvc.perform(delete("/api/activities/" + id + "/comments/" + owners).with(authentication(auth(owner))))
                .andExpect(status().isNoContent());
        assertTrue(activityService.listComments(id, owner.getUserId()).isEmpty());
    }

    @Test void archivedTripKeepsItsPlanButItsDetailsStayEditableUntilPublished() throws Exception {
        tripService.startTrip(trip.getTripId(), owner.getUserId());
        tripService.archiveTrip(trip.getTripId(), owner.getUserId());
        mvc.perform(put("/api/trips/" + trip.getTripId()).with(authentication(auth(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(tripJson("500", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.destination").value("Kyoto"))
                .andExpect(jsonPath("$.status").value("ARCHIVED"));
        mvc.perform(post("/api/trips/" + trip.getTripId() + "/branches").with(authentication(auth(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Late add\",\"location\":\"Kyoto\",\"category\":\"Food\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("plan can't be changed")));

        tripService.publishTrip(trip.getTripId(), owner.getUserId());
        mvc.perform(put("/api/trips/" + trip.getTripId()).with(authentication(auth(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(tripJson("600", "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("Remove this trip from Community")));
        tripService.unpublishTrip(trip.getTripId(), owner.getUserId());
        mvc.perform(put("/api/trips/" + trip.getTripId()).with(authentication(auth(owner)))
                        .contentType(MediaType.APPLICATION_JSON).content(tripJson("600", "")))
                .andExpect(status().isOk());
    }
}
