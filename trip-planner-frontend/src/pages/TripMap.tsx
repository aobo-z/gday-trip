import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { updateActivityLocation, type ActivityResponse } from "../api/activityApi";
import { fetchDestinationBounds, type MapBounds } from "../api/discoverApi";
import { apiErrorMessage } from "../api/apiError";
import { useApp, useTrip } from "../lib/stores";
import { mapsConfigured } from "../lib/googleMaps";
import { useOverlay } from "../ui/overlayContext";
import { Chip, Empty, Icon, Seg } from "../ui/kit";
import { catIcon, catKey, editable, ideaKind, isScheduled } from "../lib/domain";
import { daysBetween, fd, fwd, hm, pd } from "../lib/format";
import { isLocated, type LocatedActivity } from "../parts/map/tripMapShared";
import { usePeek } from "../parts/usePeek";

const GoogleTripMap = lazy(() => import("../parts/map/GoogleTripMap"));
const OsmTripMap = lazy(() => import("../parts/map/OsmTripMap"));

/** Scheduled stops numbered in order (one day or the whole trip), unscheduled ideas, and the places still without a pin. */
export default function TripMap() {
  const store = useTrip(), { services } = useApp(), o = useOverlay(), peek = usePeek();
  const { trip: t, activities } = store;
  const [day, setDay] = useState("all"), [sel, setSel] = useState<number | null>(null), [placing, setPlacing] = useState<number | null>(null);
  const [area, setArea] = useState<MapBounds | null>(null), [fitKey, setFitKey] = useState(0), [mapErr, setMapErr] = useState("");
  const provider = services.mapProvider === "GOOGLE" && !mapsConfigured ? "OSM" : services.mapProvider;
  useEffect(() => { fetchDestinationBounds(t.tripId).then(setArea).catch(() => setArea(null)); }, [t.tripId]);
  const places = activities;
  const stops = useMemo(() => places.filter((a) => isScheduled(a) && isLocated(a) && (day === "all" || a.date === day))
    .sort((x, y) => (x.date! + x.startTime) < (y.date! + y.startTime) ? -1 : 1) as LocatedActivity[], [places, day]);
  const ideas = useMemo(() => day === "all" ? places.filter((a) => !isScheduled(a) && isLocated(a) && ideaKind(a) !== "rejected") as LocatedActivity[] : [], [places, day]);
  const noPin = places.filter((a) => !isLocated(a));
  const shown = useMemo(() => [...stops, ...ideas], [stops, ideas]);
  const onReady = useCallback(() => setFitKey((k) => k + 1), []);
  const onOpen = useCallback((id: number) => peek.idea(id), [peek]);
  const onPlace = useCallback(async (lat: number, lng: number) => {
    const id = placing; if (id == null) return;
    setPlacing(null);
    try { const a = await updateActivityLocation(id, lat, lng); store.putActivities([a]); setSel(a.id); o.toast(a.name + " pinned"); }
    catch (e) { o.toast(apiErrorMessage(e, "Pin not saved")); }
  }, [placing, store, o]);
  const canPin = (a: ActivityResponse) => editable(t) && a.canModify;

  const Canvas = provider === "GOOGLE" ? GoogleTripMap : OsmTripMap;
  return <>
    <div className="sec-head"><h1>Map</h1>
      <Seg name="mapDay" value={day} onChange={(v) => { setDay(v); setSel(null); setFitKey((k) => k + 1); }} options={[["all", "All"], ...daysBetween(t.startDate, t.endDate).map((d) => [d, `${fwd(d)} ${pd(d).getDate()}`] as [string, string])]} /></div>
    {provider === "OFF" ? <section className="card"><Empty icon="map" text="Maps are off" /></section> :
      <div className="map-wrap">
        <section className={"map trip-map" + (placing ? " placing" : "")} aria-label="Trip map">
          <Suspense fallback={<div className="empty" style={{ height: "100%" }}><Icon n="loader" className="spin" /></div>}>
            <Canvas activities={shown} area={area} fitKey={fitKey} selectedId={sel} onSelect={setSel} onOpen={onOpen} placing={placing != null} onPlace={onPlace} onReady={onReady} onError={setMapErr} />
          </Suspense>
          <span className="chip c-plain map-badge"><Icon n="map" s={13} />{provider === "GOOGLE" ? "Google" : "OpenStreetMap"}</span>
          {placing != null && <span className="chip c-blue map-placing"><Icon n="target" s={14} />Tap the map · {activities.find((a) => a.id === placing)?.name}
            <button type="button" className="icon-btn sm" style={{ width: 24, height: 24 }} aria-label="Cancel" onClick={() => setPlacing(null)}><Icon n="x" s={13} /></button></span>}
          {mapErr && <span className="chip c-warn map-placing">{mapErr}</span>}
        </section>
        <div className="col">
          {/* Every pinned place in one list: scheduled stops numbered in order, unscheduled activities after them. */}
          <section className="card pad"><h3>{day === "all" ? "Places" : `${fwd(day)} ${fd(day)}`}<span className="n num">{shown.length}</span></h3><div style={{ marginTop: 6 }}>
            {shown.length ? shown.map((a) => { const n = stops.indexOf(a as LocatedActivity); return <div key={a.id} className={"list-row map-row" + (sel === a.id ? " on" : "")} role="button" tabIndex={0} onClick={() => setSel(sel === a.id ? null : a.id)} onKeyDown={(e) => { if (e.key === "Enter") setSel(sel === a.id ? null : a.id); }}>
              {n >= 0 ? <span className="avatar map-num" style={{ background: a.branch ? "var(--violet)" : "var(--primary)" }}>{n + 1}</span>
                : <span className={"map-num cat-" + catKey(a.category)}><Icon n={catIcon(a.category)} s={14} /></span>}
              <span style={{ flex: 1, minWidth: 0 }}><span className="map-name">{a.name}</span><small className="hint num" style={{ display: "block" }}>{n >= 0 ? `${day === "all" ? fwd(a.date!) + " " + fd(a.date!) + " · " : ""}${hm(a.startTime)}` : "Not scheduled"}</small></span></div>; })
              : <Empty icon="map" text={day === "all" ? "No places on the map yet" : "Nothing on the map this day"} />}
          </div></section>
          {noPin.length > 0 && <section className="card pad"><h3>No pin<span className="n num">{noPin.length}</span></h3><div style={{ marginTop: 6 }}>
            {noPin.map((a) => <div key={a.id} className="list-row"><span className={"cat-dot dot-" + catKey(a.category)} /><span style={{ flex: 1, fontWeight: 600 }}>{a.name}</span>
              {canPin(a) ? <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPlacing(a.id); setSel(null); }}><Icon n="target" s={15} />Place</button> : <Chip text="No pin" />}</div>)}
          </div></section>}
        </div>
      </div>}
  </>;
}
