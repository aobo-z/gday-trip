/* FR-3: cover photos are shrunk in the browser before upload, so a phone photo of 8–12 MB fits the server's 5 MB
   limit, turns the right way up (createImageBitmap applies the EXIF rotation) and loses hidden metadata such as
   GPS location. */

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const SERVER_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_ACCEPT = ACCEPTED.join(",");

async function shrink(file: File, maxSize: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new Error("no canvas"); }
  // JPEG has no transparency: paint white first so transparent PNG areas don't turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("no blob");
  return new File([blob], "cover.jpg", { type: "image/jpeg" });
}

/**
 * At most `maxSize` px on the longest side, re-encoded as an 85% JPEG. If the browser can't process the image
 * but it's already small enough, the original is sent instead. Throws a message the user can act on.
 */
export async function prepareImage(file: File, maxSize = 1600): Promise<File> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP image");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is over 25 MB. Choose a smaller one");
  try { return await shrink(file, maxSize); } catch {
    if (file.size <= SERVER_MAX_BYTES) return file;
    throw new Error("That image couldn't be read. Try a different file");
  }
}
