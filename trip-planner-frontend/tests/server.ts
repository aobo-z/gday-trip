/* An in-memory stand-in for the Spring Boot API. Page tests seed `server.db`, render the app and assert on
   what the user sees; reads come from the db and the common writes update it, so a page that refetches after
   an action shows the result just like against the real backend. Unknown requests answer 404 and are kept in
   `server.unhandled`, so a page calling an endpoint the fake doesn't know shows up in the test. */
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { AxiosError } from "axios";
import type { ActivityComment, ActivityPreferencesResponse, ActivityResponse } from "../src/api/activityApi";
import type { TripMemberResponse, TripResponse, UpdateHistoryResponse } from "../src/api/tripApi";
import type { Expense } from "../src/api/expenseApi";
import type { CommunityComment, CommunityTrip } from "../src/api/communityApi";
import type { ReviewResponse, ReviewableMember } from "../src/api/reviewApi";
import type { PlaceResult } from "../src/api/discoverApi";
import type { ServiceSettings } from "../src/api/serviceApi";
import type { AdminUser } from "../src/api/adminApi";
import type { Announcement } from "../src/api/announcementApi";
import type { TripFile } from "../src/api/tripFileApi";
import type { UserProfile } from "../src/api/userApi";
import { ME } from "./fixtures";

export interface Db {
  me: UserProfile;
  trips: TripResponse[];
  members: Record<number, TripMemberResponse[]>;
  activities: Record<number, ActivityResponse[]>;
  updates: Record<number, UpdateHistoryResponse[]>;
  expenses: Record<number, Expense[]>;
  invitations: TripMemberResponse[];
  services: ServiceSettings;
  community: CommunityTrip[];
  communityComments: Record<number, CommunityComment[]>;
  reviewsAbout: Record<number, ReviewResponse[]>;
  written: ReviewResponse[];
  reviewable: Record<number, ReviewableMember[]>;
  comments: Record<number, ActivityComment[]>;
  prefs: Record<number, ActivityPreferencesResponse>;
  places: PlaceResult[];
  adminUsers: AdminUser[];
  announcements: Record<number, Announcement[]>;
  files: Record<number, TripFile[]>;
}

function emptyDb(): Db {
  return { me: { ...ME }, trips: [], members: {}, activities: {}, updates: {}, expenses: {}, invitations: [],
    services: { placeSearch: true, placePhotos: true, aiRecommendations: true, mapProvider: "OSM", aiModel: "gemini-flash", defaultAiModel: "gemini-flash" },
    community: [], communityComments: {}, reviewsAbout: {}, written: [], reviewable: {}, comments: {}, prefs: {}, places: [], adminUsers: [], announcements: {}, files: {} };
}

export interface Req { method: string; path: string; params: Record<string, string>; query: Record<string, unknown>; body: any } // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (req: Req) => unknown;
class Reply { constructor(public status: number, public data: unknown) {} }
/** Answer with a status other than 200, e.g. `reply(400, { message: "…" })`. */
export const reply = (status: number, data: unknown = null) => new Reply(status, data);

interface Route { method: string; re: RegExp; keys: string[]; fn: Handler }
function compile(method: string, pattern: string, fn: Handler): Route {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  return { method: method.toUpperCase(), re, keys, fn };
}

