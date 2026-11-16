package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.PlaceRecommendationRequest;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.exception.ServiceDisabledException;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService.ExternalService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiRecommendationServiceTests {
    final TripMemberRepository members = mock(TripMemberRepository.class);
    final ServiceSettingsService settings = mock(ServiceSettingsService.class);
    final GeminiClient gemini = mock(GeminiClient.class);
    final AiRecommendationService service = new AiRecommendationService(members, settings, gemini);
    final PlaceRecommendationRequest place = new PlaceRecommendationRequest();

    @BeforeEach void setUp() {
        Trip trip = new Trip();
        trip.setDestination("Kyoto");
        trip.setStartDate(LocalDate.of(2026, 11, 1));
        trip.setEndDate(LocalDate.of(2026, 11, 3));
        TripMember member = new TripMember();
        member.setTrip(trip);
        when(members.findByTrip_TripIdAndUser_UserId(1L, 2L)).thenReturn(Optional.of(member));
        place.setName("Nishiki Market");
    }

    @Test void promptDescribesTheTripAndPlace() {
        place.setPrimaryType("market");
        place.setAddress("Nakagyo Ward");
        when(gemini.generate(anyString(), isNull())).thenReturn("Great street food.");

        assertEquals("Great street food.", service.recommend(1L, 2L, place).getReason());
        verify(gemini).generate(argThat(prompt -> prompt.contains("Kyoto (2026-11-01 to 2026-11-03)")
                && prompt.contains("Place: Nishiki Market (market), Nakagyo Ward.")), isNull());
    }

    @Test void optionalDetailsAreLeftOutOfThePrompt() {
        when(gemini.generate(anyString(), isNull())).thenReturn("ok");
        service.recommend(1L, 2L, place);
        verify(gemini).generate(contains("Place: Nishiki Market.\n"), isNull());
    }

    @Test void anEmptyAnswerFallsBackToAFixedReason() {
        when(gemini.generate(anyString(), isNull())).thenReturn(null, "  ");
        assertEquals("No recommendation available right now.", service.recommend(1L, 2L, place).getReason());
        assertEquals("No recommendation available right now.", service.recommend(1L, 2L, place).getReason());
    }

    @Test void nonMembersAndADisabledServiceNeverReachGemini() {
        assertThrows(AccessDeniedException.class, () -> service.recommend(9L, 2L, place));
        doThrow(new ServiceDisabledException("off")).when(settings).requireEnabled(ExternalService.AI_RECOMMENDATIONS);
        assertThrows(ServiceDisabledException.class, () -> service.recommend(1L, 2L, place));
        verifyNoInteractions(gemini);
    }
}
