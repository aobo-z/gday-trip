package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.controller.DiscoveryController;
import com.elec5619.group3.trip_planner_backend.dto.PlaceRecommendationResponse;
import com.elec5619.group3.trip_planner_backend.dto.PlaceResult;
import com.elec5619.group3.trip_planner_backend.exception.GlobalExceptionHandler;
import com.elec5619.group3.trip_planner_backend.exception.ServiceDisabledException;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.service.AiRecommendationService;
import com.elec5619.group3.trip_planner_backend.service.DiscoveryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Web-layer test: services are mocked, so this checks request mapping, validation and status codes only.
class DiscoveryControllerTest {
    private final DiscoveryService discovery = mock(DiscoveryService.class);
    private final AiRecommendationService recommendations = mock(AiRecommendationService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new DiscoveryController(discovery, recommendations))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    @BeforeEach
    void signIn() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(new AuthenticatedUser(7L, "member@example.test"), null, List.of()));
    }

    @AfterEach
    void signOut() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void searchReturnsPlacesForTheSignedInUser() throws Exception {
        when(discovery.searchPlaces(1L, 7L, "ramen")).thenReturn(List.of(PlaceResult.builder()
                .placeId("ramen1").name("Ichiran").latitude(35.66).longitude(139.70).build()));

        mvc.perform(post("/api/trips/1/discover/search").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"ramen\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].placeId").value("ramen1"))
                .andExpect(jsonPath("$[0].name").value("Ichiran"));
    }

    @Test
    void blankQueriesAndPlaceNamesAreRejected() throws Exception {
        mvc.perform(post("/api/trips/1/discover/search").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\" \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/trips/1/discover/recommend").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(discovery, recommendations);
    }

    @Test
    void recommendReturnsTheAiReason() throws Exception {
        when(recommendations.recommend(eq(1L), eq(7L), any())).thenReturn(new PlaceRecommendationResponse("Great food."));

        mvc.perform(post("/api/trips/1/discover/recommend").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Nishiki Market\",\"primaryType\":\"market\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reason").value("Great food."));
    }

    @Test
    void areaIsEmptyForAnUnrecognisedDestination() throws Exception {
        when(discovery.destinationBounds(1L, 7L)).thenReturn(null);
        mvc.perform(get("/api/trips/1/discover/area")).andExpect(status().isNoContent());

        when(discovery.destinationBounds(2L, 7L)).thenReturn(new DiscoveryService.MapBounds(35.5, 139.5, 35.8, 139.9));
        mvc.perform(get("/api/trips/2/discover/area"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.south").value(35.5))
                .andExpect(jsonPath("$.east").value(139.9));
    }

    @Test
    void photoIsReturnedAsRawImageBytes() throws Exception {
        when(discovery.fetchFirstPhoto(1L, 7L, "abc")).thenReturn(new DiscoveryService.PlacePhoto(new byte[] {1, 2, 3}, "image/png"));
        when(discovery.fetchFirstPhoto(1L, 7L, "none")).thenReturn(null);

        mvc.perform(get("/api/trips/1/discover/places/abc/photo"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/png"))
                .andExpect(content().bytes(new byte[] {1, 2, 3}));
        mvc.perform(get("/api/trips/1/discover/places/none/photo")).andExpect(status().isNoContent());
    }

    @Test
    void serviceErrorsMapToHttpStatuses() throws Exception {
        when(discovery.searchPlaces(eq(1L), eq(7L), anyString())).thenThrow(new AccessDeniedException("You are not a member of this trip"));
        when(discovery.searchPlaces(eq(2L), eq(7L), anyString())).thenThrow(new ServiceDisabledException("Place search is off"));
        when(discovery.fetchFirstPhoto(1L, 7L, "bad")).thenThrow(new IllegalArgumentException("Invalid place id"));

        mvc.perform(post("/api/trips/1/discover/search").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"ramen\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/trips/2/discover/search").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"ramen\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("Place search is off"));
        mvc.perform(get("/api/trips/1/discover/places/bad/photo")).andExpect(status().isBadRequest());
    }
}