const tripOf = (db: Db, id: number) => db.trips.find((t) => t.tripId === id);
const allActs = (db: Db) => Object.values(db.activities).flat();
const findAct = (db: Db, id: number) => allActs(db).find((a) => a.id === id);
function putAct(db: Db, a: ActivityResponse) {
  const list = db.activities[a.tripId] ?? (db.activities[a.tripId] = []);
  const i = list.findIndex((x) => x.id === a.id);
  if (i >= 0) list[i] = a; else list.push(a);
  return a;
}
let ids = 5000;
/** A new proposal as the backend creates it: pending, by the signed-in user, nobody has voted. */
function proposal(db: Db, tripId: number, fields: Partial<ActivityResponse>): ActivityResponse {
  return { id: ++ids, tripId, createdById: db.me.userId, createdByUsername: db.me.username, name: "", location: "", category: "Sights", description: null, tags: [], imageUrls: [],
    date: null, startTime: null, endTime: null, latitude: null, longitude: null, branch: false, memberIds: [],
    createdAt: "2026-01-01T00:00:00", updatedAt: "2026-01-01T00:00:00", approveCount: 0, rejectCount: 0, eligibleMemberCount: 2, requiredApprovals: 1, remainingEligibleVotes: 2,
    commentCount: 0, currentUserVote: null, status: "PENDING", canModify: true, canSchedule: false, ...fields };
}

