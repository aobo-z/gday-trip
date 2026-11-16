import type { ActivityResponse } from "../../api/activityApi";
import type { MapBounds } from "../../api/discoverApi";
import { loadImage } from "../../lib/images";

// Pins are drawn by the map library outside our stylesheet, so the theme accent is repeated here.
export const PIN_BACKGROUND = "#2F6BEA";
export const PIN_BORDER = "#FFFFFF";
export const WORLD_VIEW = { center: { lat: 20, lng: 0 }, zoom: 2 };
export const PIN_ZOOM = 14;

export type LocatedActivity = ActivityResponse & { latitude: number; longitude: number };

export function isLocated(activity: ActivityResponse): activity is LocatedActivity {
    return activity.latitude != null && activity.longitude != null;
}

/** What the Map page hands to whichever provider an admin has chosen. */
export interface TripMapCanvasProps {
    /** Numbered in this order. */
    activities: LocatedActivity[];
    area: MapBounds | null;
    /** The map frames the trip whenever this changes; 0 means nothing is loaded yet. */
    fitKey: number;
    selectedId: number | null;
    onSelect: (activityId: number) => void;
    /** "Open" in a pin's popup: the activity's details, as on the Vote page. */
    onOpen: (activityId: number) => void;
    placing: boolean;
    onPlace: (latitude: number, longitude: number) => void;
    onReady: () => void;
    onError: (message: string) => void;
}

function scheduleLabel(activity: ActivityResponse) {
    if (!activity.date) return null;
    return activity.startTime && activity.endTime
        ? `${activity.date} · ${activity.startTime.slice(0, 5)}–${activity.endTime.slice(0, 5)}`
        : activity.date;
}

// Built with textContent so activity names can't inject markup into the map.
/** A pin's popup in two parts: the title (Google puts it in the window's header beside ×) and the body. */
export function infoParts(activity: ActivityResponse, onOpen?: (activityId: number) => void) {
    const title = document.createElement("strong");
    title.className = "trip-map__info-title";
    title.textContent = activity.name;
    const root = document.createElement("div");
    root.className = "trip-map__info";
    const photo = activity.imageUrls[0];
    if (photo) {
        // Uploaded photos need the sign-in token, so the image fills in once it has loaded.
        const img = document.createElement("img");
        img.alt = "";
        img.hidden = true;
        loadImage(photo).then((url) => { img.src = url; img.hidden = false; }).catch(() => img.remove());
        root.append(img);
    }
    const place = document.createElement("p");
    place.textContent = activity.location;
    root.append(place);
    const when = scheduleLabel(activity);
    if (when) {
        const time = document.createElement("p");
        time.className = "trip-map__info-when";
        time.textContent = when;
        root.append(time);
    }
    if (onOpen) {
        const open = document.createElement("button");
        open.type = "button";
        open.className = "trip-map__open";
        open.textContent = "Open";
        open.addEventListener("click", () => onOpen(activity.id));
        root.append(open);
    }
    return { title, body: root };
}

/** Title and body together, for maps whose popups have no header (Leaflet). */
export function infoContent(activity: ActivityResponse, onOpen?: (activityId: number) => void) {
    const { title, body } = infoParts(activity, onOpen);
    body.prepend(title);
    return body;
}
