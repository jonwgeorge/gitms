/**
 * Saving a whole content file from one form: the building block for custom
 * admin sections (a site settings form, a "now" list…). Your own "use server"
 * action calls `saveWholeFile(editor, prev, formData)`; it checks the session,
 * applies list buttons (add / move / delete rows) without saving, and on save
 * validates against the file's schema and commits it, refusing a stale edit.
 * Server-only.
 */
import { cms } from "../runtime";
import { adminGate } from "./auth";
import { parseIntent, splitIssues, type FormState, type ListOp } from "./drafts";
import type { Validation } from "./schema";
import { STALE_MESSAGE, StaleContentError, StoreError, createStore, type ContentFile, type ContentStore } from "./store";

const NOT_CONFIGURED = "The admin is not configured on this server, so nothing can be saved.";
const DENIED = "You are not logged in (or your session expired). Log in again; nothing was saved.";

export type Editor<D> = {
  /** Prefix of this form's element ids (`now` → `now-status`). */
  key: string;
  file: ContentFile;
  commitMessage: string;
  read: (fd: FormData) => D;
  op: (draft: D, op: ListOp) => { draft: D; focus: string } | null;
  /** The whole file to write: this form's part merged into the current file. */
  merge: (current: unknown, draft: D) => unknown;
  validate: (content: unknown) => Validation<unknown>;
  owns: (path: string) => boolean;
  /** Regexes for this form's own field paths, e.g. `/^social\.\d+\.[a-z]+$/` (see splitIssues). */
  fields: readonly RegExp[];
  toDraft: (content: unknown) => D;
};

const asRecord = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? v : {});

function liveNote(store: ContentStore, file: ContentFile, saved: { commitSha: string | null; commitUrl: string | null }) {
  return store.kind === "github"
    ? {
        message: saved.commitSha ? `Saved. Committed ${saved.commitSha.slice(0, 7)} to ${store.target}.` : `Saved to ${store.target}.`,
        commitUrl: saved.commitUrl,
        commitSha: saved.commitSha,
        live: "Live once your site rebuilds from the commit.",
      }
    : {
        message: `Saved to the local ${file} file.`,
        commitUrl: null,
        commitSha: null,
        live: "Local fs store, no commit: reload the dev site to see it.",
      };
}

export async function saveWholeFile<D>(editor: Editor<D>, prev: FormState<D>, formData: FormData): Promise<FormState<D>> {
  const draft = editor.read(formData);
  const shaValue = formData.get("sha");
  const sha = typeof shaValue === "string" ? shaValue : "";
  const base = { draft, sha, rev: prev.rev + 1, errors: {}, formError: null, saved: null, focus: `${editor.key}-status` };
  const fail = (formError: string, errors: Record<string, string> = {}): FormState<D> => ({ ...base, formError, errors });

  // The session check comes first, before any store access.
  const gate = await adminGate();
  if (gate.state !== "admin") return fail(gate.state === "unconfigured" ? NOT_CONFIGURED : DENIED);

  const intent = parseIntent(formData.get("intent"));
  if (intent === null) return fail("Unknown button.");
  if (intent !== "save") {
    const next = editor.op(draft, intent);
    return next ? { ...base, draft: next.draft, focus: next.focus } : fail("Unknown button.");
  }

  const store = createStore(cms(), gate.config.store);
  try {
    const current = await store.read(editor.file);
    if (current.sha !== sha) return fail(STALE_MESSAGE);
    const result = editor.validate(editor.merge(current.data, draft));
    if (!result.ok) {
      const { errors, other } = splitIssues(result.issues, editor.owns, editor.fields);
      const count = Object.keys(errors).length;
      const lead = count ? `Fix ${count} field${count === 1 ? "" : "s"} below. Nothing was saved.` : "Nothing was saved.";
      return fail([lead, ...other].join(" "), errors);
    }
    const saved = await store.write(editor.file, result.data, { sha, message: editor.commitMessage });
    return {
      ...base,
      draft: editor.toDraft(result.data),
      sha: saved.sha,
      saved: liveNote(store, editor.file, saved),
    };
  } catch (error) {
    if (error instanceof StaleContentError) return fail(STALE_MESSAGE);
    if (error instanceof StoreError) return fail(`${error.message}. Nothing was saved.`);
    console.error("admin save failed", error instanceof Error ? error.name : "unknown");
    return fail("Saving failed. Nothing was saved.");
  }
}

