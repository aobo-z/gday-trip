package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.PlaceResult;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.exception.ExternalServiceException;
import com.elec5619.group3.trip_planner_backend.exception.ServiceDisabledException;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.service.ServiceSettingsService.ExternalService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

// Google Places is replaced by MockRestServiceServer, so no API key or network is needed.
class DiscoveryServiceTests {
    static final String SEARCH = "https://places.googleapis.com/v1/places:searchText";
    static final String DETAILS = "https://places.googleapis.com/v1/places/abc";
    static final String MEDIA = "https://places.googleapis.com/v1/places/abc/photos/p1/media?maxWidthPx=1200&skipHttpRedirect=true";
    static final String IMAGE = "https://lh3.googleusercontent.com/p1";
    static final String TOKYO_AREA = """
            {"places":[{"types":["locality","political"],
              "viewport":{"low":{"latitude":35.5,"longitude":139.5},"high":{"latitude":35.8,"longitude":139.9}}}]}""";
    static final String RAMEN = """
            {"places":[{"id":"ramen1","displayName":{"text":"Ichiran"},"formattedAddress":"Shibuya, Tokyo",
              "location":{"latitude":35.66,"longitude":139.70},"primaryType":"restaurant"}]}""";

    final RestClient.Builder builder = RestClient.builder();
    final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    final TripMemberRepository members = mock(TripMemberRepository.class);
    final ServiceSettingsService settings = mock(ServiceSettingsService.class);
    final DiscoveryService service = new DiscoveryService(members, settings, "test-key");
    final TripMember member = new TripMember();

    @BeforeEach void setUp() {
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        when(settings.isEnabled(any())).thenReturn(true);
        Trip trip = new Trip();
        trip.setDestination("Tokyo");
        member.setTrip(trip);
        when(members.findByTrip_TripIdAndUser_UserId(1L, 2L)).thenReturn(Optional.of(member));
    }

