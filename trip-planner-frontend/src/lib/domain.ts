import type { ActivityResponse } from "../api/activityApi";
import type { TripResponse } from "../api/tripApi";
import { imageUrl } from "../api/imageApi";
import { dayDiff, today } from "./format";

/* ---------- Trip lifecycle: PLANNING → ONGOING → ARCHIVED → PUBLISHED ---------- */
export const STATUS: Record<string, [string, string]> = {
  PLANNING: ["Planning", "c-blue"], ONGOING: ["On the road", "c-good"], ARCHIVED: ["Archived", "c-plain"], PUBLISHED: ["Shared", "c-violet"],
};
export const STATUS_ORDER = ["PLANNING", "ONGOING", "ARCHIVED", "PUBLISHED"];
export const isOwner = (t: Pick<TripResponse, "role">) => t.role === "OWNER";
export const editable = (t: Pick<TripResponse, "status">) => t.status === "PLANNING" || t.status === "ONGOING";
export const finished = (t: Pick<TripResponse, "status">) => t.status === "ARCHIVED" || t.status === "PUBLISHED";

/* ---------- Which trip to show ---------- */
type Dated = Pick<TripResponse, "tripId" | "status" | "startDate" | "endDate">;
/**
 * Where an open trip stands today, worked out from today's date each time it's shown: under way ("Day 2"),
 * starting soon ("Starts today", "Tomorrow", "In 12 days"), or its dates have passed while it's still open.
 * `rank` orders them: under way first, then the soonest to start, then the passed ones.
 */
export function countdown(t: Pick<TripResponse, "startDate" | "endDate">, now = today()) {
  const d = dayDiff(now, t.startDate);
  if (d > 1) return { rank: 1, days: d, label: `In ${d} days` };
  if (d === 1) return { rank: 1, days: d, label: "Tomorrow" };
  if (d === 0) return { rank: 0, days: d, label: "Starts today" };
  if (now <= t.endDate) return { rank: 0, days: d, label: `Day ${1 - d}` };
  return { rank: 2, days: d, label: "Dates passed" };
}
/** Trips still being planned or travelled: under way first, then the one starting soonest. */
export function activeTrips<T extends Dated>(list: T[], now = today()) {
  return list.filter(editable).map((t) => ({ t, c: countdown(t, now) }))
    .sort((a, b) => a.c.rank - b.c.rank || (a.c.rank === 2 ? b.c.days - a.c.days : a.c.days - b.c.days) || a.t.tripId - b.t.tripId)
    .map((x) => x.t);
}
/** The trip closest to today: one under way, else the next to start, else the one that ended last. Finished trips only when nothing else is left. */
export function nearestTrip<T extends Dated>(list: T[]): T | undefined {
  const d = today();
  const pool = list.some(editable) ? list.filter(editable) : list;
  return pool.find((t) => t.startDate <= d && t.endDate >= d)
    ?? [...pool].filter((t) => t.startDate > d).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
    ?? [...pool].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
}

/* ---------- Cover pictures ---------- */
const DEST_COVER: Record<string, string> = { hobart: "hobart", tasmania: "tasmania", kyoto: "kyoto", melbourne: "melbourne", queenstown: "queenstown", ubud: "ubud", bali: "ubud", byron: "byron", noosa: "noosa", seoul: "seoul", tokyo: "tokyo", torquay: "torquay" };
const LIBRARY = ["hobart", "kyoto", "melbourne", "queenstown", "ubud", "byron", "noosa", "seoul", "tasmania", "tokyo", "torquay", "g-coast", "g-mountains", "g-city", "g-forest"];
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; }
/** The uploaded cover, else a picture from the built-in library: the destination's own if there is one, otherwise a random one that stays the same for this trip. */
export function coverOf(t: { tripId?: number; destination?: string; coverImageId?: string | null }) {
  if (t.coverImageId) return imageUrl(t.coverImageId);
  const d = (t.destination ?? "").toLowerCase();
  const key = Object.keys(DEST_COVER).find((k) => d.includes(k));
  return "/covers/" + (key ? DEST_COVER[key] : LIBRARY[hash(String(t.tripId ?? d)) % LIBRARY.length]) + ".svg";
}
export const TONES = ["peach", "mint", "sky", "lilac", "sand", "rose"];
export function toneOf(seed: number | string) { return "tone-" + TONES[hash(String(seed)) % TONES.length]; }

