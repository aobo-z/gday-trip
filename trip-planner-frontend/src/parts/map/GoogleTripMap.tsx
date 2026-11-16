import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, MAP_ID, onMapsAuthFailure } from "../../lib/googleMaps";
import { infoParts, PIN_BACKGROUND, PIN_BORDER, PIN_ZOOM, WORLD_VIEW, type TripMapCanvasProps } from "./tripMapShared";

export default function GoogleTripMap({ activities, area, fitKey, selectedId, onSelect, onOpen, placing, onPlace, onReady, onError }: TripMapCanvasProps) {
    const [mapReady, setMapReady] = useState(false);
    const mapElement = useRef<HTMLDivElement>(null);
    const map = useRef<google.maps.Map | null>(null);
    const markerLibrary = useRef<google.maps.MarkerLibrary | null>(null);
    const infoWindow = useRef<google.maps.InfoWindow | null>(null);
    const markers = useRef(new Map<number, google.maps.marker.AdvancedMarkerElement>());
    const mapStarted = useRef(false);
    const framedKey = useRef(0);

    // One map per page visit: every new google.maps.Map counts as a billable map load.
    useEffect(() => {
        const element = mapElement.current;
        if (mapStarted.current || !element) return;
        mapStarted.current = true;
        onMapsAuthFailure(() => onError("Google Maps rejected the API key. Check the key's website restrictions in Google Cloud."));
        loadGoogleMaps()
            .then(async () => {
                const { Map, InfoWindow } = await google.maps.importLibrary("maps");
                markerLibrary.current = await google.maps.importLibrary("marker");
                map.current = new Map(element, {
                    mapId: MAP_ID,
                    ...WORLD_VIEW,
                    clickableIcons: false,
                    streetViewControl: false,
                    mapTypeControl: false,
                });
                infoWindow.current = new InfoWindow({ maxWidth: 260 });
                infoWindow.current.addListener("closeclick", () => onSelect(-1));
                setMapReady(true);
                onReady();
            })
            .catch(() => {
                mapStarted.current = false;
                onError("Google Maps couldn't load. Check your connection and refresh the page.");
            });
    }, [onReady, onError, onSelect]);

    useEffect(() => {
        const currentMap = map.current;
        const library = markerLibrary.current;
        if (!mapReady || !currentMap || !library) return;

        markers.current.forEach((marker) => { marker.map = null; });
        markers.current.clear();
        activities.forEach((activity, index) => {
            const pin = new library.PinElement({
                glyphText: String(index + 1),
                glyphColor: "#ffffff",
                background: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || PIN_BACKGROUND,
                borderColor: PIN_BORDER,
            });
            const marker = new library.AdvancedMarkerElement({
                map: currentMap,
                position: { lat: activity.latitude, lng: activity.longitude },
                title: activity.name,
                content: pin,
                gmpClickable: true,
            });
            marker.addEventListener("gmp-click", () => onSelect(activity.id));
            markers.current.set(activity.id, marker);
        });

        // Frame the trip once per load, not after every pin edit, so the view doesn't jump.
        if (fitKey === 0 || framedKey.current === fitKey) return;
        framedKey.current = fitKey;
        if (activities.length > 1) {
            const bounds = new google.maps.LatLngBounds();
            activities.forEach((activity) => bounds.extend({ lat: activity.latitude, lng: activity.longitude }));
            currentMap.fitBounds(bounds, 56);
        } else if (activities.length === 1) {
            currentMap.setCenter({ lat: activities[0].latitude, lng: activities[0].longitude });
            currentMap.setZoom(PIN_ZOOM);
        } else if (area) {
            currentMap.fitBounds(area);
        } else {
            currentMap.setCenter(WORLD_VIEW.center);
            currentMap.setZoom(WORLD_VIEW.zoom);
        }
    }, [mapReady, activities, fitKey, area, onSelect]);

    useEffect(() => {
        const currentMap = map.current;
        const popup = infoWindow.current;
        const activity = activities.find((item) => item.id === selectedId);
        const marker = selectedId == null ? undefined : markers.current.get(selectedId);
        if (!currentMap || !popup) return;
        if (!activity || !marker) {
            popup.close();
            return;
        }
        const { title, body } = infoParts(activity, onOpen);
        popup.setHeaderContent(title);
        popup.setContent(body);
        popup.open({ map: currentMap, anchor: marker });
        currentMap.panTo({ lat: activity.latitude, lng: activity.longitude });
    }, [selectedId, activities, mapReady, onOpen]);

    useEffect(() => {
        const currentMap = map.current;
        if (!currentMap || !placing) return;
        currentMap.setOptions({ draggableCursor: "crosshair" });
        const listener = currentMap.addListener("click", (event: google.maps.MapMouseEvent) => {
            if (event.latLng) onPlace(event.latLng.lat(), event.latLng.lng());
        });
        return () => {
            listener.remove();
            currentMap.setOptions({ draggableCursor: null });
        };
    }, [placing, onPlace, mapReady]);

    return <div ref={mapElement} className="trip-map__canvas" role="region" aria-label="Map of this trip's activities" />;
}
