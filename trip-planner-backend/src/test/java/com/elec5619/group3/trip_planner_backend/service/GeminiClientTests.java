package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.exception.ExternalServiceException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class GeminiClientTests {
    static final String URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent";

    final RestClient.Builder builder = RestClient.builder();
    final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    final ServiceSettingsService settings = mock(ServiceSettingsService.class);
    final GeminiClient gemini = new GeminiClient(settings, "gemini-key");

    @BeforeEach void setUp() {
        ReflectionTestUtils.setField(gemini, "restClient", builder.build());
        when(settings.aiModel()).thenReturn("gemini-test");
    }

    @Test void sendsThePromptToTheSelectedModelAndReturnsTheFirstText() {
        server.expect(requestTo(URL)).andExpect(header("X-Goog-Api-Key", "gemini-key"))
                .andExpect(jsonPath("$.contents[0].parts[0].text").value("Why Kyoto?"))
                .andExpect(jsonPath("$.generationConfig").doesNotExist())
                .andRespond(withSuccess("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Temples.\"},{\"text\":\"ignored\"}]}}]}",
                        MediaType.APPLICATION_JSON));
        assertEquals("Temples.", gemini.generate("Why Kyoto?", null));
        server.verify();
    }

    @Test void passesGenerationConfigThrough() {
        server.expect(requestTo(URL)).andExpect(jsonPath("$.generationConfig.responseMimeType").value("application/json"))
                .andRespond(withSuccess("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"{}\"}]}}]}", MediaType.APPLICATION_JSON));
        assertEquals("{}", gemini.generate("plan", Map.of("responseMimeType", "application/json")));
        server.verify();
    }

    @Test void repliesWithoutTextGiveNull() {
        for (String reply : new String[] {"{}", "{\"candidates\":[]}", "{\"candidates\":[{}]}", "{\"candidates\":[{\"content\":{\"parts\":[]}}]}"}) {
            server.expect(requestTo(URL)).andRespond(withSuccess(reply, MediaType.APPLICATION_JSON));
        }
        for (int i = 0; i < 4; i++) assertNull(gemini.generate("x", null));
        server.verify();
    }

    @Test void upstreamFailuresBecomeAFriendlyError() {
        server.expect(requestTo(URL)).andRespond(withServerError());
        ExternalServiceException e = assertThrows(ExternalServiceException.class, () -> gemini.generate("x", null));
        assertEquals("The AI service didn't respond. Please try again in a moment.", e.getMessage());
    }
}
