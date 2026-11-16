package com.elec5619.group3.trip_planner_backend;

import static com.elec5619.group3.trip_planner_backend.TestTimes.assertSameMicrosecond;
import com.elec5619.group3.trip_planner_backend.dto.*;
import com.elec5619.group3.trip_planner_backend.entity.*;
import com.elec5619.group3.trip_planner_backend.exception.ResourceNotFoundException;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.repository.*;
import com.elec5619.group3.trip_planner_backend.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
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
 * FR-19: Trip announcements.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AnnouncementIntegrationTests {
    @Autowired AnnouncementService announcements;
    @Autowired TripMemberService memberService;
    @Autowired TripService tripService;
    @Autowired AnnouncementRepository announcementRepository;
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
    User owner, coOwner, member, invitee, stranger;
    Trip trip, otherTrip;

    @BeforeEach void setup() {
        commentRepository.deleteAll(); preferenceRepository.deleteAll(); historyRepository.deleteAll();
        voteRepository.deleteAll(); activityRepository.deleteAll(); settlementRepository.deleteAll();
        expenseRepository.deleteAll(); reviewRepository.deleteAll(); announcementRepository.deleteAll();
        memberships.deleteAll(); trips.deleteAll(); users.deleteAll();
        owner = user("Owner"); coOwner = user("CoOwner"); member = user("Member"); invitee = user("Invitee"); stranger = user("Stranger");
        trip = trip("Tokyo"); otherTrip = trip("Paris");
        join(trip, owner, "OWNER", "JOINED"); join(trip, coOwner, "OWNER", "JOINED");
        join(trip, member, "MEMBER", "JOINED"); join(trip, invitee, "MEMBER", "PENDING");
        join(otherTrip, stranger, "OWNER", "JOINED");
    }
    User user(String name) {
        User u = new User(); u.setUsername(name); u.setEmail(name.toLowerCase() + "@example.test"); u.setPasswordHash("test-only");
        return users.save(u);
    }
    Trip trip(String name) {
        Trip t = new Trip(); t.setName(name); t.setDestination(name);
        t.setStartDate(LocalDate.of(2026, 12, 1)); t.setEndDate(LocalDate.of(2026, 12, 10)); t.setPlannedBudget(new BigDecimal("1000.00"));
        return trips.save(t);
    }
    void join(Trip t, User u, String role, String status) {
        TripMember m = new TripMember(); m.setTrip(t); m.setUser(u); m.setRole(role); m.setInviteStatus(status); memberships.save(m);
    }
    AnnouncementRequest request(String title, String content) {
        AnnouncementRequest r = new AnnouncementRequest(); r.setTitle(title); r.setContent(content); return r;
    }
    AnnouncementResponse publish(User by, String title) {
        return announcements.createAnnouncement(trip.getTripId(), request(title, "Details for " + title), by.getUserId());
    }
    List<AnnouncementResponse> list(User viewer) {
        return announcements.getAnnouncements(trip.getTripId(), viewer.getUserId());
    }
    UsernamePasswordAuthenticationToken auth(User u) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedUser(u.getUserId(), u.getEmail()), null, List.of());
    }

    @Test void ownerPublishesAndMembersCanReadIt() {
        AnnouncementResponse a = announcements.createAnnouncement(trip.getTripId(),
                request("  Flight moved  ", "  Now departing at 9:40am.\nMeet at gate 12.  "), owner.getUserId());
        assertEquals("Flight moved", a.getTitle());
        assertEquals("Now departing at 9:40am.\nMeet at gate 12.", a.getContent());
        assertEquals("Owner", a.getAuthorName());
        assertEquals(owner.getUserId(), a.getAuthorId());
        assertNotNull(a.getPublishedAt());
        assertFalse(a.isEdited());

        List<AnnouncementResponse> seenByMember = list(member);
        assertEquals(1, seenByMember.size());
        assertEquals("Flight moved", seenByMember.get(0).getTitle());
        assertFalse(seenByMember.get(0).isCanManage());
        assertTrue(list(owner).get(0).isCanManage());
        assertTrue(list(coOwner).get(0).isCanManage());
    }

    @Test void announcementsAreShownNewestFirst() {
        publish(owner, "First");
        publish(coOwner, "Second");
        publish(owner, "Third");
        assertEquals(List.of("Third", "Second", "First"), list(member).stream().map(AnnouncementResponse::getTitle).toList());
    }

    @Test void onlyOwnersCanPublishEditOrRemove() {
        Long id = publish(owner, "Hotel").getAnnouncementId();
        assertThrows(AccessDeniedException.class, () -> announcements.createAnnouncement(trip.getTripId(), request("x", "y"), member.getUserId()));
        assertThrows(AccessDeniedException.class, () -> announcements.updateAnnouncement(trip.getTripId(), id, request("x", "y"), member.getUserId()));
        assertThrows(AccessDeniedException.class, () -> announcements.deleteAnnouncement(trip.getTripId(), id, member.getUserId()));
        assertEquals("Hotel", list(owner).get(0).getTitle());
    }

    @Test void outsidersAndPendingInviteesCannotSeeAnnouncements() {
        publish(owner, "Secret plan");
        assertThrows(AccessDeniedException.class, () -> list(stranger));
        assertThrows(AccessDeniedException.class, () -> list(invitee));
        assertThrows(AccessDeniedException.class, () -> announcements.createAnnouncement(trip.getTripId(), request("x", "y"), invitee.getUserId()));
        assertThrows(ResourceNotFoundException.class, () -> announcements.getAnnouncements(99999L, owner.getUserId()));
    }

    @Test void editingKeepsThePublicationTimeAndMarksItEdited() throws Exception {
        AnnouncementResponse original = publish(owner, "Dinner");
        Thread.sleep(5);
        AnnouncementResponse edited = announcements.updateAnnouncement(trip.getTripId(), original.getAnnouncementId(),
                request("Dinner moved", "Now at 8pm"), owner.getUserId());

        assertEquals("Dinner moved", edited.getTitle());
        assertEquals("Now at 8pm", edited.getContent());
        assertSameMicrosecond(original.getPublishedAt(), edited.getPublishedAt());
        assertTrue(edited.getUpdatedAt().isAfter(original.getPublishedAt()));
        assertTrue(edited.isEdited());
        assertTrue(list(member).get(0).isEdited());
    }

    @Test void anyOwnerCanManageAnotherOwnersAnnouncement() {
        Long id = publish(owner, "Packing list").getAnnouncementId();
        assertEquals("Updated by co-owner", announcements.updateAnnouncement(trip.getTripId(), id,
                request("Updated by co-owner", "Bring adaptors"), coOwner.getUserId()).getTitle());
        announcements.deleteAnnouncement(trip.getTripId(), id, coOwner.getUserId());
        assertTrue(list(owner).isEmpty());
    }

    @Test void aDemotedOwnerLosesManagementRights() {
        Long id = publish(owner, "Visa reminder").getAnnouncementId();
        Long ownerMembership = memberships.findByTrip_TripIdAndUser_UserId(trip.getTripId(), owner.getUserId()).orElseThrow().getTripMemberId();
        UpdateMemberRoleRequest demote = new UpdateMemberRoleRequest(); demote.setRole("MEMBER");
        memberService.updateMemberRole(trip.getTripId(), ownerMembership, demote, coOwner.getUserId());

        assertThrows(AccessDeniedException.class, () -> announcements.deleteAnnouncement(trip.getTripId(), id, owner.getUserId()));
        assertFalse(list(owner).get(0).isCanManage());
        assertEquals("Owner", list(owner).get(0).getAuthorName());
    }

    @Test void removingIsPermanentAndRepeatsAreNotFound() {
        Long id = publish(owner, "Taxi").getAnnouncementId();
        announcements.deleteAnnouncement(trip.getTripId(), id, owner.getUserId());
        assertTrue(list(member).isEmpty());
        assertThrows(ResourceNotFoundException.class, () -> announcements.deleteAnnouncement(trip.getTripId(), id, owner.getUserId()));
        assertThrows(ResourceNotFoundException.class, () -> announcements.updateAnnouncement(trip.getTripId(), id, request("a", "b"), owner.getUserId()));
    }

    @Test void anAnnouncementCannotBeReachedThroughAnotherTrip() {
        Long id = publish(owner, "Tokyo only").getAnnouncementId();
        // The other trip's owner is an owner, but not of the trip that owns this announcement.
        assertThrows(ResourceNotFoundException.class, () -> announcements.updateAnnouncement(otherTrip.getTripId(), id, request("hijack", "x"), stranger.getUserId()));
        assertThrows(ResourceNotFoundException.class, () -> announcements.deleteAnnouncement(otherTrip.getTripId(), id, stranger.getUserId()));
        assertEquals("Tokyo only", list(owner).get(0).getTitle());
    }

    @Test void deletingTheTripDeletesItsAnnouncements() {
        publish(owner, "One"); publish(owner, "Two");
        tripService.deleteTrip(trip.getTripId(), owner.getUserId());
        assertEquals(0, announcementRepository.count());
    }

    @Test void endpointsValidateInputAndReturnExpectedStatuses() throws Exception {
        String base = "/api/trips/" + trip.getTripId() + "/announcements";
        String body = "{\"title\":\"Check-in\",\"content\":\"From 3pm\"}";
        String created = mvc.perform(post(base).with(authentication(auth(owner))).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Check-in"))
                .andExpect(jsonPath("$.authorName").value("Owner"))
                .andReturn().getResponse().getContentAsString();
        String id = created.replaceAll(".*\"announcementId\":(\\d+).*", "$1");

        mvc.perform(get(base).with(authentication(auth(member)))).andExpect(status().isOk()).andExpect(jsonPath("$[0].content").value("From 3pm"));
        mvc.perform(get(base)).andExpect(status().isUnauthorized());
        mvc.perform(get(base).with(authentication(auth(stranger)))).andExpect(status().isForbidden());
        mvc.perform(post(base).with(authentication(auth(member))).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(put(base + "/" + id).with(authentication(auth(owner))).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Check-in moved\",\"content\":\"From 4pm\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.edited").value(true));
        mvc.perform(delete(base + "/" + id).with(authentication(auth(member)))).andExpect(status().isForbidden());
        mvc.perform(delete(base + "/" + id).with(authentication(auth(owner)))).andExpect(status().isNoContent());
        mvc.perform(delete(base + "/" + id).with(authentication(auth(owner)))).andExpect(status().isNotFound());

        for (String bad : List.of("{\"title\":\"\",\"content\":\"x\"}", "{\"title\":\"   \",\"content\":\"x\"}",
                "{\"title\":\"x\",\"content\":\"   \"}", "{\"content\":\"x\"}", "{\"title\":\"x\"}",
                "{\"title\":\"" + "t".repeat(101) + "\",\"content\":\"x\"}",
                "{\"title\":\"x\",\"content\":\"" + "c".repeat(5001) + "\"}")) {
            mvc.perform(post(base).with(authentication(auth(owner))).contentType(MediaType.APPLICATION_JSON).content(bad))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(post(base).with(authentication(auth(owner))).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + "t".repeat(100) + "\",\"content\":\"" + "c".repeat(5000) + "\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post(base).with(authentication(auth(owner))).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"<script>alert(1)</script>\",\"content\":\"東京 🗼\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("<script>alert(1)</script>"))
                .andExpect(jsonPath("$.content", containsString("東京")));
    }
}
