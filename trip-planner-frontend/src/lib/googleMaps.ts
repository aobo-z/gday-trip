const MAPS_KEY: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_KEY;
export const MAP_ID: string | undefined = import.meta.env.VITE_GOOGLE_MAP_ID;
export const mapsConfigured = Boolean(MAPS_KEY && MAP_ID);

const READY_CALLBACK = "__gdayTripMapsReady";
let loading: Promise<void> | null = null;

/**
 * Loads the Maps JavaScript API script once per page. Billing is per map created,
 * not per script load, so callers should also reuse their google.maps.Map instance.
 */
export function loadGoogleMaps(): Promise<void> {
  if (typeof google !== "undefined" && typeof google.maps?.importLibrary === "function") return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const callbacks = window as unknown as Record<string, () => void>;
    callbacks[READY_CALLBACK] = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY ?? "")}`
      + `&v=weekly&loading=async&callback=${READY_CALLBACK}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Google calls this global when the key is invalid or the referrer isn't allowed. */
export function onMapsAuthFailure(handler: () => void) {
  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = handler;
}
