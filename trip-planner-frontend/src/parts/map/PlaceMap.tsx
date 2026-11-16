import { useApp } from "../../lib/stores";

// Maps Embed API key, the same one the earlier Discover page used. Embed keys are meant to sit in page
// source; Google limits this one to the app's own sites.
const MAPS_EMBED_KEY = "AIzaSyDj9AfdjTNvCvYz3SJmGQZQeVQrtj8aRa0";

function osmEmbedUrl(lat: number, lng: number) {
  const bbox = [lng - 0.01, lat - 0.006, lng + 0.01, lat + 0.006].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

/** One place on an embedded Google map (OpenStreetMap when an admin chose it, nothing when maps are off). */
export default function PlaceMap({ placeId, lat, lng, name, height = 220 }: { placeId: string; lat: number; lng: number; name: string; height?: number }) {
  const { services } = useApp();
  if (services.mapProvider === "OFF") return null;
  const src = services.mapProvider === "OSM" ? osmEmbedUrl(lat, lng)
    : `https://www.google.com/maps/embed/v1/place?key=${MAPS_EMBED_KEY}&q=place_id:${encodeURIComponent(placeId)}`;
  return <iframe className="place-map" title={"Map of " + name} src={src} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" style={{ height, border: 0 }} />;
}
