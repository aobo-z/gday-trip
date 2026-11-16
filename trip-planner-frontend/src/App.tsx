import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useMatch } from "react-router-dom";
import SessionProvider from "./lib/SessionProvider";
import { AppProvider, TripProvider } from "./lib/DataProviders";
import { useApp, useSession } from "./lib/stores";
import { nearestTrip } from "./lib/domain";
import OverlayProvider, { ToastProvider } from "./ui/Overlay";
import Shell, { ShellLoading, ShellMessage } from "./parts/Shell";
import Auth from "./pages/Auth";
import Join from "./pages/Join";
import { PageLoading } from "./parts/Shell";

/* Each page is its own chunk, fetched the first time it's opened, so the first screen loads only what it shows. */
const Overview = lazy(() => import("./pages/Overview"));
const Vote = lazy(() => import("./pages/Vote"));
const Schedule = lazy(() => import("./pages/Schedule"));
const TripMap = lazy(() => import("./pages/TripMap"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Trips = lazy(() => import("./pages/Trips"));
const AiPlanner = lazy(() => import("./pages/AiPlanner"));
const Community = lazy(() => import("./pages/Community"));
const Reviews = lazy(() => import("./pages/Reviews"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));

/** Signed-out visitors go to the sign-in page and come back here afterwards. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="boot" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <ToastProvider><AppProvider>{children}</AppProvider></ToastProvider>;
}
/* After signing in everyone lands on their nearest trip ("/"); only an invite link is resumed.
   Other pages remembered from before sign-in may belong to the previous account. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const back = (useLocation().state as { from?: string } | null)?.from;
  const from = back?.startsWith("/join/") ? back : "/";
  if (loading) return null;
  if (user) return <Navigate to={from} replace />;
  return <>{children}</>;
}

/** Every signed-in page shows one trip in the shell: the one in the address, else the last one opened, else the nearest. */
function Layout() {
  const { trips, loaded, lastTripId } = useApp();
  const match = useMatch("/trip/:tripId/*");
  if (!loaded) return <ShellLoading />;
  const routeId = match?.params.tripId ? Number(match.params.tripId) : null;
  const tripId = routeId ?? (trips.some((t) => t.tripId === lastTripId) ? lastTripId : nearestTrip(trips)?.tripId ?? null);
  if (tripId == null) return <OverlayProvider><Shell><Suspense fallback={<PageLoading />}><Outlet /></Suspense></Shell></OverlayProvider>;
  return <TripProvider key={tripId} tripId={tripId} loading={<ShellLoading />} failed={(msg, retry) => <OverlayProvider><Shell><ShellMessage msg={msg} onRetry={retry} /></Shell></OverlayProvider>}>
    <OverlayProvider><Shell><Suspense fallback={<PageLoading />}><Outlet /></Suspense></Shell></OverlayProvider>
  </TripProvider>;
}
function Home() {
  const id = nearestTrip(useApp().trips)?.tripId;
  return <Navigate to={id ? `/trip/${id}/overview` : "/trips"} replace />;
}
/** Trip pages need the trip from the address; without one, fall back to the trip list. */
function TripPage({ children }: { children: ReactNode }) {
  const { trips } = useApp();
  return trips.length ? <>{children}</> : <Navigate to="/trips" replace />;
}

export default function App() {
  return <SessionProvider><BrowserRouter><Routes>
    <Route path="/login" element={<GuestOnly><Auth mode="signin" /></GuestOnly>} />
    <Route path="/register" element={<GuestOnly><Auth mode="register" /></GuestOnly>} />
    <Route path="/join/:code" element={<RequireAuth><OverlayProvider><Join /></OverlayProvider></RequireAuth>} />
    <Route element={<RequireAuth><Layout /></RequireAuth>}>
      <Route index element={<Home />} />
      <Route path="trip/:tripId/overview" element={<TripPage><Overview /></TripPage>} />
      <Route path="trip/:tripId/vote" element={<TripPage><Vote /></TripPage>} />
      <Route path="trip/:tripId/schedule" element={<TripPage><Schedule /></TripPage>} />
      <Route path="trip/:tripId/map" element={<TripPage><TripMap /></TripPage>} />
      <Route path="trip/:tripId/expenses" element={<TripPage><Expenses /></TripPage>} />
      <Route path="trip/:tripId" element={<Navigate to="overview" replace />} />
      <Route path="trips" element={<Trips />} />
      <Route path="ai" element={<AiPlanner />} />
      <Route path="community" element={<Community />} />
      <Route path="reviews" element={<Reviews />} />
      <Route path="profile" element={<Profile />} />
      <Route path="settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></BrowserRouter></SessionProvider>;
}
