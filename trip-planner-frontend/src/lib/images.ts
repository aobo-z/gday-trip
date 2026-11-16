import { useEffect, useState } from "react";
import axiosClient from "../api/axiosClient";

/* Uploaded activity photos ("/activity-images/{id}") need the sign-in token, so they are fetched once as blobs. */
const cache = new Map<string, Promise<string>>();
export const isPrivateImage = (src?: string | null) => !!src?.startsWith("/activity-images/");
export function loadImage(src: string): Promise<string> {
  if (!isPrivateImage(src)) return Promise.resolve(src);
  let p = cache.get(src);
  if (!p) {
    p = axiosClient.get<Blob>(src, { responseType: "blob" }).then(({ data }) => URL.createObjectURL(data));
    cache.set(src, p);
    p.catch(() => cache.delete(src));
  }
  return p;
}
export function clearImageCache() {
  cache.forEach((p) => p.then(URL.revokeObjectURL).catch(() => undefined));
  cache.clear();
}
/** A URL an <img> can show, or null while a private photo loads. */
export function useImage(src: string | null | undefined) {
  const [got, setGot] = useState<{ src: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!src || !isPrivateImage(src)) return;
    let live = true;
    loadImage(src).then((url) => { if (live) setGot({ src, url }); }).catch(() => { if (live) setGot({ src, url: null }); });
    return () => { live = false; };
  }, [src]);
  if (!src) return null;
  if (!isPrivateImage(src)) return src;
  return got?.src === src ? got.url : null;
}