function defaults(db: Db): Route[] {
  const r = (m: string, p: string, fn: Handler) => compile(m, p, fn);
  const n = (req: Req, k = "id") => Number(req.params[k]);
  return [
    r("get", "/users/me", () => db.me),
    r("put", "/users/me/preferences", (q) => { db.me.accentColor = q.body.accentColor; return db.me; }),
    r("post", "/auth/login", () => ({ token: "test-token", ...db.me })),
    r("post", "/auth/register", (q) => ({ token: "test-token", ...db.me, username: q.body.username, email: q.body.email })),
    r("get", "/services/status", () => ({ placeSearch: db.services.placeSearch, placePhotos: db.services.placePhotos, aiRecommendations: db.services.aiRecommendations, mapProvider: db.services.mapProvider })),
    r("get", "/trips", () => db.trips),
    r("post", "/trips", (q) => { const t: TripResponse = { tripId: ++ids, status: "PLANNING", votingThreshold: 0.5, role: "OWNER", createdAt: "2026-01-01T00:00:00", coverImageId: null, canChangeBaseCurrency: true, ...q.body }; db.trips.push(t); return t; }),
    r("get", "/trips/summaries", () => db.trips.map((t) => ({ tripId: t.tripId, members: (db.members[t.tripId] ?? []).map((m) => ({ userId: m.userId, username: m.username })), plans: (db.activities[t.tripId] ?? []).length, scheduledPlans: (db.activities[t.tripId] ?? []).filter((a) => a.date).length, spent: 0 }))),
    r("get", "/trips/invitations", () => db.invitations),
    r("get", "/trips/:id", (q) => tripOf(db, n(q)) ?? reply(404, { message: "Trip not found" })),
    r("put", "/trips/:id", (q) => Object.assign(tripOf(db, n(q))!, q.body)),
    r("delete", "/trips/:id", (q) => { db.trips = db.trips.filter((t) => t.tripId !== n(q)); return null; }),
    r("put", "/trips/:id/start", (q) => Object.assign(tripOf(db, n(q))!, { status: "ONGOING" })),
    r("put", "/trips/:id/archive", (q) => Object.assign(tripOf(db, n(q))!, { status: "ARCHIVED" })),
    r("put", "/trips/:id/publish", (q) => Object.assign(tripOf(db, n(q))!, { status: "PUBLISHED" })),
    r("put", "/trips/:id/unpublish", (q) => Object.assign(tripOf(db, n(q))!, { status: "ARCHIVED" })),
    r("put", "/trips/:id/voting-threshold", (q) => Object.assign(tripOf(db, n(q))!, { votingThreshold: q.body.votingThreshold ?? q.body.threshold })),
    r("get", "/trips/:id/members", (q) => (db.members[n(q)] ?? []).filter((m) => m.inviteStatus === "JOINED")),
    r("get", "/trips/:id/members/pending", (q) => (db.members[n(q)] ?? []).filter((m) => m.inviteStatus === "PENDING")),
    r("get", "/trips/:id/members/invite-code", () => ({ inviteCode: "ABC123" })),
    r("get", "/trips/:id/activities", (q) => db.activities[n(q)] ?? []),
    /* FR-19 announcements and FR-18 files, newest first like the backend. */
    r("get", "/trips/:id/announcements", (q) => db.announcements[n(q)] ?? []),
    r("post", "/trips/:id/announcements", (q) => { const a: Announcement = { announcementId: ++ids, tripId: n(q), authorId: db.me.userId, authorName: db.me.username, publishedAt: "2026-01-01T09:00:00", updatedAt: "2026-01-01T09:00:00", edited: false, canManage: true, ...q.body };
      (db.announcements[n(q)] ??= []).unshift(a); return a; }),
    r("put", "/trips/:id/announcements/:aid", (q) => Object.assign(db.announcements[n(q)].find((a) => a.announcementId === n(q, "aid"))!, q.body, { edited: true, updatedAt: "2026-01-01T10:00:00" })),
    r("delete", "/trips/:id/announcements/:aid", (q) => { db.announcements[n(q)] = db.announcements[n(q)].filter((a) => a.announcementId !== n(q, "aid")); return null; }),
    r("get", "/trips/:id/files", (q) => (db.files[n(q)] ?? []).filter((f) => q.query.activityId == null || f.activityId === Number(q.query.activityId))),
    r("post", "/trips/:id/files", (q) => { const form = q.body as FormData, file = form.get("file") as File, act = form.get("activityId");
      const a = act ? findAct(db, Number(act)) : undefined;
      const f: TripFile = { fileId: ++ids, tripId: n(q), fileName: file.name, contentType: file.type, sizeBytes: file.size, uploadedAt: "2026-01-01T09:00:00", uploaderId: db.me.userId, uploaderName: db.me.username,
        activityId: a?.id ?? null, activityName: a?.name ?? null, canDelete: true };
      (db.files[n(q)] ??= []).unshift(f); return f; }),
    r("get", "/trips/:id/files/:fid/download", (q) => { const f = db.files[n(q)].find((x) => x.fileId === n(q, "fid"))!; return new Blob(["file"], { type: f.contentType }); }),
    r("delete", "/trips/:id/files/:fid", (q) => { db.files[n(q)] = db.files[n(q)].filter((f) => f.fileId !== n(q, "fid")); return null; }),
    r("post", "/trips/:id/activities", (q) => putAct(db, proposal(db, n(q), q.body))),
    r("get", "/trips/:id/updates/key", (q) => db.updates[n(q)] ?? []),
    r("get", "/trips/:id/updates", (q) => db.updates[n(q)] ?? []),
    r("get", "/trips/:id/discover/area", () => null),
    r("post", "/trips/:id/discover/search", () => db.places),
    r("post", "/trips/:id/discover/recommend", (q) => ({ reason: `${q.body.name} is a highlight of the trip.` })),
    r("get", "/trips/:id/discover/places/:pid/photo", () => reply(204)),
    /* A branch from an activity is that same activity, out of voting; otherwise a new place. */
    r("post", "/trips/:id/branches", (q) => { const { sourceActivityId, memberIds, ...rest } = q.body; const slot = { date: rest.date ?? null, startTime: rest.startTime ?? null, endTime: rest.endTime ?? null };
      const going = rest.date ? memberIds ?? [db.me.userId] : [];
      return putAct(db, sourceActivityId ? { ...findAct(db, sourceActivityId)!, ...slot, branch: true, status: "BRANCH", memberIds: going }
        : proposal(db, n(q), { ...rest, ...slot, branch: true, status: "BRANCH", memberIds: going })); }),
    r("get", "/trips/:id/expenses", (q) => db.expenses[n(q)] ?? []),
    r("get", "/trips/:id/expenses/summary", (q) => { const t = tripOf(db, n(q))!; const spent = (db.expenses[n(q)] ?? []).reduce((s, e) => s + e.amount, 0); return { totalSpending: spent, budget: t.plannedBudget, remaining: t.plannedBudget - spent, currentUserOwes: 0, budgetUsedPercentage: spent / (t.plannedBudget || 1) * 100 }; }),
    r("get", "/trips/:id/balances", () => ({ netBalance: 0, totalYouOwe: 0, totalYouAreOwed: 0, youOwe: [], youAreOwed: [], eligiblePayees: [] })),
    r("get", "/trips/:id/balances/simplified", (q) => ({ currency: tripOf(db, n(q))!.baseCurrency, originalPairwiseRelationships: 0, transfers: [], originalDebts: [], baselineSimplifiedRelationships: 0 })),
    r("get", "/trips/:id/settlements", () => []),
    r("get", "/trips/:id/personal-budget", () => reply(204)),
    r("get", "/trips/:id/budget", (q) => ({ plannedBudget: tripOf(db, n(q))!.plannedBudget, canEdit: true })),
    r("get", "/trips/:id/reviews/reviewable-members", (q) => db.reviewable[n(q)] ?? []),
    r("post", "/trips/:id/reviews", (q) => { const rv = db.reviewable[n(q)]?.find((m) => m.userId === q.body.revieweeId); if (rv) rv.alreadyReviewed = true; return { reviewId: ++ids }; }),
    r("put", "/activities/:id/vote", (q) => { const a = findAct(db, n(q))!; const was = a.currentUserVote; const v = q.body.vote;
      const d = (x: string) => (v === x ? 1 : 0) - (was === x ? 1 : 0);
      return putAct(db, { ...a, currentUserVote: v, approveCount: a.approveCount + d("APPROVE"), rejectCount: a.rejectCount + d("REJECT"), status: a.approveCount + d("APPROVE") >= a.requiredApprovals ? "APPROVED" : a.status }); }),
    r("put", "/activities/:id/schedule", (q) => putAct(db, { ...findAct(db, n(q))!, ...q.body })),
    r("put", "/activities/:id", (q) => putAct(db, { ...findAct(db, n(q))!, ...q.body })),
    r("delete", "/activities/:id/branch", (q) => putAct(db, { ...findAct(db, n(q))!, branch: false, status: "PENDING", date: null, startTime: null, endTime: null, memberIds: [] })),
    r("delete", "/activities/:id", (q) => { for (const k of Object.keys(db.activities)) db.activities[+k] = db.activities[+k].filter((a) => a.id !== n(q)); return null; }),
    r("get", "/activities/:id/comments", (q) => db.comments[n(q)] ?? []),
    r("post", "/activities/:id/comments", (q) => { const c = { id: ++ids, authorId: db.me.userId, authorUsername: db.me.username, content: q.body.content, createdAt: "2026-01-01T00:00:00" }; (db.comments[n(q)] ??= []).push(c); return c; }),
    r("delete", "/activities/:id/comments/:cid", (q) => { db.comments[n(q)] = (db.comments[n(q)] ?? []).filter((c) => c.id !== Number(q.params.cid)); return null; }),
    r("get", "/activities/:id/preferences", (q) => db.prefs[n(q)] ?? { activityId: n(q), eligibleMemberCount: 2, respondingMemberCount: 0, currentUserPreferences: [], slots: [] }),
    r("put", "/activities/:id/preferences/me", (q) => { const p = db.prefs[n(q)] ?? { activityId: n(q), eligibleMemberCount: 2, respondingMemberCount: 1, currentUserPreferences: [], slots: [] };
      p.currentUserPreferences = [...p.currentUserPreferences.filter((x) => x.preferredDate !== q.body.preferredDate), { preferenceId: ++ids, createdAt: "2026-01-01T00:00:00", ...q.body }]; db.prefs[n(q)] = p; return p; }),
    r("post", "/activity-images", () => ({ url: "/activity-images/" + (++ids) })),
    r("get", "/community/trips", () => db.community),
    r("get", "/community/trips/:id/comments", (q) => db.communityComments[n(q)] ?? []),
    r("post", "/community/trips/:id/comments", (q) => { const c = { id: ++ids, authorId: db.me.userId, authorName: db.me.username, content: q.body.content, createdAt: "2026-01-01T00:00:00", canDelete: true }; (db.communityComments[n(q)] ??= []).push(c); return c; }),
    r("delete", "/community/trips/:id/comments/:cid", (q) => { db.communityComments[n(q)] = (db.communityComments[n(q)] ?? []).filter((c) => c.id !== Number(q.params.cid)); return null; }),
    r("put", "/community/trips/:id/like", (q) => { const c = db.community.find((x) => x.tripId === n(q))!; c.likedByMe = q.body.liked ?? !c.likedByMe; c.likeCount += c.likedByMe ? 1 : -1; return { likeCount: c.likeCount, likedByMe: c.likedByMe }; }),
    r("post", "/community/places/:id/copy", (q) => { const p = db.community.flatMap((c) => c.places).find((x) => x.id === n(q))!;
      return putAct(db, proposal(db, Number(q.body.tripId), { name: p.name, location: p.location, category: p.category, tags: p.tags, imageUrls: p.imageUrls })); }),
    r("get", "/users/:id/reviews", (q) => { const list = db.reviewsAbout[n(q)] ?? []; return { averageRating: list.length ? Math.round(list.reduce((s, x) => s + x.rating, 0) / list.length * 10) / 10 : 0, reviewCount: list.length, reviews: list }; }),
    r("get", "/users/me/reviews/written", () => db.written),
    r("get", "/admin/services", () => db.services),
    r("put", "/admin/services", (q) => Object.assign(db.services, q.body)),
    r("get", "/admin/ai-models", () => [{ id: "gemini-flash", displayName: "Gemini Flash" }]),
    r("post", "/admin/services/:svc/test", () => ({ ok: true, latencyMs: 42, message: "" })),
    r("get", "/admin/users", () => ({ items: db.adminUsers, page: 0, totalPages: 1, totalItems: db.adminUsers.length })),
    r("get", "/admin/trips", () => ({ items: [], page: 0, totalPages: 0, totalItems: 0 })),
  ];
}

