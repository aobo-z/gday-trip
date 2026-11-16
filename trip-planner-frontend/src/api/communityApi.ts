import axiosClient from "./axiosClient";
import type { ActivityResponse } from "./activityApi";

export interface CommunityPlace {
  id: number;
  name: string;
  location: string;
  category: string;
  tags: string[];
  imageUrls: string[];
  date: string;
  startTime: string;
  endTime: string;
}
export interface CommunityTrip {
  tripId: number;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  coverImageId?: string | null;
  places: CommunityPlace[];
  likeCount: number;
  likedByMe: boolean;
}
/** A public comment on a shared trip (not the members' private activity comments). */
export interface CommunityComment {
  id: number;
  content: string;
  authorId: number;
  authorName: string;
  createdAt: string;
  canDelete: boolean;
}
export async function fetchCommunityComments(tripId: number): Promise<CommunityComment[]> {
  return (await axiosClient.get<CommunityComment[]>(`/community/trips/${tripId}/comments`)).data;
}
export async function postCommunityComment(tripId: number, content: string): Promise<CommunityComment> {
  return (await axiosClient.post<CommunityComment>(`/community/trips/${tripId}/comments`, { content })).data;
}
export async function deleteCommunityComment(tripId: number, id: number): Promise<void> {
  await axiosClient.delete(`/community/trips/${tripId}/comments/${id}`);
}
export async function fetchCommunityTrips(page = 0): Promise<CommunityTrip[]> {
  return (await axiosClient.get<CommunityTrip[]>("/community/trips", { params: { page } })).data;
}
export async function fetchCommunityTrip(id: number): Promise<CommunityTrip> {
  return (await axiosClient.get<CommunityTrip>(`/community/trips/${id}`)).data;
}
export async function likeTrip(id: number, liked: boolean): Promise<{ likeCount: number; likedByMe: boolean }> {
  return (await axiosClient.put(`/community/trips/${id}/like`, { liked })).data;
}
/** Proposes a shared place in one of my trips; the server copies its photos and map position. */
export async function copyCommunityPlace(activityId: number, tripId: number | string): Promise<ActivityResponse> {
  return (await axiosClient.post<ActivityResponse>(`/community/places/${activityId}/copy`, { tripId: Number(tripId) })).data;
}
export async function uploadActivityImage(file: File): Promise<string> {
  const data = new FormData(); data.append("file", file);
  return (await axiosClient.post<{ url: string }>("/activity-images", data)).data.url;
}
