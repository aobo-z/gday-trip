/* Builders for the backend's response shapes. Dates are relative to today so lifecycle rules
   ("under way", "upcoming") hold whenever the tests run. */
import type { ActivityResponse } from "../src/api/activityApi";
import type { TripMemberResponse, TripResponse } from "../src/api/tripApi";
import type { Expense } from "../src/api/expenseApi";
import type { CommunityPlace, CommunityTrip } from "../src/api/communityApi";
import type { ReviewResponse } from "../src/api/reviewApi";
import type { UserProfile } from "../src/api/userApi";
import type { Announcement } from "../src/api/announcementApi";
import type { TripFile } from "../src/api/tripFileApi";

export function day(offset: number) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const NOW = new Date().toISOString().slice(0, 19);

let seq = 100;
const next = () => ++seq;

export const ME: UserProfile = { userId: 1, username: "Mia", email: "mia@example.test", role: "USER", accentColor: "AURORA", createdAt: "2025-02-03T10:00:00" };
export const TOM = { userId: 2, username: "Tom" };
export const LENA = { userId: 3, username: "Lena" };

export function trip(over: Partial<TripResponse> = {}): TripResponse {
  return { tripId: next(), name: "Sydney weekend", destination: "Sydney, Australia", startDate: day(-1), endDate: day(3), plannedBudget: 3000, baseCurrency: "AUD",
    canChangeBaseCurrency: true, status: "PLANNING", votingThreshold: 0.5, role: "OWNER", createdAt: NOW, coverImageId: null, ...over };
}

export function member(t: TripResponse, u: { userId: number; username: string }, over: Partial<TripMemberResponse> = {}): TripMemberResponse {
  return { tripMemberId: next(), tripId: t.tripId, tripName: t.name, tripDestination: t.destination, userId: u.userId, username: u.username,
    email: u.username.toLowerCase() + "@example.test", role: "MEMBER", inviteStatus: "JOINED", joinedAt: NOW, ...over };
}

export function activity(t: TripResponse, over: Partial<ActivityResponse> = {}): ActivityResponse {
  return { id: next(), tripId: t.tripId, createdById: ME.userId, createdByUsername: ME.username, name: "Sydney Opera House", location: "Bennelong Point, Sydney NSW 2000",
    category: "Culture", description: null, tags: [], imageUrls: [], date: null, startTime: null, endTime: null, latitude: -33.8568, longitude: 151.2153,
    branch: false, memberIds: [], createdAt: NOW, updatedAt: NOW,
    approveCount: 0, rejectCount: 0, eligibleMemberCount: 2, requiredApprovals: 1, remainingEligibleVotes: 2, commentCount: 0, currentUserVote: null,
    status: "PENDING", canModify: true, canSchedule: (over.status ?? "PENDING") === "APPROVED", ...over };
}
/** An approved idea already on the calendar. */
export function scheduled(t: TripResponse, date: string, start: string, end: string, over: Partial<ActivityResponse> = {}) {
  return activity(t, { status: "APPROVED", approveCount: 2, remainingEligibleVotes: 0, currentUserVote: "APPROVE", date, startTime: start + ":00", endTime: end + ":00", memberIds: [ME.userId], ...over });
}

export function expense(t: TripResponse, over: Partial<Expense> = {}): Expense {
  return { expenseId: next(), tripId: t.tripId, payerId: ME.userId, payerName: ME.username, createdById: ME.userId, createdByName: ME.username,
    description: "Ferry tickets", category: "Transport", amount: 40, date: day(0), createdAt: NOW, updatedAt: NOW, canEdit: true,
    originalAmount: 40, currencyCode: t.baseCurrency, baseCurrency: t.baseCurrency, exchangeRateToBase: 1, exchangeRateDate: day(0),
    activityId: null, activityName: null, activityDate: null, currentUserShare: 20,
    shares: [{ userId: ME.userId, username: ME.username, shareAmount: 20, originalShareAmount: 20 }, { userId: TOM.userId, username: TOM.username, shareAmount: 20, originalShareAmount: 20 }],
    splitMode: "EQUAL", items: [], receipt: null, ...over };
}

export function communityTrip(over: Partial<CommunityTrip> = {}, places: Partial<CommunityPlace>[] = [{}]): CommunityTrip {
  const id = next(), start = day(-30);
  return { tripId: id, name: "Tom's Osaka", destination: "Osaka, Japan", startDate: start, endDate: day(-26), coverImageId: null, likeCount: 3, likedByMe: false,
    places: places.map((p) => ({ id: next(), name: "Osaka Castle", location: "1-1 Osakajo, Chuo Ward, Osaka", category: "Culture", tags: ["castle"], imageUrls: [],
      date: start, startTime: "09:00:00", endTime: "11:00:00", ...p })), ...over };
}

export function review(from: { userId: number; username: string }, to: { userId: number; username: string }, over: Partial<ReviewResponse> = {}): ReviewResponse {
  return { reviewId: next(), tripId: 9, tripName: "Hobart winter", reviewerId: from.userId, reviewerName: from.username, revieweeId: to.userId, revieweeName: to.username,
    rating: 5, comment: "Great travel buddy", createdAt: NOW, ...over };
}

/** A trip Mia owns with Tom as a member, registered in the fake backend's db. */
export function seedTrip(db: import("./server").Db, over: Partial<TripResponse> = {}) {
  const t = trip(over);
  db.trips.push(t);
  db.members[t.tripId] = [member(t, ME, { role: "OWNER" }), member(t, TOM)];
  db.activities[t.tripId] = [];
  return t;
}

/** An announcement by Mia (an owner), posted an hour ago. */
export function announcement(t: TripResponse, over: Partial<Announcement> = {}): Announcement {
  const at = new Date(Date.now() - 3600_000).toISOString().slice(0, 19);
  return { announcementId: next(), tripId: t.tripId, title: "Meeting point", content: "Terminal 1, desk H, at 6 am.", authorId: ME.userId, authorName: ME.username,
    publishedAt: at, updatedAt: at, edited: false, canManage: true, ...over };
}

/** A file Mia uploaded to the whole trip. */
export function tripFile(t: TripResponse, over: Partial<TripFile> = {}): TripFile {
  return { fileId: next(), tripId: t.tripId, fileName: "Flight itinerary.pdf", contentType: "application/pdf", sizeBytes: 120_000, uploadedAt: NOW,
    uploaderId: ME.userId, uploaderName: ME.username, activityId: null, activityName: null, canDelete: true, ...over };
}