/* ---------- Activity categories (free text, grouped by keyword) ---------- */
export const CATEGORIES = ["Sights", "Food", "Nature", "Culture", "Lodging", "Transport"];
const FAMILY: [RegExp, string][] = [
  [/lodg|hotel|hostel|motel|ryokan|resort|accommodation|stay|apartment|villa|chalet/i, "Lodging"],
  [/transport|airport|train|station|bus|ferry|flight|car|taxi|shuttle|transfer/i, "Transport"],
  [/food|restaurant|cafe|coffee|bar|bakery|meal|dinner|lunch|breakfast|market|pub|dessert|winery|brewery/i, "Food"],
  [/park|nature|beach|hike|trail|mountain|lake|garden|forest|waterfall|island|fjord|wildlife|zoo|ski/i, "Nature"],
  [/museum|culture|art|gallery|church|temple|shrine|histor|monument|castle|library|theat/i, "Culture"],
];
export function family(category: string | null | undefined) { return FAMILY.find(([re]) => re.test(category ?? ""))?.[1] ?? "Sights"; }
export const CAT_KEY: Record<string, string> = { Culture: "culture", Food: "food", Nature: "nature", Sights: "sights", Lodging: "lodging", Transport: "transport" };
export const CAT_ICON: Record<string, string> = { Culture: "landmark", Food: "utensils", Nature: "mountain", Sights: "camera", Lodging: "bed", Transport: "bus" };
export const catKey = (c: string | null | undefined) => CAT_KEY[family(c)];
export const catIcon = (c: string | null | undefined) => CAT_ICON[family(c)];

/* ---------- Activity state, from the backend's ProposalStatus plus scheduling ---------- */
export type IdeaKind = "needs" | "voting" | "approved" | "scheduled" | "rejected" | "branch";
export const isScheduled = (a: Pick<ActivityResponse, "date" | "startTime">) => !!(a.date && a.startTime);
export function ideaKind(a: ActivityResponse): IdeaKind {
  if (a.branch) return "branch";
  // canSchedule also covers activities that were on the calendar before: unscheduled, they go back to To schedule, not voting.
  if (a.status === "APPROVED" || a.canSchedule) return isScheduled(a) ? "scheduled" : "approved";
  if (a.status === "REJECTED") return "rejected";
  return a.currentUserVote ? "voting" : "needs";
}
export const IDEA_CHIP: Record<IdeaKind, [string, string]> = {
  needs: ["Needs vote", "c-warn"], voting: ["Voting", "c-plain"], approved: ["To schedule", "c-good"], scheduled: ["Scheduled", "c-sky"],
  rejected: ["Rejected", "c-bad"], branch: ["To schedule", "c-violet"],
};
/** Where an activity is in planning; a branch skipped voting, so it is waiting for a time or scheduled like an approved one. */
export function stageOf(a: ActivityResponse): Exclude<IdeaKind, "branch"> {
  const k = ideaKind(a);
  return k === "branch" ? (isScheduled(a) ? "scheduled" : "approved") : k;
}
/* Waiting for a time and scheduled also differ by icon, which tells branches (all violet) apart too. */
const STAGE_ICON: Partial<Record<IdeaKind, string>> = { approved: "clock", scheduled: "cal" };
/** The status chip: [label, class, icon]. Branches use their stage's words and icon in violet. */
export function chipOf(a: ActivityResponse): [string, string, string | undefined] {
  const st = stageOf(a);
  return a.branch ? [IDEA_CHIP[st][0], "c-violet", STAGE_ICON[st]] : [...IDEA_CHIP[ideaKind(a)], STAGE_ICON[st]];
}
/** Placing, moving and unscheduling: any member, for a branch or an approved activity (ActivityService.updateSchedule). */
export const canPlace = (t: TripResponse, a: ActivityResponse) => editable(t) && (a.branch || a.canSchedule);
/** Pending or rejected activities can become a branch (POST /trips/{id}/branches with sourceActivityId). */
export function canBranch(t: TripResponse, a: ActivityResponse) {
  const k = ideaKind(a);
  return editable(t) && (k === "needs" || k === "voting" || k === "rejected");
}
export function overlaps(a: { date: string | null; startTime: string | null; endTime: string | null }, b: { date: string | null; startTime: string | null; endTime: string | null }) {
  return !!(a.date && b.date === a.date && a.startTime && b.startTime && a.endTime && b.endTime && hmCmp(a.startTime) < hmCmp(b.endTime) && hmCmp(a.endTime) > hmCmp(b.startTime));
}
const hmCmp = (t: string) => t.slice(0, 5);
/** Backend rule (validateGroupSchedule): group plans may not overlap other group plans; branches are exempt. */
export function clash(list: ActivityResponse[], a: ActivityResponse, date: string, st: string, en: string) {
  if (a.branch) return undefined;
  return list.find((x) => x.id !== a.id && !x.branch && x.date === date && x.startTime && x.endTime && st < hmCmp(x.endTime) && en > hmCmp(x.startTime));
}
export function pipeline(list: ActivityResponse[]) {
  const c = { scheduled: 0, approved: 0, voting: 0, rejected: 0 };
  list.forEach((a) => {
    const k = stageOf(a);
    if (k === "scheduled" || k === "approved" || k === "rejected") c[k]++;
    else if (k === "needs" || k === "voting") c.voting++;
  });
  return c;
}