    @Test void searchIsBiasedToTheDestinationAreaWhichIsLookedUpOnce() {
        server.expect(requestTo(SEARCH)).andExpect(header("X-Goog-FieldMask", "places.types,places.viewport"))
                .andRespond(withSuccess(TOKYO_AREA, MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andExpect(header("X-Goog-Api-Key", "test-key"))
                .andExpect(jsonPath("$.textQuery").value("ramen in Tokyo"))
                .andExpect(jsonPath("$.locationBias.rectangle.low.latitude").value(35.5))
                .andRespond(withSuccess(RAMEN, MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        List<PlaceResult> results = service.searchPlaces(1L, 2L, "ramen");
        assertEquals(1, results.size());
        assertEquals("Ichiran", results.get(0).getName());
        assertEquals("restaurant", results.get(0).getPrimaryType());
        assertTrue(service.searchPlaces(1L, 2L, "sushi").isEmpty());
        // The map reuses the cached area, so no further request is made.
        assertEquals(new DiscoveryService.MapBounds(35.5, 139.5, 35.8, 139.9), service.destinationBounds(1L, 2L));
        server.verify();
    }

    @Test void aBusinessSharingTheDestinationNameIsNotUsedAsAnArea() {
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("""
                {"places":[{"types":["restaurant"],"viewport":{"low":{"latitude":1,"longitude":1},"high":{"latitude":2,"longitude":2}}}]}""",
                MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andExpect(jsonPath("$.locationBias").doesNotExist())
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        assertTrue(service.searchPlaces(1L, 2L, "ramen").isEmpty());
        assertNull(service.destinationBounds(1L, 2L));
        server.verify();
    }

    @Test void aFailedAreaLookupIsNotCachedAndIsRetried() {
        server.expect(requestTo(SEARCH)).andRespond(withServerError());
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andRespond(withSuccess(TOKYO_AREA, MediaType.APPLICATION_JSON));

        assertTrue(service.searchPlaces(1L, 2L, "ramen").isEmpty());
        assertNotNull(service.destinationBounds(1L, 2L));
        server.verify();
    }

    @Test void onlyJoinedMembersCanUseDiscovery() {
        member.setInviteStatus("PENDING");
        assertThrows(AccessDeniedException.class, () -> service.searchPlaces(1L, 2L, "ramen"));
        assertThrows(AccessDeniedException.class, () -> service.fetchFirstPhoto(1L, 2L, "abc"));
        assertThrows(AccessDeniedException.class, () -> service.destinationBounds(9L, 2L));
        server.verify();
    }

    @Test void switchedOffServicesMakeNoGoogleCalls() {
        doThrow(new ServiceDisabledException("off")).when(settings).requireEnabled(ExternalService.PLACE_SEARCH);
        when(settings.isEnabled(any())).thenReturn(false);

        assertThrows(ServiceDisabledException.class, () -> service.searchPlaces(1L, 2L, "ramen"));
        assertNull(service.destinationBounds(1L, 2L));
        assertTrue(service.locate("Nishiki Market", "Kyoto").isEmpty());
        assertTrue(service.findPhoto("abc").isEmpty());
        assertTrue(service.destinationPhotos("Kyoto").isEmpty());
        server.verify();
    }

    @Test void firstPhotoIsDownloadedWithItsContentType() {
        server.expect(requestTo(DETAILS)).andExpect(header("X-Goog-FieldMask", "photos"))
                .andRespond(withSuccess("{\"photos\":[{\"name\":\"places/abc/photos/p1\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(MEDIA)).andRespond(withSuccess("{\"photoUri\":\"" + IMAGE + "\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(IMAGE)).andRespond(withSuccess(new byte[] {1, 2, 3}, MediaType.IMAGE_PNG));

        DiscoveryService.PlacePhoto photo = service.fetchFirstPhoto(1L, 2L, "abc");
        assertArrayEquals(new byte[] {1, 2, 3}, photo.data());
        assertEquals("image/png", photo.contentType());
        server.verify();
    }

    @Test void missingOrUnsafePhotosAreReportedAsNoPhoto() {
        server.expect(requestTo(DETAILS)).andRespond(withSuccess("{\"photos\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(DETAILS)).andRespond(withSuccess("{\"photos\":[{\"name\":\"../evil\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(DETAILS)).andRespond(withSuccess("{\"photos\":[{\"name\":\"places/abc/photos/p1\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(MEDIA)).andRespond(withSuccess("{\"photoUri\":\"http://insecure.example/p1\"}", MediaType.APPLICATION_JSON));

        assertNull(service.fetchFirstPhoto(1L, 2L, "abc"));
        assertNull(service.fetchFirstPhoto(1L, 2L, "abc"));
        assertNull(service.fetchFirstPhoto(1L, 2L, "abc"));
        assertThrows(IllegalArgumentException.class, () -> service.fetchFirstPhoto(1L, 2L, "../abc"));
        server.verify();
    }

    @Test void aiPlannerPhotoLookupNeverFails() {
        server.expect(requestTo(DETAILS)).andRespond(withServerError());
        assertTrue(service.findPhoto("abc").isEmpty());
        assertTrue(service.findPhoto("bad id!").isEmpty());
        server.verify();
    }

    @Test void destinationPhotosKeepUpToThreeValidNames() {
        server.expect(requestTo(SEARCH)).andExpect(jsonPath("$.textQuery").value("Kyoto"))
                .andRespond(withSuccess("""
                        {"places":[{"photos":[{"name":"places/k/photos/1"},{"name":"bad"},{"name":"places/k/photos/2"},
                          {"name":"places/k/photos/3"},{"name":"places/k/photos/4"}]}]}""", MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("{\"places\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andRespond(withServerError());

        assertEquals(List.of("places/k/photos/1", "places/k/photos/2", "places/k/photos/3"), service.destinationPhotos(" Kyoto "));
        assertTrue(service.destinationPhotos("Nowhere").isEmpty());
        assertTrue(service.destinationPhotos("Kyoto").isEmpty());
        assertTrue(service.destinationPhotos("  ").isEmpty());
        server.verify();
    }

    @Test void coverPhotoByNameReportsBadInputMissingPhotosAndGoogleFailures() {
        String media = "https://places.googleapis.com/v1/places/k/photos/1/media?maxWidthPx=1200&skipHttpRedirect=true";
        server.expect(requestTo(media)).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(media)).andRespond(withServerError());

        assertThrows(IllegalArgumentException.class, () -> service.photo("https://evil.example"));
        assertThrows(NoSuchElementException.class, () -> service.photo("places/k/photos/1"));
        assertThrows(ExternalServiceException.class, () -> service.photo("places/k/photos/1"));
        server.verify();
    }

    @Test void locateReturnsTheFirstMatchOrNothing() {
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("{\"places\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andExpect(jsonPath("$.textQuery").value("Nishiki Market"))
                .andExpect(jsonPath("$.pageSize").value(1))
                .andRespond(withSuccess("{\"places\":[{\"id\":\"nishiki\",\"location\":{\"latitude\":35.0,\"longitude\":135.7}}]}",
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andRespond(withSuccess("{\"places\":[{\"id\":\"x\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEARCH)).andRespond(withServerError());

        assertEquals(Optional.of(new DiscoveryService.PlaceMatch("nishiki", 35.0, 135.7)), service.locate("Nishiki Market", "Kyoto"));
        assertTrue(service.locate("Somewhere", "Kyoto").isEmpty());
        assertTrue(service.locate("Somewhere", "Kyoto").isEmpty());
        server.verify();
    }
}
