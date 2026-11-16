import axiosClient from "./axiosClient";
import type { ActivityResponse } from "./activityApi";

export interface SaveBranchPlanRequest {
  /** A pending or rejected activity to turn into this branch (it keeps its own row); omit for a new place. */
  sourceActivityId?: number | null;
  name: string;
  location: string;
  category: string;
  description?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  memberIds?: number[];
  /** A new place only. */
  tags?: string[];
  imageUrls?: string[];
  latitude?: number;
  longitude?: number;
}

export async function createBranchPlan(tripId: number | string, request: SaveBranchPlanRequest) {
  const response = await axiosClient.post<ActivityResponse>(`/trips/${tripId}/branches`, request);
  return response.data;
}

/** Sends a branch back to voting, off the timeline. */
export async function removeBranch(activityId: number) {
  const response = await axiosClient.delete<ActivityResponse>(`/activities/${activityId}/branch`);
  return response.data;
}