export const server = {
  db: emptyDb(),
  calls: [] as { method: string; path: string; body: unknown }[],
  unhandled: [] as string[],
  routes: [] as Route[],
  reset() { this.db = emptyDb(); this.calls = []; this.unhandled = []; this.routes = defaults(this.db); },
  /** Add or override an endpoint; later registrations win. */
  on(method: string, pattern: string, fn: Handler) { this.routes.unshift(compile(method, pattern, fn)); },
  /** Requests made so far matching method and path (a string prefix or a regex). */
  sent(method: string, path: string | RegExp) { return this.calls.filter((c) => c.method === method.toUpperCase() && (typeof path === "string" ? c.path === path : path.test(c.path))); },
  async handle(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
    const method = (config.method ?? "get").toUpperCase();
    const path = (config.url ?? "").replace(/^https?:\/\/[^/]+\/api/, "").split("?")[0];
    let body: unknown = config.data;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* not JSON */ } }
    this.calls.push({ method, path, body });
    const route = this.routes.find((x) => x.method === method && x.re.test(path));
    const respond = (status: number, data: unknown): AxiosResponse => ({ data, status, statusText: String(status), headers: {}, config });
    if (!route) { this.unhandled.push(method + " " + path); throw new AxiosError("Not found", "ERR_BAD_REQUEST", config, null, respond(404, { message: "Not found" })); }
    const m = path.match(route.re)!;
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    await Promise.resolve();
    const out = await route.fn({ method, path, params, query: config.params ?? {}, body });
    if (out instanceof Reply) {
      if (out.status >= 400) throw new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, respond(out.status, out.data));
      return respond(out.status, out.data);
    }
    return respond(200, out instanceof Blob ? out : structuredClone(out ?? null));
  },
};
server.reset();
