import { useEffect, useState } from "react";
import { downloadTripFile, fetchTripFiles, TRIP_FILE_MAX_BYTES, TRIP_FILE_TYPES, type TripFile } from "../api/tripFileApi";
import { useLoad } from "./useLoad";

/* FR-18 helpers shared by the Overview's Files card and the Attachments section in the plan and idea drawers. */

export const isPdf = (f: Pick<TripFile, "contentType">) => f.contentType === "application/pdf";
export const isImage = (f: Pick<TripFile, "contentType">) => f.contentType.startsWith("image/");
/** "PDF", "PNG", "JPG", "WEBP": the short label on a file's tile. */
export function fileLabel(f: Pick<TripFile, "contentType">) {
  const sub = f.contentType.split("/")[1] ?? "";
  return sub === "jpeg" ? "JPG" : sub.toUpperCase();
}
export function fileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + " MB";
}
/** Why a chosen file can't be uploaded, or "" if it can. The backend checks the real type again from the file's bytes. */
export function fileProblem(f: File) {
  if (!TRIP_FILE_TYPES.includes(f.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(f.name)) return "Only PDFs and JPEG, PNG or WebP images";
  if (f.size > TRIP_FILE_MAX_BYTES) return "Larger than 10 MB";
  if (f.size === 0) return "This file is empty";
  return "";
}

/* ---------- Changes: an upload in a drawer refreshes the Overview's card underneath, and the other way round ---------- */
const listeners = new Set<(tripId: number) => void>();
export function filesChanged(tripId: number) { listeners.forEach((l) => l(tripId)); }

/** The trip's files (or one activity's), reloaded whenever any part of the app adds or removes one. */
export function useTripFiles(tripId: number, activityId?: number) {
  const load = useLoad(() => fetchTripFiles(tripId, activityId), [tripId, activityId], "Couldn't load the files.");
  const { retry } = load;
  useEffect(() => {
    const l = (id: number) => { if (id === tripId) retry(); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [tripId, retry]);
  return load;
}

/* ---------- Contents: fetched once with the sign-in token, kept as object URLs for thumbnails, previews and saving ---------- */
const cache = new Map<string, Promise<string>>();
const key = (f: Pick<TripFile, "tripId" | "fileId">) => f.tripId + "/" + f.fileId;
export function fileUrl(f: Pick<TripFile, "tripId" | "fileId" | "contentType">): Promise<string> {
  let p = cache.get(key(f));
  if (!p) {
    // Typed as the server reports it, so a PDF opens in the browser's own viewer.
    p = downloadTripFile(f.tripId, f.fileId).then((b) => URL.createObjectURL(new Blob([b], { type: f.contentType })));
    cache.set(key(f), p);
    p.catch(() => cache.delete(key(f)));
  }
  return p;
}
export function forgetFile(f: Pick<TripFile, "tripId" | "fileId">) {
  cache.get(key(f))?.then(URL.revokeObjectURL).catch(() => undefined);
  cache.delete(key(f));
}
export function clearFileCache() {
  cache.forEach((p) => p.then(URL.revokeObjectURL).catch(() => undefined));
  cache.clear();
}
/** An object URL for the file, or null while it loads; `failed` once it couldn't be fetched. Change `attempt` to try again. */
export function useFileUrl(f: TripFile | null, attempt = 0) {
  const [got, setGot] = useState<{ id: string; url: string | null } | null>(null);
  const id = f ? key(f) + "#" + attempt : "";
  useEffect(() => {
    if (!f) return;
    let live = true;
    fileUrl(f).then((url) => { if (live) setGot({ id, url }); }).catch(() => { if (live) setGot({ id, url: null }); });
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = got?.id === id ? got : null;
  return { url: mine?.url ?? null, failed: !!mine && !mine.url };
}

/**
 * Saves the file under its own name. A link click is the only way a page can save a file; the link goes inside
 * `within` (the open dialog) because a modal dialog makes everything outside it inert.
 */
export async function saveFile(f: TripFile, within?: Element | null) {
  const a = document.createElement("a");
  a.href = await fileUrl(f);
  a.download = f.fileName;
  (within ?? document.body).appendChild(a);
  a.click();
  a.remove();
}
