package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.AiModelOption;
import com.elec5619.group3.trip_planner_backend.dto.ServiceTestResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * FR-22: admin "test connection" checks and the Gemini model list.
 * Tests ignore the on/off switches, so an admin can check a service before turning it on.
 */
@Service
public class ExternalServiceProbe {

    public enum Target { PLACE_SEARCH, PLACE_PHOTOS, AI }

    private static final String PLACES_API_BASE = "https://places.googleapis.com/v1/";
    private static final String GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/";
    private static final String TEST_QUERY = "Sydney Opera House";
    // These Gemini variants accept generateContent but aren't for written answers (speech, images, video, robotics).
    private static final Set<String> NON_TEXT_MODELS = Set.of(
            "tts", "image", "embedding", "audio", "live", "transcribe", "translate", "omni", "robotics");
    private static final int MAX_MESSAGE_LENGTH = 200;

    private final ServiceSettingsService settings;
    private final RestClient restClient = RestClient.create();
    private final String placesApiKey;
    private final String geminiApiKey;

    public ExternalServiceProbe(ServiceSettingsService settings,
                                @Value("${google.places.api-key}") String placesApiKey,
                                @Value("${gemini.api-key}") String geminiApiKey) {
        this.settings = settings;
        this.placesApiKey = placesApiKey;
        this.geminiApiKey = geminiApiKey;
    }

    /** @param model the AI model to try; null tests the saved model. */
    public ServiceTestResponse test(Target target, String model) {
        long start = System.nanoTime();
        try {
            String detail = switch (target) {
                case PLACE_SEARCH -> {
                    findTestPlace();
                    yield "Found a result for \"" + TEST_QUERY + "\".";
                }
                case PLACE_PHOTOS -> {
                    fetchTestPhotoLink(findTestPlace());
                    yield "Fetched a photo of \"" + TEST_QUERY + "\".";
                }
                case AI -> {
                    String tested = model == null ? settings.aiModel() : model;
                    askGemini(tested);
                    yield tested + " replied.";
                }
            };
            return new ServiceTestResponse(true, elapsedMs(start), detail);
        } catch (RestClientResponseException e) {
            return new ServiceTestResponse(false, elapsedMs(start),
                    truncate("HTTP " + e.getStatusCode().value() + ": " + googleMessage(e)));
        } catch (RestClientException | IllegalStateException e) {
            return new ServiceTestResponse(false, elapsedMs(start), truncate(e.getMessage()));
        }
    }

    /** Text models this API key can call, as listed by Gemini. */
    public List<AiModelOption> aiModels() {
        try {
            GeminiModelList list = restClient.get()
                    .uri(GEMINI_API_BASE + "models?pageSize=1000")
                    .header("X-Goog-Api-Key", geminiApiKey)
                    .retrieve()
                    .body(GeminiModelList.class);
            if (list == null || list.models() == null) {
                return List.of();
            }
            return list.models().stream()
                    .filter(model -> model.supportedGenerationMethods() != null
                            && model.supportedGenerationMethods().contains("generateContent"))
                    .map(model -> new AiModelOption(model.name().replaceFirst("^models/", ""), model.displayName()))
                    .filter(option -> option.id().startsWith("gemini")
                            && option.id().matches(ServiceSettingsService.AI_MODEL_PATTERN)
                            && NON_TEXT_MODELS.stream().noneMatch(option.id()::contains))
                    .toList();
        } catch (RestClientException e) {
            throw new IllegalStateException("Couldn't load the model list from Gemini.");
        }
    }

    private String findTestPlace() {
        PlaceSearch result = restClient.post()
                .uri(PLACES_API_BASE + "places:searchText")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Goog-Api-Key", placesApiKey)
                // IDs only: the free Text Search tier.
                .header("X-Goog-FieldMask", "places.id")
                .body(Map.of("textQuery", TEST_QUERY, "pageSize", 1))
                .retrieve()
                .body(PlaceSearch.class);
        if (result == null || result.places() == null || result.places().isEmpty()) {
            throw new IllegalStateException("Google returned no results for \"" + TEST_QUERY + "\".");
        }
        return result.places().get(0).id();
    }

