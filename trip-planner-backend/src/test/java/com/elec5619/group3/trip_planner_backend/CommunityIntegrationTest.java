package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.dto.*;
import org.springframework.security.access.AccessDeniedException;
import com.elec5619.group3.trip_planner_backend.entity.*;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.repository.*;
import com.elec5619.group3.trip_planner_backend.service.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import javax.imageio.ImageIO;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:community;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CommunityIntegrationTest {
    @Autowired ActivityService activities;
    @Autowired CommunityService community;
    @Autowired CommunityCommentService communityComments;
    @Autowired ActivityImageService images;
    @Autowired TripService tripService;
    @Autowired UserRepository users;
    @Autowired TripRepository trips;
    @Autowired TripMemberRepository members;
    @Autowired ActivityRepository activityRepository;
    @Autowired TripLikeRepository likes;
    @Autowired EntityManager entityManager;
    @Autowired MockMvc mvc;
    User owner, visitor;
    Trip shared, privateTrip;

    @BeforeEach void setup() {
        owner = user("owner"); visitor = user("visitor");
        shared = trip("Shared Sydney", owner); privateTrip = trip("Private Melbourne", visitor);
    }

    /** Start, archive, then publish: the only way a trip reaches Community. */
    private void share(Trip trip) {
        tripService.startTrip(trip.getTripId(), owner.getUserId());
        tripService.archiveTrip(trip.getTripId(), owner.getUserId());
        tripService.publishTrip(trip.getTripId(), owner.getUserId());
    }

    @Test void onlyArchivedTripsCanBePublished() {
        tripService.startTrip(shared.getTripId(), owner.getUserId());
        assertThatThrownBy(() -> tripService.publishTrip(shared.getTripId(), owner.getUserId())).isInstanceOf(IllegalArgumentException.class);
        tripService.archiveTrip(shared.getTripId(), owner.getUserId());
        assertThat(community.list(visitor.getUserId(), 0)).isEmpty();
        assertThat(tripService.publishTrip(shared.getTripId(), owner.getUserId()).getStatus()).isEqualTo("PUBLISHED");
        assertThat(community.list(visitor.getUserId(), 0)).extracting(CommunityTripResponse::tripId).containsExactly(shared.getTripId());
    }

    @Test void anyoneCommentsOnASharedTripAndOnlyTheAuthorOrAnOwnerDeletes() {
        assertThatThrownBy(() -> communityComments.create(shared.getTripId(), "Too early", visitor.getUserId())).isInstanceOf(NoSuchElementException.class);
        share(shared);
        var mine = communityComments.create(shared.getTripId(), "  Loved the ferry  ", visitor.getUserId());
        var owners = communityComments.create(shared.getTripId(), "Thanks!", owner.getUserId());
        assertThat(mine.content()).isEqualTo("Loved the ferry");
        assertThat(communityComments.list(shared.getTripId(), visitor.getUserId())).extracting(CommunityCommentResponse::canDelete).containsExactly(true, false);
        assertThatThrownBy(() -> communityComments.delete(shared.getTripId(), owners.id(), visitor.getUserId())).isInstanceOf(AccessDeniedException.class);
        communityComments.delete(shared.getTripId(), mine.id(), owner.getUserId());
        assertThat(communityComments.list(shared.getTripId(), owner.getUserId())).extracting(CommunityCommentResponse::content).containsExactly("Thanks!");
    }

    @Test void aPublishedTripIsListedForEveryoneIncludingItsOwner() {
        share(shared);
        assertThat(community.list(visitor.getUserId(), 0)).extracting(CommunityTripResponse::tripId).containsExactly(shared.getTripId());
        assertThat(community.list(owner.getUserId(), 0)).extracting(CommunityTripResponse::tripId).containsExactly(shared.getTripId());
    }

    @Test void existingPublishFlowSharesOnlyScheduledPlacesAndPublicFields() throws Exception {
        var scheduled = activities.create(shared.getTripId(), request(true), owner.getUserId());
        activities.addComment(scheduled.getId(), "Private group comment", owner.getUserId());
        activities.create(shared.getTripId(), request(false), owner.getUserId());
        assertThat(community.list(visitor.getUserId(), 0)).isEmpty();
        mvc.perform(get("/api/community/trips/{id}", shared.getTripId()).with(as(visitor))).andExpect(status().isNotFound());
        share(shared);
        mvc.perform(get("/api/community/trips/{id}", shared.getTripId()).with(as(visitor)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.places.length()").value(1))
                .andExpect(jsonPath("$.places[0].name").value("Harbour walk"))
                .andExpect(jsonPath("$.places[0].imageUrls[0]").value("https://example.test/harbour.png"))
                .andExpect(jsonPath("$.plannedBudget").doesNotExist()).andExpect(jsonPath("$.members").doesNotExist())
                .andExpect(jsonPath("$.places[0].description").doesNotExist()).andExpect(jsonPath("$.places[0].comments").doesNotExist())
                .andExpect(jsonPath("$.places[0].createdById").doesNotExist()).andExpect(jsonPath("$.places[0].preferences").doesNotExist());
        assertThat(community.list(visitor.getUserId(), 0)).extracting(CommunityTripResponse::tripId).containsExactly(shared.getTripId());
    }

    @Test void likesAreIdempotentPersistedAndCanBeRemoved() {
        share(shared);
        community.like(shared.getTripId(), visitor.getUserId(), true);
        community.like(shared.getTripId(), visitor.getUserId(), true);
        entityManager.flush(); entityManager.clear();
        assertThat(likes.countByTrip_TripId(shared.getTripId())).isEqualTo(1);
        assertThat(community.get(shared.getTripId(), visitor.getUserId()).likedByMe()).isTrue();
        community.like(shared.getTripId(), owner.getUserId(), true);
        assertThat(community.get(shared.getTripId(), visitor.getUserId()).likeCount()).isEqualTo(2);
        community.like(shared.getTripId(), visitor.getUserId(), false);
        community.like(shared.getTripId(), visitor.getUserId(), false);
        assertThat(community.get(shared.getTripId(), visitor.getUserId()).likeCount()).isEqualTo(1);
        assertThat(community.get(shared.getTripId(), visitor.getUserId()).likedByMe()).isFalse();
        assertThatThrownBy(() -> community.like(privateTrip.getTripId(), owner.getUserId(), true)).isInstanceOf(NoSuchElementException.class);
    }

    @Test void usingACommunityPlaceKeepsPhotosAndTagsButStartsAFreshProposal() {
        var pinned = request(true); pinned.setLatitude(-33.861); pinned.setLongitude(151.211);
        var source = activities.create(shared.getTripId(), pinned, owner.getUserId());
        activities.vote(source.getId(), Vote.VoteValue.APPROVE, owner.getUserId());
        activities.addComment(source.getId(), "Private", owner.getUserId());
        share(shared);
        var template = community.get(shared.getTripId(), visitor.getUserId()).places().get(0);
        var created = community.copyPlace(template.id(), privateTrip.getTripId(), visitor.getUserId());
        entityManager.flush(); entityManager.clear();
        var loaded = activities.get(created.getId(), visitor.getUserId());
        assertThat(loaded.getId()).isNotEqualTo(source.getId());
        assertThat(loaded.getImageUrls()).containsExactlyElementsOf(template.imageUrls());
        assertThat(loaded.getTags()).containsExactly("Free", "Outdoors");
        assertThat(loaded.getLatitude()).isEqualTo(-33.861); assertThat(loaded.getLongitude()).isEqualTo(151.211);
        assertThat(loaded.getDate()).isNull(); assertThat(loaded.getDescription()).isNull();
        assertThat(loaded.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.PENDING);
        assertThat(loaded.getApproveCount()).isZero(); assertThat(loaded.getCommentCount()).isZero();
    }

    @Test void onlyPlacesOfAPublishedTripCanBeCopied() {
        var source = activities.create(shared.getTripId(), request(true), owner.getUserId());
        assertThatThrownBy(() -> community.copyPlace(source.getId(), privateTrip.getTripId(), visitor.getUserId()))
                .isInstanceOf(NoSuchElementException.class);
        share(shared);
        var idea = activities.create(privateTrip.getTripId(), request(false), visitor.getUserId());
        assertThatThrownBy(() -> community.copyPlace(idea.getId(), privateTrip.getTripId(), visitor.getUserId()))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test void uploadedImagesRequireAccessAndBecomeReusableWithPublishedPlaces() throws Exception {
        var photo = png();
        String url = images.upload(photo, owner.getUserId()); String id = url.substring("/activity-images/".length());
        mvc.perform(get("/api" + url).with(as(visitor))).andExpect(status().isForbidden());
        mvc.perform(get("/api" + url).with(as(owner))).andExpect(status().isOk()).andExpect(content().contentType("image/png"));
        var details = request(true); details.setImageUrls(List.of(url));
        var activity = activities.create(shared.getTripId(), details, owner.getUserId());
        share(shared);
        assertThat(images.read(id, visitor.getUserId()).data()).isNotEmpty();
        var copy = request(false); copy.setImageUrls(community.get(shared.getTripId(), visitor.getUserId()).places().get(0).imageUrls());
        var copied = activities.create(privateTrip.getTripId(), copy, visitor.getUserId());
        tripService.deleteTrip(shared.getTripId(), owner.getUserId());
        entityManager.flush(); entityManager.clear();
        assertThat(images.read(id, visitor.getUserId()).data()).isNotEmpty();
        assertThat(activities.get(copied.getId(), visitor.getUserId()).getImageUrls()).containsExactly(url);
    }

    @Test void updatesFromSchedulingPreserveOmittedPhotoFieldsAndExplicitEmptyClearsThem() {
        var created = activities.create(shared.getTripId(), request(false), owner.getUserId());
        var update = request(false); update.setTags(null); update.setImageUrls(null); update.setName("New name");
        activities.update(created.getId(), update, owner.getUserId());
        entityManager.flush(); entityManager.clear();
        var saved = activities.get(created.getId(), owner.getUserId());
        assertThat(saved.getImageUrls()).hasSize(1); assertThat(saved.getTags()).hasSize(2);
        update.setImageUrls(List.of()); update.setTags(List.of());
        activities.update(created.getId(), update, owner.getUserId());
        assertThat(activities.get(created.getId(), owner.getUserId()).getImageUrls()).isEmpty();
    }

    @Test void uploadAndCreationValidationIsEnforcedByApi() throws Exception {
        mvc.perform(multipart("/api/activity-images").file(png()).with(as(owner))).andExpect(status().isCreated()).andExpect(jsonPath("$.url").exists());
        mvc.perform(multipart("/api/activity-images").file(new MockMultipartFile("file", "fake.png", "image/png", "not an image".getBytes())).with(as(owner))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/trips/{id}/activities", shared.getTripId()).with(as(visitor)).contentType("application/json")
                .content("{\"name\":\"Beach\",\"location\":\"Sydney\",\"category\":\"Nature\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/trips/{id}/activities", shared.getTripId()).with(as(owner)).contentType("application/json")
                .content("{\"name\":\"Beach\",\"location\":\"Sydney\",\"category\":\"Nature\",\"imageUrls\":[\"javascript:alert(1)\"]}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/trips/{id}/activities", shared.getTripId()).with(as(owner)).contentType("application/json")
                .content("{\"name\":\"Beach\",\"location\":\"Sydney\",\"category\":\"Nature\",\"tags\":[\" \"]}")).andExpect(status().isBadRequest());
    }

    @Test void communityAndMediaEndpointsRequireAuthentication() throws Exception {
        for (String path : List.of("/api/community/trips", "/api/activity-templates", "/api/activity-images/unknown"))
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/community/trips/{id}/like", shared.getTripId()).contentType("application/json").content("{\"liked\":true}")).andExpect(status().isUnauthorized());
    }

    @Test void readingARealTripDoesNotInsertSampleActivities() {
        assertThat(activities.list(shared.getTripId(), owner.getUserId())).isEmpty();
        assertThat(activityRepository.findChronologically(shared.getTripId())).isEmpty();
    }

    private User user(String name) {
        var user = new User(); user.setUsername(name); user.setEmail(name + "@community.test"); user.setPasswordHash("test-only"); return users.save(user);
    }
    private Trip trip(String name, User owner) {
        var trip = new Trip(); trip.setName(name); trip.setDestination(name); trip.setStartDate(LocalDate.of(2026, 10, 1));
        trip.setEndDate(LocalDate.of(2026, 10, 4)); trip.setPlannedBudget(BigDecimal.valueOf(1000)); trips.save(trip);
        var member = new TripMember(); member.setTrip(trip); member.setUser(owner); member.setRole("OWNER"); members.save(member); return trip;
    }
    private CreateActivityRequest request(boolean scheduled) {
        var request = new CreateActivityRequest(); request.setName("Harbour walk"); request.setLocation("Circular Quay"); request.setCategory("Nature");
        request.setDescription("Private planning notes"); request.setTags(List.of("Free", "Outdoors")); request.setImageUrls(List.of("https://example.test/harbour.png"));
        if (scheduled) { request.setDate(shared.getStartDate()); request.setStartTime(LocalTime.of(10, 0)); request.setEndTime(LocalTime.of(11, 0)); }
        return request;
    }
    private MockMultipartFile png() throws Exception {
        var data = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB), "png", data);
        return new MockMultipartFile("file", "photo.png", "image/png", data.toByteArray());
    }
    private RequestPostProcessor as(User user) { return authentication(new UsernamePasswordAuthenticationToken(new AuthenticatedUser(user.getUserId(), user.getEmail()), null, List.of())); }
}
