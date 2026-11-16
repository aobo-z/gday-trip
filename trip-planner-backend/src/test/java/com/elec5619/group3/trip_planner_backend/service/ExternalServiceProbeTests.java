package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.AiModelOption;
import com.elec5619.group3.trip_planner_backend.dto.ServiceTestResponse;
import com.elec5619.group3.trip_planner_backend.service.ExternalServiceProbe.Target;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

// FR-22 admin "test connection": every outcome must come back as a ServiceTestResponse, never an exception.
class ExternalServiceProbeTests {
    static final String SEARCH = "https://places.googleapis.com/v1/places:searchText";
    static final String DETAILS = "https://places.googleapis.com/v1/places/opera";
    static final String MEDIA = "https://places.googleapis.com/v1/places/opera/photos/p1/media?maxWidthPx=400&skipHttpRedirect=true";
    static final String GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
    static final String REPLY = "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Iconic architecture.\"}]}}]}";

    final RestClient.Builder builder = RestClient.builder();
    final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    final ServiceSettingsService settings = mock(ServiceSettingsService.class);
    final ExternalServiceProbe probe = new ExternalServiceProbe(settings, "places-key", "gemini-key");

    @BeforeEach void setUp() {
        ReflectionTestUtils.setField(probe, "restClient", builder.build());
        when(settings.aiModel()).thenReturn("gemini-saved");
    }

    @Test void placeSearchSucceedsWhenGoogleReturnsAPlace() {
        server.expect(requestTo(SEARCH)).andExpect(header("X-Goog-Api-Key", "places-key"))
                .andExpect(jsonPath("$.textQuery").value("Sydney Opera House"))
                .andRespond(withSuccess("{\"places\":[{\"id\":\"opera\"}]}", MediaType.APPLICATION_JSON));
        ServiceTestResponse result = probe.test(Target.PLACE_SEARCH, null);
        assertTrue(result.ok());
        assertTrue(result.latencyMs() >= 0);
        server.verify();
    }

    @Test void placeSearchWithNoResultsFails() {
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        ServiceTestResponse result = probe.test(Target.PLACE_SEARCH, null);
        assertFalse(result.ok());
        assertEquals("Google returned no results for \"Sydney Opera House\".", result.message());
    }

    @Test void placePhotosFetchesALinkWithoutDownloadingTheImage() {
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("{\"places\":[{\"id\":\"opera\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(DETAILS)).andRespond(withSuccess("{\"photos\":[{\"name\":\"places/opera/photos/p1\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(MEDIA)).andRespond(withSuccess("{\"photoUri\":\"https://lh3.example/p1\"}", MediaType.APPLICATION_JSON));
        assertTrue(probe.test(Target.PLACE_PHOTOS, null).ok());
        server.verify();
    }

    @Test void placePhotosFailWithoutPhotosOrALink() {
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("{\"places\":[{\"id\":\"opera\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(DETAILS)).andRespond(withSuccess("{\"photos\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("{\"places\":[{\"id\":\"opera\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(DETAILS)).andRespond(withSuccess("{\"photos\":[{\"name\":\"places/opera/photos/p1\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(MEDIA)).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        assertEquals("Google returned no photos for \"Sydney Opera House\".", probe.test(Target.PLACE_PHOTOS, null).message());
        assertEquals("Google didn't return a photo link.", probe.test(Target.PLACE_PHOTOS, null).message());
        server.verify();
    }

    @Test void aiTestsTheSavedModelOrTheOneGiven() {
        server.expect(requestTo(GEMINI + "gemini-saved:generateContent")).andExpect(header("X-Goog-Api-Key", "gemini-key"))
                .andRespond(withSuccess(REPLY, MediaType.APPLICATION_JSON));
        server.expect(requestTo(GEMINI + "gemini-other:generateContent")).andRespond(withSuccess(REPLY, MediaType.APPLICATION_JSON));

        assertEquals("gemini-saved replied.", probe.test(Target.AI, null).message());
        assertEquals("gemini-other replied.", probe.test(Target.AI, "gemini-other").message());
        server.verify();
    }

    @Test void aModelThatRepliesWithoutTextFailsAndLongMessagesAreTruncated() {
        String longModel = "gemini-" + "x".repeat(250);
        server.expect(requestTo(GEMINI + longModel + ":generateContent"))
                .andRespond(withSuccess("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" \"}]}}]}", MediaType.APPLICATION_JSON));
        ServiceTestResponse result = probe.test(Target.AI, longModel);
        assertFalse(result.ok());
        assertEquals(201, result.message().length());
        assertTrue(result.message().endsWith("…"));
    }

    @Test void httpErrorsShowGooglesMessageOrTheStatus() {
        server.expect(requestTo(SEARCH)).andRespond(withStatus(HttpStatus.FORBIDDEN)
                .contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"message\":\"API key not valid.\"}}"));
        server.expect(requestTo(SEARCH)).andRespond(withServerError().body("<html>oops</html>").contentType(MediaType.TEXT_HTML));

        assertEquals("HTTP 403: API key not valid.", probe.test(Target.PLACE_SEARCH, null).message());
        assertTrue(probe.test(Target.PLACE_SEARCH, null).message().startsWith("HTTP 500: "));
        server.verify();
    }

    @Test void modelListKeepsOnlyCallableTextModels() {
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"))
                .andRespond(withSuccess("""
                        {"models":[
                          {"name":"models/gemini-2.5-flash","displayName":"Gemini 2.5 Flash","supportedGenerationMethods":["generateContent"]},
                          {"name":"models/gemini-2.5-flash-preview-tts","displayName":"TTS","supportedGenerationMethods":["generateContent"]},
                          {"name":"models/gemini-embedding-001","displayName":"Embedding","supportedGenerationMethods":["embedContent"]},
                          {"name":"models/text-bison","displayName":"Bison","supportedGenerationMethods":["generateContent"]},
                          {"name":"models/gemini-legacy","displayName":"Legacy"}]}""", MediaType.APPLICATION_JSON));
        assertEquals(List.of(new AiModelOption("gemini-2.5-flash", "Gemini 2.5 Flash")), probe.aiModels());
        server.verify();
    }

    @Test void modelListFailuresAreReportedPlainly() {
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"))
                .andRespond(withServerError());
        assertTrue(probe.aiModels().isEmpty());
        assertThrows(IllegalStateException.class, probe::aiModels);
        server.verify();
    }
}