    private void fetchTestPhotoLink(String placeId) {
        PlacePhotos details = restClient.get()
                .uri(PLACES_API_BASE + "places/{placeId}", placeId)
                .header("X-Goog-Api-Key", placesApiKey)
                .header("X-Goog-FieldMask", "photos")
                .retrieve()
                .body(PlacePhotos.class);
        if (details == null || details.photos() == null || details.photos().isEmpty()) {
            throw new IllegalStateException("Google returned no photos for \"" + TEST_QUERY + "\".");
        }
        // skipHttpRedirect returns the photo link without downloading the image.
        PhotoMedia media = restClient.get()
                .uri(URI.create(PLACES_API_BASE + details.photos().get(0).name() + "/media?maxWidthPx=400&skipHttpRedirect=true"))
                .header("X-Goog-Api-Key", placesApiKey)
                .retrieve()
                .body(PhotoMedia.class);
        if (media == null || media.photoUri() == null) {
            throw new IllegalStateException("Google didn't return a photo link.");
        }
    }

    // A 200 isn't enough: Ask AI reads the first text part, so the test requires one too.
    private void askGemini(String model) {
        GeminiReply reply = restClient.post()
                .uri(GEMINI_API_BASE + "models/" + model + ":generateContent")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Goog-Api-Key", geminiApiKey)
                .body(Map.of("contents", List.of(Map.of("parts", List.of(Map.of("text",
                        "In one short sentence, why is the Sydney Opera House worth visiting?"))))))
                .retrieve()
                .body(GeminiReply.class);
        boolean hasText = reply != null && reply.candidates() != null && !reply.candidates().isEmpty()
                && reply.candidates().get(0).content() != null
                && reply.candidates().get(0).content().parts() != null
                && !reply.candidates().get(0).content().parts().isEmpty()
                && reply.candidates().get(0).content().parts().get(0).text() != null
                && !reply.candidates().get(0).content().parts().get(0).text().isBlank();
        if (!hasText) {
            throw new IllegalStateException(model + " answered without any text, so it can't be used for AI recommendations.");
        }
    }

    private static String googleMessage(RestClientResponseException e) {
        try {
            GoogleError error = e.getResponseBodyAs(GoogleError.class);
            if (error != null && error.error() != null && error.error().message() != null) {
                return error.error().message();
            }
        } catch (RuntimeException ignored) {
            // Not a Google JSON error body; fall back to the status text.
        }
        return e.getStatusText();
    }

    private static long elapsedMs(long start) {
        return (System.nanoTime() - start) / 1_000_000;
    }

    private static String truncate(String message) {
        if (message == null) return "The service didn't respond as expected.";
        return message.length() <= MAX_MESSAGE_LENGTH ? message : message.substring(0, MAX_MESSAGE_LENGTH) + "…";
    }

    private record PlaceSearch(List<PlaceId> places) {
    }

    private record PlaceId(String id) {
    }

    private record PlacePhotos(List<PhotoRef> photos) {
    }

    private record PhotoRef(String name) {
    }

    private record PhotoMedia(String photoUri) {
    }

    private record GeminiModelList(List<GeminiModel> models) {
    }

    private record GeminiModel(String name, String displayName, List<String> supportedGenerationMethods) {
    }

    private record GeminiReply(List<GeminiCandidate> candidates) {
    }

    private record GeminiCandidate(GeminiContent content) {
    }

    private record GeminiContent(List<GeminiPart> parts) {
    }

    private record GeminiPart(String text) {
    }

    private record GoogleError(GoogleErrorBody error) {
    }

    private record GoogleErrorBody(String message) {
    }
}
