import axiosClient from "./axiosClient";

// matches our backend PlaceResult DTO
export interface PlaceResult {
    placeId: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    primaryType: string | null;
}

export interface PlaceSearchRequest {
    query: string;
}

export interface PlaceRecommendationRequest {
    name: string;
    address: string;
    primaryType: string | null;
}

export interface PlaceRecommendationResponse {
    reason: string;
}

/**
 * FR-11: Search for places to add to a trip.
 * Calls: POST /api/trips/{tripId}/discover/search
 */
export async function searchPlaces(tripId: number | string, query: string): Promise<PlaceResult[]> {
    const res = await axiosClient.post<PlaceResult[]>(`/trips/${tripId}/discover/search`, { query });
    return res.data;
}

/**
 * FR-11/FR-12: Ask AI why a discovered place is worth visiting on this trip.
 * Calls: POST /api/trips/{tripId}/discover/recommend
 */
export async function getPlaceRecommendation(
    tripId: number | string,
    place: PlaceRecommendationRequest
): Promise<PlaceRecommendationResponse> {
    const res = await axiosClient.post<PlaceRecommendationResponse>(`/trips/${tripId}/discover/recommend`, place);
    return res.data;
}

// south/west/north/east in degrees, matching the backend's MapBounds record.
export interface MapBounds {
    south: number;
    west: number;
    north: number;
    east: number;
}

/**
 * The trip destination's area for the map's initial view, or null if it isn't a recognisable place.
 * Calls: GET /api/trips/{tripId}/discover/area
 */
export async function fetchDestinationBounds(tripId: number | string): Promise<MapBounds | null> {
    const res = await axiosClient.get<MapBounds>(`/trips/${tripId}/discover/area`);
    return res.status === 204 ? null : res.data;
}

/**
 * FR-11: The place's first Google photo, or null when it has none.
 * Calls: GET /api/trips/{tripId}/discover/places/{placeId}/photo
 */
export async function fetchPlacePhoto(tripId: number | string, placeId: string): Promise<Blob | null> {
    const res = await axiosClient.get<Blob>(`/trips/${tripId}/discover/places/${encodeURIComponent(placeId)}/photo`, { responseType: "blob" });
    return res.status === 204 ? null : res.data;
}
