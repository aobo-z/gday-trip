import axiosClient from "./axiosClient";

export type VoteValue = "APPROVE" | "REJECT";
/** BRANCH: taken out of voting; only the members who pick it go. */
export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "BRANCH";

export interface ActivityResponse {
  id: number;
  tripId: number;
  createdById: number;
  createdByUsername: string;
  name: string;
  location: string;
  category: string;
  description: string | null;
  tags: string[];
  imageUrls: string[];
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  latitude: number | null;
  longitude: number | null;
  branch: boolean;
  memberIds: number[];
  createdAt: string;
  updatedAt: string;
  approveCount: number;
  rejectCount: number;
  eligibleMemberCount: number;
  requiredApprovals: number;
  remainingEligibleVotes: number;
  commentCount: number;
  currentUserVote: VoteValue | null;
  status: ProposalStatus;
  canModify: boolean;
  canSchedule: boolean;
}

export interface ActivityScheduleRequest {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  memberIds?: number[];
}

export interface CreateActivityRequest {
  name: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location: string;
  category: string;
  description?: string | null;
  tags?: string[];
  imageUrls?: string[];
  // Optional; omitting them on an edit keeps the existing map pin.
  latitude?: number | null;
  longitude?: number | null;
}

export interface ActivityComment {
  id: number;
  authorId: number;
  authorUsername: string;
  content: string;
  createdAt: string;
}

export interface ActivityPreference {
  preferenceId: number;
  preferredDate: string;
  preferredStartTime: string | null;
  preferredEndTime: string | null;
  createdAt: string;
}

export interface ActivityPreferenceRequest {
  preferredDate: string;
  preferredStartTime?: string | null;
  preferredEndTime?: string | null;
}

export interface ActivityPreferencesResponse {
  activityId: number;
  eligibleMemberCount: number;
  respondingMemberCount: number;
  currentUserPreferences: ActivityPreference[];
  slots: { preferredDate: string; preferredStartTime: string | null; preferredEndTime: string | null; memberCount: number }[];
}

export async function fetchActivities(tripId: number | string): Promise<ActivityResponse[]> {
  const response = await axiosClient.get<ActivityResponse[]>(`/trips/${tripId}/activities`);
  return response.data;
}

export async function fetchActivity(activityId: number): Promise<ActivityResponse> {
  const response = await axiosClient.get<ActivityResponse>(`/activities/${activityId}`);
  return response.data;
}

export async function createActivity(tripId: number | string, data: CreateActivityRequest): Promise<ActivityResponse> {
  const response = await axiosClient.post<ActivityResponse>(`/trips/${tripId}/activities`, data);
  return response.data;
}

export async function updateActivity(activityId: number, data: CreateActivityRequest): Promise<ActivityResponse> {
  const response = await axiosClient.put<ActivityResponse>(`/activities/${activityId}`, data);
  return response.data;
}

export async function updateActivityLocation(activityId: number, latitude: number, longitude: number): Promise<ActivityResponse> {
  const response = await axiosClient.put<ActivityResponse>(`/activities/${activityId}/location`, { latitude, longitude });
  return response.data;
}

export async function updateActivitySchedule(activityId: number, data: ActivityScheduleRequest): Promise<ActivityResponse> {
  const response = await axiosClient.put<ActivityResponse>(`/activities/${activityId}/schedule`, data);
  return response.data;
}

export async function joinScheduledActivity(activityId: number): Promise<ActivityResponse> {
  const response = await axiosClient.post<ActivityResponse>(`/activities/${activityId}/members/me`);
  return response.data;
}

export async function leaveScheduledActivity(activityId: number): Promise<ActivityResponse> {
  const response = await axiosClient.delete<ActivityResponse>(`/activities/${activityId}/members/me`);
  return response.data;
}

export async function deleteActivity(activityId: number): Promise<void> {
  await axiosClient.delete(`/activities/${activityId}`);
}

export async function saveActivityVote(activityId: number, vote: VoteValue): Promise<ActivityResponse> {
  const response = await axiosClient.put<ActivityResponse>(`/activities/${activityId}/vote`, { vote });
  return response.data;
}

/** Takes back my vote on an activity. */
export async function withdrawActivityVote(activityId: number): Promise<ActivityResponse> {
  const response = await axiosClient.delete<ActivityResponse>(`/activities/${activityId}/vote`);
  return response.data;
}

export async function fetchActivityPreferences(activityId: number): Promise<ActivityPreferencesResponse> {
  const response = await axiosClient.get<ActivityPreferencesResponse>(`/activities/${activityId}/preferences`);
  return response.data;
}

export async function saveActivityPreference(activityId: number, data: ActivityPreferenceRequest): Promise<ActivityPreferencesResponse> {
  const response = await axiosClient.put<ActivityPreferencesResponse>(`/activities/${activityId}/preferences/me`, data);
  return response.data;
}

/** Takes back one of my preferred dates. */
export async function deleteActivityPreference(activityId: number, preferredDate: string): Promise<ActivityPreferencesResponse> {
  const response = await axiosClient.delete<ActivityPreferencesResponse>(`/activities/${activityId}/preferences/me`, { params: { date: preferredDate } });
  return response.data;
}

export async function fetchActivityComments(activityId: number): Promise<ActivityComment[]> {
  const response = await axiosClient.get<ActivityComment[]>(`/activities/${activityId}/comments`);
  return response.data;
}

export async function createActivityComment(activityId: number, content: string): Promise<ActivityComment> {
  const response = await axiosClient.post<ActivityComment>(`/activities/${activityId}/comments`, { content });
  return response.data;
}

export async function deleteActivityComment(activityId: number, commentId: number): Promise<void> {
  await axiosClient.delete(`/activities/${activityId}/comments/${commentId}`);
}
