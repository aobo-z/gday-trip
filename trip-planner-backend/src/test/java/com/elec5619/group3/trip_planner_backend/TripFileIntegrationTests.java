package com.elec5619.group3.trip_planner_backend;

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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * FR-18: Trip files and attachments.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TripFileIntegrationTests {
    static final byte[] PDF = "%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF".getBytes(StandardCharsets.US_ASCII);
    static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F'};
    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13};
    static final byte[] WEBP = {'R', 'I', 'F', 'F', 4, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' '};

    @Autowired TripFileService files;
    @Autowired TripMemberService memberService;
    @Autowired TripService tripService;
    @Autowired ActivityService activityService;
    @Autowired TripFileRepository fileRepository;
    @Autowired TripFileContentRepository contentRepository;
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
    User owner, member, member2, invitee, stranger;
    Trip trip, otherTrip;
    Long sushi, otherTripActivity;

    @BeforeEach void setup() {
        contentRepository.deleteAll(); fileRepository.deleteAll(); announcementRepository.deleteAll();
        commentRepository.deleteAll(); preferenceRepository.deleteAll(); historyRepository.deleteAll();
        voteRepository.deleteAll(); activityRepository.deleteAll(); settlementRepository.deleteAll();
        expenseRepository.deleteAll(); reviewRepository.deleteAll(); memberships.deleteAll(); trips.deleteAll(); users.deleteAll();
        owner = user("Owner"); member = user("Member"); member2 = user("Member2"); invitee = user("Invitee"); stranger = user("Stranger");
        trip = trip("Tokyo"); otherTrip = trip("Paris");
        join(trip, owner, "OWNER", "JOINED"); join(trip, member, "MEMBER", "JOINED"); join(trip, member2, "MEMBER", "JOINED");
        join(trip, invitee, "MEMBER", "PENDING"); join(otherTrip, stranger, "OWNER", "JOINED");
        sushi = activity(trip, owner, "Sushi class");
        otherTripActivity = activity(otherTrip, stranger, "Louvre");
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
    Long activity(Trip t, User by, String name) {
        CreateActivityRequest r = new CreateActivityRequest(); r.setName(name); r.setLocation("Somewhere"); r.setCategory("Food");
        return activityService.create(t.getTripId(), r, by.getUserId()).getId();
    }
    MockMultipartFile file(String name, byte[] bytes) {
        return new MockMultipartFile("file", name, "application/octet-stream", bytes);
    }
    TripFileResponse upload(User by, String name, byte[] bytes, Long activityId) {
        return files.uploadFile(trip.getTripId(), file(name, bytes), activityId, by.getUserId());
    }
    List<TripFileResponse> list(User viewer) {
        return files.getFiles(trip.getTripId(), null, viewer.getUserId());
    }
    UsernamePasswordAuthenticationToken auth(User u) {
        return new UsernamePasswordAuthenticationToken(new AuthenticatedUser(u.getUserId(), u.getEmail()), null, List.of());
    }

    @Test void memberUploadsAPdfAndEveryMemberSeesIt() {
        TripFileResponse f = upload(member, "Flight ticket.pdf", PDF, null);
        assertEquals("Flight ticket.pdf", f.getFileName());
        assertEquals("application/pdf", f.getContentType());
        assertEquals(PDF.length, f.getSizeBytes());
        assertEquals("Member", f.getUploaderName());
        assertNotNull(f.getUploadedAt());
        assertNull(f.getActivityId());
        assertTrue(f.isCanDelete());

        for (User viewer : List.of(owner, member, member2)) {
            assertEquals(List.of("Flight ticket.pdf"), list(viewer).stream().map(TripFileResponse::getFileName).toList());
        }
        assertArrayEquals(PDF, files.downloadFile(trip.getTripId(), f.getFileId(), member2.getUserId()).data());
    }

    @Test void pdfsAndImagesAreAcceptedByWhatTheyContain() {
        assertEquals("application/pdf", upload(owner, "a.pdf", PDF, null).getContentType());
        assertEquals("image/jpeg", upload(owner, "b.jpg", JPEG, null).getContentType());
        assertEquals("image/png", upload(owner, "c.png", PNG, null).getContentType());
        assertEquals("image/webp", upload(owner, "d.webp", WEBP, null).getContentType());
        // The name doesn't decide the type; the bytes do.
        assertEquals("application/pdf", upload(owner, "booking.jpg", PDF, null).getContentType());
        assertEquals(List.of("booking.jpg", "d.webp", "c.png", "b.jpg", "a.pdf"), list(owner).stream().map(TripFileResponse::getFileName).toList());
    }

    @Test void otherFileTypesAreRejected() {
        List<byte[]> rejected = List.of(
                "GIF89a....".getBytes(StandardCharsets.US_ASCII),
                "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>".getBytes(StandardCharsets.UTF_8),
                "<html><body>hi</body></html>".getBytes(StandardCharsets.UTF_8),
                "plain text notes".getBytes(StandardCharsets.UTF_8),
                new byte[]{'P', 'K', 3, 4, 20, 0},
                "%PD".getBytes(StandardCharsets.US_ASCII));
        for (byte[] bytes : rejected) {
            IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> upload(owner, "ticket.pdf", bytes, null));
            assertEquals("Only PDF, JPEG, PNG and WebP files can be uploaded", ex.getMessage());
        }
        assertEquals("Please choose a file to upload",
                assertThrows(IllegalArgumentException.class, () -> upload(owner, "empty.pdf", new byte[0], null)).getMessage());
        assertEquals(0, fileRepository.count());
        assertEquals(0, contentRepository.count());
    }

    @Test void filesMustBeTenMegabytesOrSmaller() {
        byte[] limit = Arrays.copyOf(PDF, TripFile.MAX_BYTES);
        assertEquals(TripFile.MAX_BYTES, upload(owner, "big.pdf", limit, null).getSizeBytes());
        byte[] tooBig = Arrays.copyOf(PDF, TripFile.MAX_BYTES + 1);
        assertEquals("File must be 10 MB or smaller",
                assertThrows(IllegalArgumentException.class, () -> upload(owner, "huge.pdf", tooBig, null)).getMessage());
        assertEquals(1, fileRepository.count());
    }

    @Test void outsidersAndPendingInviteesCannotTouchFiles() {
        Long fileId = upload(owner, "passport.pdf", PDF, null).getFileId();
        for (User outsider : List.of(stranger, invitee)) {
            Long id = outsider.getUserId();
            assertThrows(AccessDeniedException.class, () -> files.getFiles(trip.getTripId(), null, id));
            assertThrows(AccessDeniedException.class, () -> files.uploadFile(trip.getTripId(), file("x.pdf", PDF), null, id));
            assertThrows(AccessDeniedException.class, () -> files.downloadFile(trip.getTripId(), fileId, id));
            assertThrows(AccessDeniedException.class, () -> files.deleteFile(trip.getTripId(), fileId, id));
            assertThrows(AccessDeniedException.class, () -> files.getActivityOptions(trip.getTripId(), id));
        }
        assertThrows(ResourceNotFoundException.class, () -> files.getFiles(99999L, null, owner.getUserId()));
        assertEquals(1, fileRepository.count());
    }

    @Test void aFileCanBeAttachedToAnActivityOfTheSameTrip() {
        TripFileResponse attached = upload(member, "Sushi booking.pdf", PDF, sushi);
        upload(member, "General info.pdf", PDF, null);
        assertEquals(sushi, attached.getActivityId());
        assertEquals("Sushi class", attached.getActivityName());

        List<TripFileResponse> forActivity = files.getFiles(trip.getTripId(), sushi, owner.getUserId());
        assertEquals(List.of("Sushi booking.pdf"), forActivity.stream().map(TripFileResponse::getFileName).toList());
        assertEquals(2, list(owner).size());

        assertThrows(ResourceNotFoundException.class, () -> upload(member, "x.pdf", PDF, otherTripActivity));
        assertThrows(ResourceNotFoundException.class, () -> upload(member, "x.pdf", PDF, 999999L));
        assertEquals(2, fileRepository.count());
    }

    @Test void uploaderOrOwnerCanRemoveAFileButOtherMembersCannot() {
        Long byMember = upload(member, "mine.pdf", PDF, null).getFileId();
        Long byMember2 = upload(member2, "theirs.pdf", PDF, null).getFileId();

        TripFileResponse seenByMember = list(member).stream().filter(f -> f.getFileId().equals(byMember2)).findFirst().orElseThrow();
        assertFalse(seenByMember.isCanDelete());
        assertTrue(list(owner).stream().allMatch(TripFileResponse::isCanDelete));

        assertThrows(AccessDeniedException.class, () -> files.deleteFile(trip.getTripId(), byMember2, member.getUserId()));
        files.deleteFile(trip.getTripId(), byMember, member.getUserId());
        files.deleteFile(trip.getTripId(), byMember2, owner.getUserId());

        assertTrue(list(owner).isEmpty());
        assertEquals(0, contentRepository.count());
        assertThrows(ResourceNotFoundException.class, () -> files.deleteFile(trip.getTripId(), byMember, owner.getUserId()));
        assertThrows(ResourceNotFoundException.class, () -> files.downloadFile(trip.getTripId(), byMember, owner.getUserId()));
    }

    @Test void aFileCannotBeReachedThroughAnotherTrip() {
        Long fileId = upload(owner, "Tokyo hotel.pdf", PDF, null).getFileId();
        // The other trip's owner is a member and owner of a trip, just not this one.
        assertThrows(ResourceNotFoundException.class, () -> files.downloadFile(otherTrip.getTripId(), fileId, stranger.getUserId()));
        assertThrows(ResourceNotFoundException.class, () -> files.deleteFile(otherTrip.getTripId(), fileId, stranger.getUserId()));
        assertEquals(1, fileRepository.count());
    }

    @Test void deletingAnActivityKeepsItsFilesAsTripFiles() {
        Long fileId = upload(member, "Class voucher.pdf", PDF, sushi).getFileId();
        activityService.delete(sushi, owner.getUserId());

        TripFileResponse kept = list(owner).stream().filter(f -> f.getFileId().equals(fileId)).findFirst().orElseThrow();
        assertNull(kept.getActivityId());
        assertNull(kept.getActivityName());
        assertArrayEquals(PDF, files.downloadFile(trip.getTripId(), fileId, member.getUserId()).data());
    }

    @Test void deletingTheTripDeletesItsFiles() {
        upload(owner, "a.pdf", PDF, null);
        upload(member, "b.jpg", JPEG, sushi);
        tripService.deleteTrip(trip.getTripId(), owner.getUserId());
        assertEquals(0, fileRepository.count());
        assertEquals(0, contentRepository.count());
    }

    @Test void filesStayWhenTheirUploaderLeavesTheTrip() {
        Long fileId = upload(member, "Itinerary.pdf", PDF, null).getFileId();
        Long membership = memberships.findByTrip_TripIdAndUser_UserId(trip.getTripId(), member.getUserId()).orElseThrow().getTripMemberId();
        memberService.removeMember(trip.getTripId(), membership, member.getUserId());

        assertEquals("Member", list(owner).get(0).getUploaderName());
        assertThrows(AccessDeniedException.class, () -> files.downloadFile(trip.getTripId(), fileId, member.getUserId()));
    }

    @Test void fileNamesAreCleanedUp() {
        assertEquals("ticket.pdf", upload(owner, "C:\\Users\\bob\\Documents\\ticket.pdf", PDF, null).getFileName());
        assertEquals("passwd.pdf", upload(owner, "../../etc/passwd.pdf", PDF, null).getFileName());
        assertEquals("badname.pdf", upload(owner, " \u0007bad\nname.pdf ", PDF, null).getFileName());
        assertEquals("file.pdf", upload(owner, "", PDF, null).getFileName());
        assertEquals("file.jpg", upload(owner, "..", JPEG, null).getFileName());
        assertEquals("東京 チケット 🗼.pdf", upload(owner, "東京 チケット 🗼.pdf", PDF, null).getFileName());

        String longName = upload(owner, "n".repeat(300) + ".pdf", PDF, null).getFileName();
        assertEquals(TripFile.FILE_NAME_MAX, longName.length());
        assertTrue(longName.endsWith(".pdf"));

        // 250 characters then an emoji straddling the cut: the emoji is dropped whole, not split.
        String emojiName = upload(owner, "a".repeat(250) + "🗼🗼🗼.pdf", PDF, null).getFileName();
        assertTrue(emojiName.endsWith(".pdf"));
        assertTrue(emojiName.length() <= TripFile.FILE_NAME_MAX);
        assertFalse(Character.isHighSurrogate(emojiName.charAt(emojiName.length() - 5)));
    }

    @Test void activityOptionsListTheTripsActivitiesWithoutCreatingAny() {
        Long beach = activity(trip, member, "Beach day");
        long before = activityRepository.count();
        List<TripFileActivityOption> options = files.getActivityOptions(trip.getTripId(), member.getUserId());
        assertEquals(before, activityRepository.count());
        assertEquals(List.of("Beach day", "Sushi class"), options.stream().map(TripFileActivityOption::name).toList());
        assertTrue(options.stream().anyMatch(o -> o.activityId().equals(beach)));
        assertTrue(options.stream().noneMatch(o -> o.activityId().equals(otherTripActivity)));
    }

    @Test void endpointsReturnExpectedStatusesAndHeaders() throws Exception {
        String base = "/api/trips/" + trip.getTripId() + "/files";
        String created = mvc.perform(multipart(base).file(file("Ryokan booking.pdf", PDF)).param("activityId", sushi.toString())
                        .with(authentication(auth(member))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fileName").value("Ryokan booking.pdf"))
                .andExpect(jsonPath("$.activityName").value("Sushi class"))
                .andExpect(jsonPath("$.uploaderName").value("Member"))
                .andReturn().getResponse().getContentAsString();
        String id = created.replaceAll(".*\"fileId\":(\\d+).*", "$1");

        mvc.perform(get(base).with(authentication(auth(owner)))).andExpect(status().isOk()).andExpect(jsonPath("$[0].fileName").value("Ryokan booking.pdf"));
        mvc.perform(get(base).param("activityId", sushi.toString()).with(authentication(auth(owner)))).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(base + "/activities").with(authentication(auth(member)))).andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Sushi class"));

        mvc.perform(get(base + "/" + id + "/download").with(authentication(auth(member2))))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/pdf"))
                .andExpect(content().bytes(PDF))
                .andExpect(header().string("Content-Disposition", containsString("attachment")))
                .andExpect(header().string("Content-Disposition", containsString("Ryokan booking.pdf")))
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
        mvc.perform(get(base + "/" + id + "/download").param("inline", "true").with(authentication(auth(member2))))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("inline")));

        String unicodeId = files.uploadFile(trip.getTripId(), file("東京.pdf", PDF), null, owner.getUserId()).getFileId().toString();
        mvc.perform(get(base + "/" + unicodeId + "/download").with(authentication(auth(owner))))
                .andExpect(header().string("Content-Disposition", containsString("filename*=UTF-8''")));

        mvc.perform(get(base)).andExpect(status().isUnauthorized());
        mvc.perform(get(base + "/" + id + "/download")).andExpect(status().isUnauthorized());
        mvc.perform(get(base).with(authentication(auth(stranger)))).andExpect(status().isForbidden());
        mvc.perform(get(base + "/" + id + "/download").with(authentication(auth(invitee)))).andExpect(status().isForbidden());
        mvc.perform(multipart(base).file(file("x.pdf", PDF)).with(authentication(auth(stranger)))).andExpect(status().isForbidden());
        mvc.perform(multipart(base).file(file("x.txt", "text".getBytes())).with(authentication(auth(owner))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only PDF, JPEG, PNG and WebP files can be uploaded"));
        mvc.perform(multipart(base).with(authentication(auth(owner)))).andExpect(status().isBadRequest());
        mvc.perform(multipart(base).file(file("x.pdf", PDF)).param("activityId", "abc").with(authentication(auth(owner)))).andExpect(status().isBadRequest());
        mvc.perform(post(base).with(authentication(auth(owner))).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnsupportedMediaType());
        mvc.perform(get(base + "/abc/download").with(authentication(auth(owner)))).andExpect(status().isBadRequest());

        mvc.perform(delete(base + "/" + id).with(authentication(auth(member2)))).andExpect(status().isForbidden());
        mvc.perform(delete(base + "/" + id).with(authentication(auth(member)))).andExpect(status().isNoContent());
        mvc.perform(get(base + "/" + id + "/download").with(authentication(auth(member)))).andExpect(status().isNotFound());
    }
}
