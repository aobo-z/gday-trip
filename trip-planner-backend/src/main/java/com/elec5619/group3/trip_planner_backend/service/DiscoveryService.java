package com.elec5619.group3.trip_planner_backend.service;

import java.util.NoSuchElementException;
import com.elec5619.group3.trip_planner_backend.exception.ExternalServiceException;
import com.elec5619.group3.trip_planner_backend.dto.PlaceResult;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class DiscoveryService {

    private static final String SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
    private static final String FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType";
    private static final String PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{placeId}";
    private static final String PLACES_API_BASE = "https://places.googleapis.com/v1/";
    private static final Pattern PLACE_ID = Pattern.compile("[A-Za-z0-9_-]{1,300}");
    private static final Pattern PHOTO_NAME = Pattern.compile("places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+");
    private static final String AREA_FIELD_MASK = "places.types,places.viewport";
    // Cities, regions and countries all carry "political"; the others cover named natural areas.
    private static final Set<String> AREA_TYPES = Set.of("political", "natural_feature", "colloquial_area");

    private final TripMemberRepository tripMemberRepository;
    private final ServiceSettingsService settings;
    private final RestClient restClient;
    private final String placesApiKey;
    // Keyed by normalised destination; an empty Optional means "not a real place", which is cached too.
    private final Map<String, Optional<GoogleViewport>> destinationAreas = new ConcurrentHashMap<>();

    public DiscoveryService(TripMemberRepository tripMemberRepository,
                             ServiceSettingsService settings,
                             @Value("${google.places.api-key}") String placesApiKey) {
        this.tripMemberRepository = tripMemberRepository;
        this.settings = settings;
        this.placesApiKey = placesApiKey;
        this.restClient = RestClient.create();
    }

    public List<PlaceResult> searchPlaces(Long tripId, Long userId, String query) {
        TripMember caller = requireActiveMember(tripId, userId);
        settings.requireEnabled(ServiceSettingsService.ExternalService.PLACE_SEARCH);

        // Without coordinates, Google biases results toward wherever this server's IP
        // geolocates to; "in <destination>" alone only acts as a keyword, so a Tokyo
        // search from Melbourne returned Tokyo-themed restaurants in Melbourne.
        String destination = caller.getTrip().getDestination();
        String locatedQuery = query + " in " + destination;
        GoogleViewport area = destinationArea(destination);

        GooglePlacesSearchResponse response = restClient.post()
                .uri(SEARCH_TEXT_URL)
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Goog-Api-Key", placesApiKey)
                .header("X-Goog-FieldMask", FIELD_MASK)
                .body(new GoogleTextSearchRequest(locatedQuery, null, area == null ? null : new GoogleLocationBias(area)))
                .retrieve()
                .body(GooglePlacesSearchResponse.class);

        if (response == null || response.places() == null) {
            return Collections.emptyList();
        }

        return response.places().stream()
                .map(place -> PlaceResult.builder()
                        .placeId(place.id())
                        .name(place.displayName().text())
                        .address(place.formattedAddress())
                        .latitude(place.location().latitude())
                        .longitude(place.location().longitude())
                        .primaryType(place.primaryType())
                        .build())
                .collect(Collectors.toList());
    }

    /**
     * The place's first Google photo (about 1200px wide), or null if it has none.
     * Costs one billable Place Photo request; the photos lookup itself is free.
     */
    public PlacePhoto fetchFirstPhoto(Long tripId, Long userId, String placeId) {
        requireActiveMember(tripId, userId);
        settings.requireEnabled(ServiceSettingsService.ExternalService.PLACE_PHOTOS);
        if (placeId == null || !PLACE_ID.matcher(placeId).matches()) {
            throw new IllegalArgumentException("Invalid place id");
        }
        return downloadFirstPhoto(placeId);
    }

    /**
     * AI Planner: the first photo of a place found by {@link #locate}. Empty when photos are switched off,
     * the place has none, or Google fails, so a missing photo never blocks saving a plan.
     */
    public Optional<PlacePhoto> findPhoto(String placeId) {
        if (!settings.isEnabled(ServiceSettingsService.ExternalService.PLACE_PHOTOS)
                || placeId == null || !PLACE_ID.matcher(placeId).matches()) {
            return Optional.empty();
        }
        try {
            return Optional.ofNullable(downloadFirstPhoto(placeId));
        } catch (RestClientException e) {
            return Optional.empty();
        }
    }

    /**
     * Up to three Google photos of the destination itself, offered as trip covers.
     * Empty when search or photos are switched off, the place isn't found, or Google fails.
     */
    public List<String> destinationPhotos(String destination) {
        if (!settings.isEnabled(ServiceSettingsService.ExternalService.PLACE_SEARCH)
                || !settings.isEnabled(ServiceSettingsService.ExternalService.PLACE_PHOTOS)
                || destination == null || destination.isBlank()) {
            return List.of();
        }
        try {
            GooglePlacesSearchResponse response = restClient.post()
                    .uri(SEARCH_TEXT_URL)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Goog-Api-Key", placesApiKey)
                    .header("X-Goog-FieldMask", "places.photos")
                    .body(new GoogleTextSearchRequest(destination.trim(), 1, null))
                    .retrieve()
                    .body(GooglePlacesSearchResponse.class);
            if (response == null || response.places() == null || response.places().isEmpty()
                    || response.places().get(0).photos() == null) {
                return List.of();
            }
            return response.places().get(0).photos().stream()
                    .map(GooglePhotoRef::name)
                    .filter(name -> name != null && PHOTO_NAME.matcher(name).matches())
                    .limit(3)
                    .toList();
        } catch (RestClientException e) {
            return List.of();
        }
    }

    /** One Google photo by the name {@link #destinationPhotos} returned. */
    public PlacePhoto photo(String photoName) {
        settings.requireEnabled(ServiceSettingsService.ExternalService.PLACE_PHOTOS);
        if (photoName == null || !PHOTO_NAME.matcher(photoName).matches()) {
            throw new IllegalArgumentException("Invalid photo");
        }
        PlacePhoto photo;
        try {
            photo = downloadPhoto(photoName);
        } catch (RestClientException e) {
            throw new ExternalServiceException("Google could not return this photo.");
        }
        if (photo == null) throw new NoSuchElementException("Photo not found");
        return photo;
    }

    private PlacePhoto downloadFirstPhoto(String placeId) {
        // A "photos"-only field mask keeps this in the free Place Details Essentials (IDs Only) SKU.
        GooglePlacePhotos details = restClient.get()
                .uri(PLACE_DETAILS_URL, placeId)
                .header("X-Goog-Api-Key", placesApiKey)
                .header("X-Goog-FieldMask", "photos")
                .retrieve()
                .body(GooglePlacePhotos.class);
        if (details == null || details.photos() == null || details.photos().isEmpty()) {
            return null;
        }

        String photoName = details.photos().get(0).name();
        if (photoName == null || !PHOTO_NAME.matcher(photoName).matches()) {
            return null;
        }
        return downloadPhoto(photoName);
    }

    private PlacePhoto downloadPhoto(String photoName) {
        // Photo names contain slashes, so they're appended rather than expanded as a URI variable.
        GooglePhotoMedia media = restClient.get()
                .uri(URI.create(PLACES_API_BASE + photoName + "/media?maxWidthPx=1200&skipHttpRedirect=true"))
                .header("X-Goog-Api-Key", placesApiKey)
                .retrieve()
                .body(GooglePhotoMedia.class);
        if (media == null || media.photoUri() == null || !media.photoUri().startsWith("https://")) {
            return null;
        }

        ResponseEntity<byte[]> image = restClient.get()
                .uri(URI.create(media.photoUri()))
                .accept(MediaType.IMAGE_JPEG)
                .retrieve()
                .toEntity(byte[].class);
        if (image.getBody() == null || image.getBody().length == 0) {
            return null;
        }
        MediaType type = image.getHeaders().getContentType();
        return new PlacePhoto(image.getBody(), type == null ? MediaType.IMAGE_JPEG_VALUE : type.toString());
    }

    public record PlacePhoto(byte[] data, String contentType) {
    }

    /** Initial view for the trip map; reuses the area cached for Discover searches. */
    public MapBounds destinationBounds(Long tripId, Long userId) {
        TripMember caller = requireActiveMember(tripId, userId);
        // The area lookup is a Places search; with search off the map just opens on its default view.
        if (!settings.isEnabled(ServiceSettingsService.ExternalService.PLACE_SEARCH)) {
            return null;
        }
        GoogleViewport area = destinationArea(caller.getTrip().getDestination());
        return area == null ? null : new MapBounds(area.low().latitude(), area.low().longitude(),
                area.high().latitude(), area.high().longitude());
    }

    public record MapBounds(double south, double west, double north, double east) {
    }

    /**
     * The Google place (id and coordinates) for something the AI Planner suggested, searched near the trip destination.
     * Empty when search is switched off, nothing matches, or Google fails; the activity is then saved without a pin.
     */
    public Optional<PlaceMatch> locate(String query, String destination) {
        if (!settings.isEnabled(ServiceSettingsService.ExternalService.PLACE_SEARCH)) {
            return Optional.empty();
        }
        try {
            GoogleViewport area = destinationArea(destination);
            GooglePlacesSearchResponse response = restClient.post()
                    .uri(SEARCH_TEXT_URL)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Goog-Api-Key", placesApiKey)
                    .header("X-Goog-FieldMask", "places.id,places.location")
                    .body(new GoogleTextSearchRequest(query, 1, area == null ? null : new GoogleLocationBias(area)))
                    .retrieve()
                    .body(GooglePlacesSearchResponse.class);
            if (response == null || response.places() == null || response.places().isEmpty()
                    || response.places().get(0).location() == null) {
                return Optional.empty();
            }
            GooglePlace place = response.places().get(0);
            return Optional.of(new PlaceMatch(place.id(), place.location().latitude(), place.location().longitude()));
        } catch (RestClientException e) {
            return Optional.empty();
        }
    }

    public record PlaceMatch(String placeId, double latitude, double longitude) {
    }

    /** The destination's bounding box, or null when it isn't a recognisable place (e.g. "test"). */
    private GoogleViewport destinationArea(String destination) {
        String key = destination.trim().toLowerCase(Locale.ROOT);
        Optional<GoogleViewport> cached = destinationAreas.get(key);
        if (cached != null) {
            return cached.orElse(null);
        }
        try {
            Optional<GoogleViewport> area = lookupArea(destination);
            destinationAreas.put(key, area);
            return area.orElse(null);
        } catch (RestClientException e) {
            // Search unbiased this time; a transient failure isn't cached, so the lookup retries next search.
            return null;
        }
    }

    private Optional<GoogleViewport> lookupArea(String destination) {
        GooglePlacesSearchResponse response = restClient.post()
                .uri(SEARCH_TEXT_URL)
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Goog-Api-Key", placesApiKey)
                .header("X-Goog-FieldMask", AREA_FIELD_MASK)
                .body(new GoogleTextSearchRequest(destination, 1, null))
                .retrieve()
                .body(GooglePlacesSearchResponse.class);
        if (response == null || response.places() == null || response.places().isEmpty()) {
            return Optional.empty();
        }
        // A business that merely shares the name (a "Test Kitchen" near the server)
        // would just recreate the IP bias, so only geographic areas are used.
        GooglePlace match = response.places().get(0);
        boolean isArea = match.types() != null && match.types().stream().anyMatch(AREA_TYPES::contains);
        GoogleViewport viewport = match.viewport();
        if (!isArea || viewport == null || viewport.low() == null || viewport.high() == null) {
            return Optional.empty();
        }
        return Optional.of(viewport);
    }

    private TripMember requireActiveMember(Long tripId, Long userId) {
        return tripMemberRepository.findByTrip_TripIdAndUser_UserId(tripId, userId)
                .filter(TripMember::isActive)
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this trip"));
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private record GoogleTextSearchRequest(String textQuery, Integer pageSize, GoogleLocationBias locationBias) {
    }

    private record GoogleLocationBias(GoogleViewport rectangle) {
    }

    private record GoogleViewport(GoogleLatLng low, GoogleLatLng high) {
    }

    private record GooglePlacePhotos(List<GooglePhotoRef> photos) {
    }

    private record GooglePhotoRef(String name) {
    }

    private record GooglePhotoMedia(String photoUri) {
    }

    private record GooglePlacesSearchResponse(List<GooglePlace> places) {
    }

    private record GooglePlace(String id, GoogleDisplayName displayName, String formattedAddress, GoogleLatLng location,
                                String primaryType, List<String> types, GoogleViewport viewport, List<GooglePhotoRef> photos) {
    }

    private record GoogleDisplayName(String text) {
    }

    private record GoogleLatLng(double latitude, double longitude) {
    }
}
