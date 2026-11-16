import axiosClient from "./axiosClient";

/* FR-18: trip files. PDFs and images for the whole trip or one activity, readable only by trip members. */

// Matches the backend TripFileResponse DTO.
export interface TripFile {
  fileId: number;
  tripId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploaderId: number;
  uploaderName: string;
  activityId: number | null;
  activityName: string | null;
  /** The signed-in user may remove it (its uploader or a trip owner). */
  canDelete: boolean;
}

/** Same rules as the backend, checked here first for a quicker, clearer message. */
export const TRIP_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const TRIP_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const TRIP_FILE_ACCEPT = TRIP_FILE_TYPES.join(",") + ",.pdf,.jpg,.jpeg,.png,.webp";

/** GET /api/trips/{tripId}/files, newest first; with an activity id, only that activity's files. */
export async function fetchTripFiles(tripId: number, activityId?: number): Promise<TripFile[]> {
  return (await axiosClient.get<TripFile[]>(`/trips/${tripId}/files`, { params: activityId == null ? undefined : { activityId } })).data;
}
/** POST /api/trips/{tripId}/files (multipart "file", optional "activityId"). */
export async function uploadTripFile(tripId: number, file: File, activityId?: number | null): Promise<TripFile> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (activityId != null) form.append("activityId", String(activityId));
  return (await axiosClient.post<TripFile>(`/trips/${tripId}/files`, form)).data;
}
/** GET /api/trips/{tripId}/files/{fileId}/download. Members only, so it's fetched with the token as a Blob, never linked to. */
export async function downloadTripFile(tripId: number, fileId: number): Promise<Blob> {
  return (await axiosClient.get<Blob>(`/trips/${tripId}/files/${fileId}/download`, { responseType: "blob" })).data;
}
/** DELETE /api/trips/{tripId}/files/{fileId} (the uploader or an owner). */
export async function deleteTripFile(tripId: number, fileId: number): Promise<void> {
  await axiosClient.delete(`/trips/${tripId}/files/${fileId}`);
}
