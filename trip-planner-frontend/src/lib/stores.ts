import { createContext, useContext } from "react";
import type { UserProfile } from "../api/userApi";
import type { TripMemberResponse, TripResponse, TripSummaryResponse, UpdateHistoryResponse } from "../api/tripApi";
import type { ActivityResponse } from "../api/activityApi";
import type { ServiceStatus } from "../api/serviceApi";
import type { AccentColor } from "./theme";

/* ---------- Signed-in user ---------- */
export interface Session {
  user: UserProfile | null;
  loading: boolean;
  /** `theme`: a theme picked on the sign-in page, which then becomes the account's theme. */
  signIn(email: string, password: string, theme?: AccentColor): Promise<void>;
  register(username: string, email: string, password: string, theme?: AccentColor): Promise<void>;
  signOut(): void;
  setUser(u: UserProfile): void;
  setTheme(k: AccentColor, x?: number, y?: number): Promise<void>;
}
export const SessionContext = createContext<Session | null>(null);
export function useSession() { const s = useContext(SessionContext); if (!s) throw new Error("useSession outside provider"); return s; }
export function useMe() { const u = useSession().user; if (!u) throw new Error("not signed in"); return u; }

/* ---------- Things every signed-in page needs ---------- */
export interface AppData {
  trips: TripResponse[];
  summaries: Record<number, TripSummaryResponse>;
  invitations: TripMemberResponse[];
  /** The last invitations fetch failed (the list may be out of date). */
  invitationsFailed: boolean;
  services: ServiceStatus;
  loaded: boolean;
  refreshTrips(): Promise<TripResponse[]>;
  refreshInvitations(): Promise<void>;
  /** Fetch the service switches again (an admin may have changed the map or turned a service off). */
  refreshServices(): Promise<void>;
  /** Fetch trips, invitations and services again unless that just happened (on focus and page changes). */
  revalidate(): void;
  /** Replace one trip in the list after an edit. */
  putTrip(t: TripResponse): void;
  /** The trip visited last in this sign-in; the Trip pages fall back to the nearest trip. */
  lastTripId: number | null;
  setLastTripId(id: number): void;
}
export const AppContext = createContext<AppData | null>(null);
export function useApp() { const a = useContext(AppContext); if (!a) throw new Error("useApp outside provider"); return a; }

/* ---------- The trip being looked at ---------- */
export interface TripStore {
  trip: TripResponse;
  members: TripMemberResponse[];
  activities: ActivityResponse[];
  /** Null when the change feed couldn't be loaded (the rest of the trip still works). */
  updates: UpdateHistoryResponse[] | null;
  /** Joined members as {id, name}, for avatars. */
  people: { id: number; name: string }[];
  name(userId: number): string;
  reload(): Promise<void>;
  /** Fetch the trip again unless that just happened (on focus and page changes). */
  revalidate(): void;
  reloadMembers(): Promise<void>;
  setTrip(t: TripResponse): void;
  /** Insert or replace activities returned by the server, then refresh the update feed. */
  putActivities(list: ActivityResponse[]): void;
  dropActivity(id: number): void;
  /** Fetch every activity again (scheduling can move alternatives and members on other plans too). */
  refreshActivities(): Promise<void>;
  setMembers(m: TripMemberResponse[]): void;
}
export const TripContext = createContext<TripStore | null>(null);
export function useTrip() { const t = useContext(TripContext); if (!t) throw new Error("useTrip outside a trip page"); return t; }
export function useMaybeTrip() { return useContext(TripContext); }
