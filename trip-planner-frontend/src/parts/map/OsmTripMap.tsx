import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { infoContent, PIN_ZOOM, WORLD_VIEW, type TripMapCanvasProps } from "./tripMapShared";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// Required by the OpenStreetMap tile usage policy.
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function numberedPin(label: string) {
    return L.divIcon({
        className: "trip-map__osm-pin",
        html: `<span>${label}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
    });
}

/** FR-22: the Map page on OpenStreetMap tiles via Leaflet. Free, no API key. */
export default function OsmTripMap({ activities, area, fitKey, selectedId, onSelect, onOpen, placing, onPlace, onReady }: TripMapCanvasProps) {
    const mapElement = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const markerLayer = useRef<L.LayerGroup | null>(null);
    const markers = useRef(new Map<number, L.Marker>());
    const framedKey = useRef(0);

    useEffect(() => {
        const element = mapElement.current;
        if (!element) return;
        const instance = L.map(element, { worldCopyJump: true })
            .setView([WORLD_VIEW.center.lat, WORLD_VIEW.center.lng], WORLD_VIEW.zoom);
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(instance);
        markerLayer.current = L.layerGroup().addTo(instance);
        map.current = instance;
        onReady();
        return () => {
            instance.remove();
            map.current = null;
            markerLayer.current = null;
            framedKey.current = 0;
        };
    }, [onReady]);

    useEffect(() => {
        const instance = map.current;
        const layer = markerLayer.current;
        if (!instance || !layer) return;

        layer.clearLayers();
        markers.current.clear();
        activities.forEach((activity, index) => {
            const marker = L.marker([activity.latitude, activity.longitude], {
                title: activity.name,
                icon: numberedPin(String(index + 1)),
            });
            marker.bindPopup(() => infoContent(activity, onOpen));
            marker.on("click", () => onSelect(activity.id));
            layer.addLayer(marker);
            markers.current.set(activity.id, marker);
        });

        // Frame the trip once per load, not after every pin edit, so the view doesn't jump.
        if (fitKey === 0 || framedKey.current === fitKey) return;
        framedKey.current = fitKey;
        if (activities.length > 1) {
            instance.fitBounds(L.latLngBounds(activities.map((activity) => [activity.latitude, activity.longitude])), { padding: [56, 56] });
        } else if (activities.length === 1) {
            instance.setView([activities[0].latitude, activities[0].longitude], PIN_ZOOM);
        } else if (area) {
            instance.fitBounds([[area.south, area.west], [area.north, area.east]]);
        } else {
            instance.setView([WORLD_VIEW.center.lat, WORLD_VIEW.center.lng], WORLD_VIEW.zoom);
        }
    }, [activities, fitKey, area, onSelect, onOpen]);

    useEffect(() => {
        const instance = map.current;
        if (!instance) return;
        const marker = selectedId == null ? undefined : markers.current.get(selectedId);
        if (!marker) {
            instance.closePopup();
            return;
        }
        marker.openPopup();
        instance.panTo(marker.getLatLng());
    }, [selectedId, activities]);

    useEffect(() => {
        const instance = map.current;
        if (!instance || !placing) return;
        const container = instance.getContainer();
        container.classList.add("is-placing");
        // wrap() keeps longitudes in -180..180 after the user pans past the date line.
        const handleClick = (event: L.LeafletMouseEvent) => {
            const point = event.latlng.wrap();
            onPlace(point.lat, point.lng);
        };
        instance.on("click", handleClick);
        return () => {
            instance.off("click", handleClick);
            container.classList.remove("is-placing");
        };
    }, [placing, onPlace]);

    return <div ref={mapElement} className="trip-map__canvas" role="region" aria-label="Map of this trip's activities" />;
}
