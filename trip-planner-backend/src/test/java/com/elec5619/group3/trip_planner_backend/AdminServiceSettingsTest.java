package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.dto.PlaceRecommendationRequest;
import com.elec5619.group3.trip_planner_backend.dto.UpdateServiceSettingsRequest;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.exception.ServiceDisabledException;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.repository.AppSettingRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import com.elec5619.group3.trip_planner_backend.service.AiRecommendationService;
import com.elec5619.group3.trip_planner_backend.service.DiscoveryService;
import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService;
import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService.MapProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Own database so switched-off services never leak into other test classes' contexts.
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:admin-settings;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminServiceSettingsTest {
    @Autowired MockMvc mvc;
    @Autowired ServiceSettingsService settings;
    @Autowired AppSettingRepository settingRepository;
    @Autowired DiscoveryService discovery;
    @Autowired AiRecommendationService ai;
    @Autowired UserRepository users;
    @Autowired TripRepository trips;
    @Autowired TripMemberRepository members;

    private User member;
    private Trip trip;

    @BeforeEach
    void setUp() {
        member = new User();
        member.setUsername("member");
        member.setEmail(UUID.randomUUID() + "@example.test");
        member.setPasswordHash("hash");
        member = users.save(member);
        trip = new Trip();
        trip.setName("Tokyo"); trip.setDestination("Tokyo");
        trip.setStartDate(LocalDate.of(2026, 11, 1)); trip.setEndDate(LocalDate.of(2026, 11, 5));
        trip.setPlannedBudget(BigDecimal.valueOf(1000));
        trip = trips.save(trip);
        TripMember membership = new TripMember();
        membership.setTrip(trip); membership.setUser(member); membership.setRole("OWNER");
        members.save(membership);
    }

    @AfterEach
    void restoreDefaults() {
        settings.update(request(true, true, true, settings.settings().defaultAiModel(), MapProvider.GOOGLE));
    }

    @Test
    void onlyAdminsCanReachTheSettings() throws Exception {
        mvc.perform(get("/api/admin/services").with(as("USER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/services").with(as("ADMIN"))).andExpect(status().isOk());
    }

    @Test
    void savedSettingsApplyImmediatelyAndArePersisted() throws Exception {
        mvc.perform(put("/api/admin/services").with(as("ADMIN")).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"placeSearch":true,"placePhotos":false,"aiRecommendations":true,
                                 "aiModel":"gemini-test-model-2","mapProvider":"OSM"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aiModel").value("gemini-test-model-2"));

        assertThat(settings.aiModel()).isEqualTo("gemini-test-model-2");
        assertThat(settings.status().placePhotos()).isFalse();
        assertThat(settings.status().mapProvider()).isEqualTo("OSM");
        assertThat(settingRepository.findById("ai.model")).get()
                .extracting(setting -> setting.getValue()).isEqualTo("gemini-test-model-2");
    }

    @Test
    void switchedOffServicesAreRefusedBeforeAnyExternalCall() {
        settings.update(request(false, false, false, "gemini-test-model", MapProvider.OFF));

        PlaceRecommendationRequest place = new PlaceRecommendationRequest();
        place.setName("Senso-ji");
        assertThatThrownBy(() -> ai.recommend(trip.getTripId(), member.getUserId(), place))
                .isInstanceOf(ServiceDisabledException.class);
        assertThatThrownBy(() -> discovery.searchPlaces(trip.getTripId(), member.getUserId(), "ramen"))
                .isInstanceOf(ServiceDisabledException.class);
        assertThatThrownBy(() -> discovery.fetchFirstPhoto(trip.getTripId(), member.getUserId(), "abc"))
                .isInstanceOf(ServiceDisabledException.class);
        assertThat(discovery.destinationBounds(trip.getTripId(), member.getUserId())).isNull();
    }

    @Test
    void modelNamesThatCouldAlterTheGeminiUrlAreRejected() throws Exception {
        mvc.perform(put("/api/admin/services").with(as("ADMIN")).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"placeSearch":true,"placePhotos":true,"aiRecommendations":true,
                                 "aiModel":"../other?x=1","mapProvider":"GOOGLE"}"""))
                .andExpect(status().isBadRequest());
        assertThat(settings.aiModel()).isNotEqualTo("../other?x=1");
    }

    private UpdateServiceSettingsRequest request(boolean search, boolean photos, boolean ai, String model, MapProvider map) {
        UpdateServiceSettingsRequest request = new UpdateServiceSettingsRequest();
        request.setPlaceSearch(search);
        request.setPlacePhotos(photos);
        request.setAiRecommendations(ai);
        request.setAiModel(model);
        request.setMapProvider(map);
        return request;
    }

    private RequestPostProcessor as(String role) {
        return authentication(new UsernamePasswordAuthenticationToken(new AuthenticatedUser(member.getUserId(), member.getEmail()),
                null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
}
