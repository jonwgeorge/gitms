"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { uploadImage, type UploadResult } from "./actions/uploads";
import btn from "./Button.module.css";
import admin from "./admin.module.css";
import styles from "./ImageUpload.module.css";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif";

/**
 * Images uploaded in this tab, by URL, as data URLs. An upload is only served
 * at its URL after the next deploy, so the editor's preview shows
 * the local copy until then (the CSP allows `data:` images).
 */
const local = new Map<string, string>();

/** Points preview <img>s for just-uploaded images at their local copies. */
export function usePreviewImages(ref: RefObject<HTMLElement | null>, deps: readonly unknown[]) {
  useEffect(() => {
    for (const img of ref.current?.querySelectorAll("img") ?? []) {
      const copy = local.get(img.getAttribute("src") ?? "");
      if (copy) img.src = copy;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const readDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Puts text at the textarea's cursor (as its own paragraph) and tells React it changed. */
function insertAtCursor(area: HTMLTextAreaElement, text: string) {
  const { selectionStart: start, selectionEnd: end, value } = area;
  const before = value.slice(0, start);
  const after = value.slice(end);
  // A blank line on each side makes the image its own paragraph.
  const lead = before ? "\n".repeat(Math.max(0, 2 - (/\n*$/.exec(before)?.[0].length ?? 0))) : "";
  const tail = "\n".repeat(Math.max(0, (after ? 2 : 1) - (/^\n*/.exec(after)?.[0].length ?? 0)));
  area.focus();
  area.setRangeText(`${lead}${text}${tail}`, start, end, "end");
  area.dispatchEvent(new Event("input", { bubbles: true }));
}

type Done = { id: number; name: string; thumb: string; result: Extract<UploadResult, { ok: true }> };

/**
 * "Add image" for a markdown body: pick a file (or paste or drop one onto the
 * body), it is uploaded and `![alt](…)` goes in at the cursor. Lives
 * inside the editor's form but submits nothing with it: its inputs have no name.
 */
const mb = (n: number) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;

/** `maxBytes` is a client copy of the server limit, to refuse early without a round trip. */
export function ImageUpload({
  target,
  maxBytes = 5 * 1024 * 1024,
  action = uploadImage,
}: {
  target: string;
  maxBytes?: number;
  action?: (fd: FormData) => Promise<UploadResult>;
}) {
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [dropping, setDropping] = useState(false);
  const nextId = useRef(0);

  const upload = async (file: File) => {
    setError(null);
    if (file.size > maxBytes) {
      setError(`That image is over ${mb(maxBytes)}. Resize it and try again.`);
      return;
    }
    setBusy(file.name || "image");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("alt", alt);
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const thumb = await readDataUrl(file).catch(() => "");
      if (thumb) local.set(result.url, thumb);
      const area = document.getElementById(target);
      if (area instanceof HTMLTextAreaElement) insertAtCursor(area, result.markdown);
      setDone((d) => [{ id: nextId.current++, name: file.name || "pasted image", thumb, result }, ...d]);
      setAlt("");
    } catch {
      setError("Uploading failed (the connection dropped, or the file was too large). Nothing was inserted.");
    } finally {
      setBusy(null);
    }
  };

  // Paste or drop an image straight onto the body.
  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  });
  useEffect(() => {
    const area = document.getElementById(target);
    if (!area) return;
    const firstImage = (files: FileList | null | undefined) => [...(files ?? [])].find((f) => f.type.startsWith("image/"));
    const onPaste = (e: ClipboardEvent) => {
      const file = firstImage(e.clipboardData?.files);
      if (!file) return;
      e.preventDefault();
      void uploadRef.current(file);
    };
    const onDragOver = (e: DragEvent) => {
      if (![...(e.dataTransfer?.items ?? [])].some((i) => i.kind === "file")) return;
      e.preventDefault();
      setDropping(true);
    };
    const onDragLeave = () => setDropping(false);
    const onDrop = (e: DragEvent) => {
      setDropping(false);
      const file = firstImage(e.dataTransfer?.files);
      if (!file) return;
      e.preventDefault();
      void uploadRef.current(file);
    };
    area.addEventListener("paste", onPaste);
    area.addEventListener("dragover", onDragOver);
    area.addEventListener("dragleave", onDragLeave);
    area.addEventListener("drop", onDrop);
    return () => {
      area.removeEventListener("paste", onPaste);
      area.removeEventListener("dragover", onDragOver);
      area.removeEventListener("dragleave", onDragLeave);
      area.removeEventListener("drop", onDrop);
    };
  }, [target]);

  useEffect(() => {
    document.getElementById(target)?.classList.toggle(styles.dropping, dropping);
  }, [target, dropping]);

  const fileId = `${target}-image-file`;
  const altId = `${target}-image-alt`;
  const statusId = `${target}-image-status`;

  return (
    <div className={admin.stack} data-testid="image-upload">
      <div className={styles.bar}>
        {/* A real (visually hidden) file input, labelled by the button-styled label after it. */}
        <input
          id={fileId}
          type="file"
          accept={ACCEPT}
          className={styles.file}
          disabled={busy !== null}
          aria-describedby={statusId}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) void upload(file);
          }}
        />
        <label htmlFor={fileId} className={`gitms-button ${btn.btn} ${admin.button} ${styles.pick}`} data-busy={busy !== null || undefined}>
          {busy ? "Uploading…" : "Add image"}
        </label>
        <div className={styles.alt}>
          <label htmlFor={altId} className={`gitms-small ${admin.label}`}>
            Alt text (describes the next image)
          </label>
          <input
            id={altId}
            className={`gitms-body ${admin.input}`}
            value={alt}
            onChange={(e) => setAlt(e.currentTarget.value)}
            placeholder="e.g. the garden in May"
            autoComplete="off"
          />
        </div>
      </div>
      <p id={statusId} className={`gitms-small ${error ? admin.error : admin.hint}`} role="status" aria-live="polite">
        {error ??
          (busy
            ? `Uploading ${busy}…`
            : `PNG, JPEG, GIF, WebP or AVIF up to ${mb(maxBytes)}. Paste or drop an image onto the body too. It goes in at the cursor.`)}
      </p>
      {done.length ? (
        <ul className={styles.list} aria-label="Uploaded images">
          {done.map(({ id, name, thumb, result }) => (
            <li key={id} className={styles.item}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {thumb ? <img src={thumb} alt="" /> : <span />}
              <div>
                <p className="gitms-small">
                  <code>{result.url}</code>
                </p>
                <p className={`gitms-small ${admin.hint}`}>
                  {name}: {result.note}{" "}
                  {result.commitUrl ? (
                    <a href={result.commitUrl} target="_blank" rel="noreferrer">
                      View commit
                    </a>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
