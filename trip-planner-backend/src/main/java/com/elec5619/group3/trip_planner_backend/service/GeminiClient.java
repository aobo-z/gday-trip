package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.exception.ExternalServiceException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Text generation with the Gemini model an admin has selected (read per call, so a switch applies at once).
 * Callers check the AI on/off switch themselves.
 */
@Component
public class GeminiClient {

    private static final String GENERATE_URL_TEMPLATE =
            "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent";
    // A multi-day itinerary can take the model close to a minute; anything longer is treated as a failure.
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(90);

    private final ServiceSettingsService settings;
    private final RestClient restClient;
    private final String apiKey;

    public GeminiClient(ServiceSettingsService settings, @Value("${gemini.api-key}") String apiKey) {
        this.settings = settings;
        this.apiKey = apiKey;
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory();
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = RestClient.builder().requestFactory(requestFactory).build();
    }

    /**
     * @param generationConfig Gemini generationConfig (e.g. a JSON response schema), or null for plain text
     * @return the first text part of the first candidate, or null if the model returned none
     */
    public String generate(String prompt, Map<String, Object> generationConfig) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("contents", List.of(new Content(List.of(new Part(prompt)))));
        if (generationConfig != null) {
            body.put("generationConfig", generationConfig);
        }
        try {
            Response response = restClient.post()
                    .uri(GENERATE_URL_TEMPLATE.formatted(settings.aiModel()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Goog-Api-Key", apiKey)
                    .body(body)
                    .retrieve()
                    .body(Response.class);
            return firstText(response);
        } catch (RestClientException e) {
            throw new ExternalServiceException("The AI service didn't respond. Please try again in a moment.");
        }
    }

    private static String firstText(Response response) {
        if (response == null || response.candidates() == null || response.candidates().isEmpty()) {
            return null;
        }
        Content content = response.candidates().get(0).content();
        if (content == null || content.parts() == null || content.parts().isEmpty()) {
            return null;
        }
        return content.parts().get(0).text();
    }

    private record Content(List<Part> parts) {
    }

    private record Part(String text) {
    }

    private record Response(List<Candidate> candidates) {
    }

    private record Candidate(Content content) {
    }
}
