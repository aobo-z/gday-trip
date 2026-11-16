import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchKeyTripUpdates, fetchMyInvitations, fetchTripById, fetchTripMembers, fetchTripSummaries, fetchUserTrips,
  type TripMemberResponse, type TripResponse, type TripSummaryResponse, type UpdateHistoryResponse } from "../api/tripApi";
import { fetchActivities, type ActivityResponse } from "../api/activityApi";
import { fetchServiceStatus, type ServiceStatus } from "../api/serviceApi";
import { apiErrorMessage } from "../api/apiError";
import { AppContext, TripContext, type AppData, type TripStore } from "./stores";

/* Data is fetched again when the tab regains focus and when the user moves to another page, so changes made
   elsewhere (another member, an admin, another page of the app) show without a manual refresh. A short gap
   stops focus and navigation from fetching twice in a row. */
const STALE_MS = 2000;
function useRevalidate(run: () => void) {
  const last = useRef(0), job = useRef(run);
  useEffect(() => { job.current = run; });
  const revalidate = useCallback(() => { const now = Date.now(); if (now - last.current < STALE_MS) return; last.current = now; job.current(); }, []);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") revalidate(); };
    window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [revalidate]);
  return { revalidate, mark: () => { last.current = Date.now(); } };
}

const SERVICES_ON: ServiceStatus = { placeSearch: true, placePhotos: true, aiRecommendations: true, mapProvider: "OSM" };

export function AppProvider({ children }: { children: ReactNode }) {
  const [trips, setTrips] = useState<TripResponse[]>([]);
  const [summaries, setSummaries] = useState<Record<number, TripSummaryResponse>>({});
  const [invitations, setInvitations] = useState<TripMemberResponse[]>([]);
  const [services, setServices] = useState<ServiceStatus>(SERVICES_ON);
  const [loaded, setLoaded] = useState(false);
  /* Kept in memory only: a new sign-in (possibly another account) starts from the nearest trip again. */
  const [lastTripId, setLastTripId] = useState<number | null>(null);

  const refreshTrips = useCallback(async () => {
    const [list, sums] = await Promise.all([fetchUserTrips(), fetchTripSummaries().catch(() => [] as TripSummaryResponse[])]);
    setTrips(list);
    setSummaries(Object.fromEntries(sums.map((s) => [s.tripId, s])));
    return list;
  }, []);
  /* A failed fetch keeps the last list and says so, instead of looking like "no invitations". */
  const [invitationsFailed, setInvitationsFailed] = useState(false);
  const refreshInvitations = useCallback(async () => {
    try { setInvitations(await fetchMyInvitations()); setInvitationsFailed(false); } catch { setInvitationsFailed(true); }
  }, []);
  const refreshServices = useCallback(async () => { await fetchServiceStatus().then(setServices).catch(() => undefined); }, []);
  const { revalidate, mark } = useRevalidate(() => { refreshTrips().catch(() => undefined); refreshInvitations(); refreshServices(); });

  useEffect(() => {
    mark();
    // Fetching on mount is what this effect is for; the setters run after each request resolves.
    // eslint-disable-next-line react/set-state-in-effect
    Promise.all([refreshTrips(), refreshInvitations(), refreshServices()])
      .catch(() => undefined).finally(() => setLoaded(true));
  }, [refreshTrips, refreshInvitations, refreshServices]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<AppData>(() => ({
    trips, summaries, invitations, invitationsFailed, services, loaded, refreshTrips, refreshInvitations, refreshServices, revalidate, lastTripId,
    putTrip: (t) => setTrips((list) => list.some((x) => x.tripId === t.tripId) ? list.map((x) => x.tripId === t.tripId ? t : x) : [...list, t]),
    setLastTripId,
  }), [trips, summaries, invitations, invitationsFailed, services, loaded, refreshTrips, refreshInvitations, refreshServices, revalidate, lastTripId]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

interface TripState { trip: TripResponse; members: TripMemberResponse[]; activities: ActivityResponse[]; updates: UpdateHistoryResponse[] | null }

/** Loads one trip (details, members, ideas and plans, recent changes) and shares it with the trip pages. */
export function TripProvider({ tripId, children, loading, failed }: { tripId: number; children: ReactNode; loading: ReactNode; failed: (msg: string, retry: () => void) => ReactNode }) {
  const [state, setState] = useState<TripState | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [trip, members, activities, updates] = await Promise.all([
      fetchTripById(tripId), fetchTripMembers(tripId), fetchActivities(tripId), fetchKeyTripUpdates(tripId).catch(() => null),
    ]);
    setState({ trip, members, activities, updates });
    setError(""); /* a later successful fetch (Retry, focus, page change) replaces an earlier failure */
  }, [tripId]);

  /* App keys this provider by trip, so another trip starts from a fresh, empty state. */
  useEffect(() => {
    let live = true;
    // Fetching the trip is what this effect is for; state is set when the requests resolve.
    // eslint-disable-next-line react/set-state-in-effect
    load().catch((e) => { if (live) setError(apiErrorMessage(e, "Could not open this trip.")); });
    return () => { live = false; };
  }, [tripId, load]);

  const { revalidate, mark } = useRevalidate(() => { load().catch(() => undefined); });
  useEffect(mark, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshUpdates = useCallback(() => {
    fetchKeyTripUpdates(tripId).then((updates) => setState((s) => s && s.trip.tripId === tripId ? { ...s, updates } : s)).catch(() => undefined);
  }, [tripId]);

  const store = useMemo<TripStore | null>(() => {
    if (!state || state.trip.tripId !== tripId) return null;
    const joined = state.members.filter((m) => m.inviteStatus === "JOINED");
    const names = new Map(state.members.map((m) => [m.userId, m.username]));
    return {
      ...state,
      people: joined.map((m) => ({ id: m.userId, name: m.username })),
      name: (id) => names.get(id) ?? "Former member",
      reload: load,
      revalidate,
      reloadMembers: async () => { const members = await fetchTripMembers(tripId); setState((s) => s && { ...s, members }); },
      setTrip: (trip) => setState((s) => s && { ...s, trip }),
      putActivities: (list) => {
        setState((s) => {
          if (!s) return s;
          const byId = new Map(s.activities.map((a) => [a.id, a]));
          list.forEach((a) => byId.set(a.id, a));
          return { ...s, activities: [...byId.values()] };
        });
        refreshUpdates();
      },
      dropActivity: (id) => { setState((s) => s && { ...s, activities: s.activities.filter((a) => a.id !== id) }); refreshUpdates(); },
      setMembers: (members) => setState((s) => s && { ...s, members }),
      refreshActivities: async () => { const activities = await fetchActivities(tripId); setState((s) => s && s.trip.tripId === tripId ? { ...s, activities } : s); refreshUpdates(); },
    };
  }, [state, tripId, load, refreshUpdates, revalidate]);

  if (error) return <>{failed(error, () => { setError(""); load().catch((e) => setError(apiErrorMessage(e, "Could not open this trip."))); })}</>;
  if (!store) return <>{loading}</>;
  return <TripContext.Provider value={store}>{children}</TripContext.Provider>;
}
