package com.elec5619.group3.trip_planner_backend;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import com.elec5619.group3.trip_planner_backend.dto.UpdateServiceSettingsRequest;
import com.elec5619.group3.trip_planner_backend.entity.Activity;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.exception.ExternalServiceException;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.repository.ActivityRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import com.elec5619.group3.trip_planner_backend.service.DiscoveryService;
import com.elec5619.group3.trip_planner_backend.service.DiscoveryService.PlaceMatch;
import com.elec5619.group3.trip_planner_backend.service.DiscoveryService.PlacePhoto;
import com.elec5619.group3.trip_planner_backend.service.GeminiClient;
import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService;
import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService.MapProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Own database: one test switches AI off, and Gemini/Places are mocked here only.
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:ai-planner;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiPlannerTest {
    // Day 2 comes first, day 3 is beyond the requested 2 days, and one slot has an unusable time.
    private static final String MODEL_REPLY = """
            {"tripName":"Kyoto in Autumn","summary":"Temples and food.","suggestedBudget":1800,
             "budgetBreakdown":[{"category":"Food","amount":400},{"category":"","amount":10}],
             "days":[
               {"dayNumber":2,"theme":"Markets","activities":[
                 {"name":"Nishiki Market","location":"Nakagyo","category":"Food","startTime":"10:00","endTime":"12:00","estimatedCost":60}]},
               {"dayNumber":1,"theme":"Temples","activities":[
                 {"name":"Fushimi Inari Taisha","location":"Fushimi","category":"Landmark","startTime":"08:00","endTime":"10:30","estimatedCost":0},
                 {"name":"Gion walk","location":"Gion","category":"Culture","startTime":"late","endTime":"21:00","estimatedCost":-5},
                 {"name":"  ","location":"x","category":"x","startTime":"09:00","endTime":"10:00","estimatedCost":1}]},
               {"dayNumber":3,"theme":"Extra","activities":[
                 {"name":"Arashiyama","location":"Ukyo","category":"Nature","startTime":"09:00","endTime":"11:00","estimatedCost":0}]}]}
            """;

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired TripRepository trips;
    @Autowired TripMemberRepository members;
    @Autowired ActivityRepository activities;
    @Autowired ServiceSettingsService settings;
    @Autowired TransactionTemplate transaction;
    @MockitoBean GeminiClient gemini;
    @MockitoBean DiscoveryService discovery;

    private User user;

    @BeforeEach
    void setUp() {
        user = new User();
        user.setUsername("planner");
        user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash("hash");
        user = users.save(user);
        setAi(true);
    }

    @Test
    void draftsAreNormalisedAndNothingIsSaved() throws Exception {
        when(gemini.generate(anyString(), any())).thenReturn(MODEL_REPLY);
        long tripsBefore = trips.count();

        draft("""
                {"destination":"Kyoto","startDate":"2026-11-01","days":2,"travellers":2,"pace":"BALANCED"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tripName").value("Kyoto in Autumn"))
                .andExpect(jsonPath("$.endDate").value("2026-11-02"))
                .andExpect(jsonPath("$.baseCurrency").value("AUD"))
                .andExpect(jsonPath("$.plannedBudget").value(1800.0))
                .andExpect(jsonPath("$.budgetBreakdown.length()").value(1))
                .andExpect(jsonPath("$.days[0].theme").value("Temples"))
                .andExpect(jsonPath("$.activities.length()").value(3))
                .andExpect(jsonPath("$.activities[0].name").value("Fushimi Inari Taisha"))
                .andExpect(jsonPath("$.activities[0].date").value("2026-11-01"))
                .andExpect(jsonPath("$.activities[1].startTime").isEmpty())
                .andExpect(jsonPath("$.activities[1].estimatedCost").isEmpty())
                .andExpect(jsonPath("$.activities[2].name").value("Nishiki Market"))
                .andExpect(jsonPath("$.activities[2].date").value("2026-11-02"));
        assertThat(trips.count()).isEqualTo(tripsBefore);
    }

    @Test
    void aUserBudgetOverridesTheSuggestedOne() throws Exception {
        when(gemini.generate(anyString(), any())).thenReturn(MODEL_REPLY);
        draft("""
                {"destination":"Kyoto","startDate":"2026-11-01","days":2,"travellers":2,"budget":950.5,
                 "baseCurrency":"jpy","pace":"RELAXED"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plannedBudget").value(950.5))
                .andExpect(jsonPath("$.baseCurrency").value("JPY"));
    }

    @Test
    void unreadableOrEmptyRepliesAreReportedAsUpstreamFailures() throws Exception {
        String request = """
                {"destination":"Kyoto","startDate":"2026-11-01","days":2,"travellers":1,"pace":"PACKED"}""";
        when(gemini.generate(anyString(), any())).thenReturn("Sorry, I can't help with that.");
        draft(request).andExpect(status().isBadGateway());
        when(gemini.generate(anyString(), any())).thenReturn("{\"tripName\":\"x\",\"days\":[]}");
        draft(request).andExpect(status().isBadGateway());
    }

    @Test
    void aDestinationTheAiCannotPlaceIsReportedToTheUser() throws Exception {
        when(gemini.generate(anyString(), any())).thenReturn("""
                {"destinationFound":false,"tripName":"","summary":"","suggestedBudget":0,"budgetBreakdown":[],"days":[]}""");
        draft("""
                {"destination":"Qwzxplor","startDate":"2026-11-01","days":2,"travellers":1,"pace":"BALANCED"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("We couldn't find \"Qwzxplor\". Check the spelling or try a nearby city."));
    }

    @Test
    void coverChoicesArePhotosOfTheDestinationsBestKnownLandmarks() throws Exception {
        when(gemini.generate(anyString(), any())).thenReturn("{\"landmarks\":[\"Fushimi Inari Taisha\",\"Kinkaku-ji\"]}");
        when(discovery.destinationPhotos("Fushimi Inari Taisha, Kyoto")).thenReturn(List.of("places/inari/photos/a", "places/inari/photos/b", "places/inari/photos/c"));
        when(discovery.destinationPhotos("Kinkaku-ji, Kyoto")).thenReturn(List.of("places/kinkaku/photos/a"));
        when(discovery.photo("places/inari/photos/a")).thenReturn(new PlacePhoto(jpeg(), "image/jpeg"));

        mvc.perform(get("/api/ai-planner/covers").param("destination", " Kyoto ").with(signedIn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].landmark").value("Fushimi Inari Taisha"))
                .andExpect(jsonPath("$[0].photo").value("places/inari/photos/a"))
                .andExpect(jsonPath("$[1].landmark").value("Kinkaku-ji"));
        mvc.perform(get("/api/ai-planner/covers/photo").param("name", "places/inari/photos/a").with(signedIn()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"));
    }

    @Test
    void withoutLandmarksTheDestinationItselfIsSearched() throws Exception {
        when(gemini.generate(anyString(), any())).thenThrow(new ExternalServiceException("down"));
        when(discovery.destinationPhotos("Kyoto")).thenReturn(List.of("places/kyoto/photos/a"));

        mvc.perform(get("/api/ai-planner/covers").param("destination", "Kyoto").with(signedIn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].landmark").value("Kyoto"));
    }

    @Test
    void draftsRespectTheAdminSwitchAndLimits() throws Exception {
        draft("""
                {"destination":"Kyoto","startDate":"2026-11-01","days":11,"travellers":1,"pace":"PACKED"}""")
                .andExpect(status().isBadRequest());
        setAi(false);
        draft("""
                {"destination":"Kyoto","startDate":"2026-11-01","days":2,"travellers":1,"pace":"PACKED"}""")
                .andExpect(status().isServiceUnavailable());
        verifyNoInteractions(gemini);
    }

    @Test
    void savingCreatesAnOwnedTripWithProposalsPinnedAndPhotographedFromSearch() throws Exception {
        when(discovery.locate(contains("Nishiki"), anyString())).thenReturn(Optional.of(new PlaceMatch("nishiki", 35.005, 135.764)));
        when(discovery.locate(contains("Gion"), anyString())).thenReturn(Optional.of(new PlaceMatch("gion", 35.0037, 135.7788)));
        when(discovery.locate(contains("Kamo"), anyString())).thenReturn(Optional.empty());
        when(discovery.findPhoto("nishiki")).thenReturn(Optional.of(new PlacePhoto(jpeg(), "image/jpeg")));
        // Not an image: the upload check refuses it, and the activity is saved without a photo.
        when(discovery.findPhoto("gion")).thenReturn(Optional.of(new PlacePhoto(new byte[] {1, 2, 3}, "image/jpeg")));

        String body = mvc.perform(post("/api/ai-planner/trips").with(signedIn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"tripName":"Kyoto in Autumn","destination":"Kyoto","startDate":"2026-11-01","endDate":"2026-11-02",
                                 "plannedBudget":1800,"baseCurrency":"AUD","activities":[
                                   {"date":"2026-11-02","startTime":"10:00","endTime":"12:00","name":"Nishiki Market",
                                    "location":"Nakagyo","category":"Food","estimatedCost":60,"description":"Street food."},
                                   {"date":"2026-11-01","name":"Gion walk","location":"Gion","category":"Culture"},
                                   {"date":"2026-11-01","name":"Kamo riverside","location":"Kamogawa","category":"Nature"}]}"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Kyoto in Autumn"))
                .andReturn().getResponse().getContentAsString();
        Long tripId = Long.valueOf(body.replaceAll(".*\"tripId\":(\\d+).*", "$1"));

        List<TripMember> tripMembers = members.findByTrip_TripId(tripId);
        assertThat(tripMembers).singleElement().satisfies(member -> {
            assertThat(member.getUser().getUserId()).isEqualTo(user.getUserId());
            assertThat(member.getRole()).isEqualTo("OWNER");
        });
        // Tags are loaded lazily, so read them inside a transaction.
        transaction.executeWithoutResult(status -> {
            List<Activity> saved = activities.findByTrip_TripIdOrderByCreatedAtAscIdAsc(tripId);
            assertThat(saved).hasSize(3).allSatisfy(activity -> {
                assertThat(activity.getDate()).isNull();
                assertThat(activity.isBranch()).isFalse();
                assertThat(activity.getTags()).containsExactly("AI plan");
            });
            Activity market = saved.get(0);
            assertThat(market.getDescription())
                    .isEqualTo("AI Planner suggestion · Mon 2 Nov · 10:00–12:00 · est. AUD 60.00\n\nStreet food.");
            assertThat(market.getLatitude()).isEqualTo(35.005);
            assertThat(market.getImageUrls()).singleElement().asString().startsWith("/activity-images/");
            assertThat(saved.get(1).getLatitude()).isEqualTo(35.0037);
            assertThat(saved.get(1).getImageUrls()).isEmpty();
            assertThat(saved.get(2).getLatitude()).isNull();
            assertThat(saved.get(2).getImageUrls()).isEmpty();
        });
    }

    private static byte[] jpeg() throws Exception {
        var output = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(4, 4, java.awt.image.BufferedImage.TYPE_INT_RGB), "jpeg", output);
        return output.toByteArray();
    }

    @Test
    void savingRejectsActivitiesOutsideTheTripWithoutCreatingAnything() throws Exception {
        long tripsBefore = trips.count();
        mvc.perform(post("/api/ai-planner/trips").with(signedIn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"tripName":"Kyoto","destination":"Kyoto","startDate":"2026-11-01","endDate":"2026-11-02",
                                 "plannedBudget":100,"activities":[
                                   {"date":"2026-11-05","name":"Too late","location":"Kyoto","category":"Food"}]}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("\"Too late\" is outside the trip dates"));
        assertThat(trips.count()).isEqualTo(tripsBefore);
        verifyNoInteractions(discovery);
    }

    @Test
    void plannerRequiresSignIn() throws Exception {
        mvc.perform(post("/api/ai-planner/draft").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    private ResultActions draft(String body) throws Exception {
        return mvc.perform(post("/api/ai-planner/draft").with(signedIn())
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void setAi(boolean enabled) {
        UpdateServiceSettingsRequest request = new UpdateServiceSettingsRequest();
        request.setPlaceSearch(true);
        request.setPlacePhotos(true);
        request.setAiRecommendations(enabled);
        request.setAiModel(settings.settings().defaultAiModel());
        request.setMapProvider(MapProvider.GOOGLE);
        settings.update(request);
    }

    private RequestPostProcessor signedIn() {
        return authentication(new UsernamePasswordAuthenticationToken(new AuthenticatedUser(user.getUserId(), user.getEmail()),
                null, List.of(new SimpleGrantedAuthority("ROLE_USER"))));
    }
}
