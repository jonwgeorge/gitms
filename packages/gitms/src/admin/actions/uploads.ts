"use server";

/**
 * Upload one image for the post and page editors (see core/uploads).
 * Checks the session itself, before reading the file.
 */
import { adminGate } from "../../core/auth";
import { UploadError, altText, createUploads, sniffImage, uploadPath } from "../../core/uploads";
import { cms } from "../../runtime";

export type UploadResult =
  | {
      readonly ok: true;
      /** Site-relative URL the image is served at. */
      readonly url: string;
      /** Ready to paste: `![alt](url)`. */
      readonly markdown: string;
      readonly commitUrl: string | null;
      readonly note: string;
    }
  | { readonly ok: false; readonly error: string };

const MB = (n: number) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;

export async function uploadImage(fd: FormData): Promise<UploadResult> {
  const gate = await adminGate();
  if (gate.state === "unconfigured") return { ok: false, error: "The admin is not configured on this server, so nothing can be uploaded." };
  if (gate.state !== "admin") return { ok: false, error: "You are not logged in (or your session expired). Log in again; nothing was uploaded." };

  const target = cms().uploads;
  if (!target) return { ok: false, error: "Image uploads are not configured for this site." };
  const MAX_UPLOAD_BYTES = target.maxBytes;
  const file = fd.get("file");
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "Pick an image to upload." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `That image is ${MB(file.size)}; the limit is ${MB(MAX_UPLOAD_BYTES)}. Resize it and try again.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return { ok: false, error: "That file isn't a PNG, JPEG, GIF, WebP or AVIF image. (SVG isn't accepted.)" };

  const name = typeof (file as File).name === "string" ? (file as File).name : "image";
  const { path, url } = uploadPath(target, name, bytes, type);
  const alt = altText(String(fd.get("alt") ?? ""), url.split("/").pop()!.replace(/-[0-9a-f]{10}\.\w+$/, ""));
  const markdown = `![${alt}](${url})`;
  try {
    const store = createUploads(gate.config.store, target, cms().userAgent);
    const saved = await store.put(path, bytes, `uploads: add ${path.slice(target.dir.length + 1)}`);
    const note =
      store.kind === "fs"
        ? `Saved to ${target.dir} locally.`
        : saved.existed
          ? "This image was already uploaded; reusing it."
          : `Committed${saved.commitSha ? ` ${saved.commitSha.slice(0, 7)}` : ""}. The image shows on the site once it rebuilds.`;
    return { ok: true, url, markdown, commitUrl: saved.commitUrl, note };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: `${error.message}. Nothing was uploaded.` };
    console.error("admin upload failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Uploading failed. Nothing was uploaded." };
  }
}
