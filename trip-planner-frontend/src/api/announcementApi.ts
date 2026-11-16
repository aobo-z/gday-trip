import axiosClient from "./axiosClient";

/* FR-19: trip announcements. Owners publish, edit and remove; every joined member reads them, newest first. */

// Matches the backend AnnouncementResponse DTO.
export interface Announcement {
  announcementId: number;
  tripId: number;
  title: string;
  content: string;
  authorId: number;
  authorName: string;
  publishedAt: string;
  updatedAt: string;
  /** Changed after it was published. */
  edited: boolean;
  /** The signed-in user may edit or remove it (any trip owner). */
  canManage: boolean;
}
export interface AnnouncementRequest { title: string; content: string }

/** Same limits as the backend (and the ERD's VARCHAR(100) title). */
export const ANNOUNCEMENT_TITLE_MAX = 100;
export const ANNOUNCEMENT_CONTENT_MAX = 5000;

/** GET /api/trips/{tripId}/announcements, newest first. */
export async function fetchAnnouncements(tripId: number): Promise<Announcement[]> {
  return (await axiosClient.get<Announcement[]>(`/trips/${tripId}/announcements`)).data;
}
/** POST /api/trips/{tripId}/announcements (owners). */
export async function createAnnouncement(tripId: number, data: AnnouncementRequest): Promise<Announcement> {
  return (await axiosClient.post<Announcement>(`/trips/${tripId}/announcements`, data)).data;
}
/** PUT /api/trips/{tripId}/announcements/{id} (owners). Keeps the publish time and marks it edited. */
export async function updateAnnouncement(tripId: number, announcementId: number, data: AnnouncementRequest): Promise<Announcement> {
  return (await axiosClient.put<Announcement>(`/trips/${tripId}/announcements/${announcementId}`, data)).data;
}
/** DELETE /api/trips/{tripId}/announcements/{id} (owners). */
export async function deleteAnnouncement(tripId: number, announcementId: number): Promise<void> {
  await axiosClient.delete(`/trips/${tripId}/announcements/${announcementId}`);
}
