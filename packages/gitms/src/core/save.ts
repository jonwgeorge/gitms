/**
 * The save path for the admin's list/edit pages: read the file, apply one
 * change (add, edit, delete or reorder one item), validate the whole file and
 * commit it. Each edit form carries a fingerprint of the item as it was
 * loaded, so a save never overwrites a change made elsewhere in the meantime;
 * edits to other items of the same file go through. Server-only.
 */
import { adminGate } from "./auth";
import { DRAFT_NOTE } from "./drafts";
import { cms } from "../runtime";
import type { ContentIssue, Validation } from "./schema";
import { StaleContentError, StoreError, blobSha, createStore, type ContentFile } from "./store";

/** A short, stable hash of an item as stored (the stale-edit check). */
export const fingerprint = (value: unknown) => blobSha(JSON.stringify(value ?? null));

export type FailCode = "denied" | "unconfigured" | "stale" | "missing" | "invalid" | "store";

export type Change = { readonly data: unknown } | { readonly error: Exclude<FailCode, "denied" | "unconfigured" | "store">; readonly message?: string };

export type Outcome =
  | { readonly ok: true; readonly data: unknown; readonly commitSha: string | null; readonly commitUrl: string | null; readonly kind: "github" | "fs"; readonly target: string }
  | { readonly ok: false; readonly code: FailCode; readonly message?: string; readonly issues?: readonly ContentIssue[] };

export const FAIL_TEXT: Record<FailCode, string> = {
  denied: "You are not logged in (or your session expired). Log in again; nothing was saved.",
  unconfigured: "The admin is not configured on this server, so nothing can be saved.",
  stale: "This changed since you opened the page (another tab or a direct commit), so nothing was saved. Reload to get the latest version, then redo your edit.",
  missing: "This item no longer exists (it was deleted or renamed elsewhere). Nothing was saved.",
  invalid: "Nothing was saved.",
  store: "Saving failed. Nothing was saved.",
};

const asRecord = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const looseList = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(asRecord) : []);
export { asRecord };

export async function mutate(
  file: ContentFile,
  message: string,
  change: (current: Record<string, unknown>) => Change,
  validate: (data: unknown) => Validation<unknown>,
): Promise<Outcome> {
  // The session check comes first, before any store access.
  const gate = await adminGate();
  if (gate.state !== "admin") return { ok: false, code: gate.state === "unconfigured" ? "unconfigured" : "denied" };
  const store = createStore(cms(), gate.config.store);
  try {
    const current = await store.read(file);
    const next = change(asRecord(current.data));
    if ("error" in next) return { ok: false, code: next.error, message: next.message };
    const result = validate(next.data);
    if (!result.ok) return { ok: false, code: "invalid", issues: result.issues };
    const saved = await store.write(file, result.data, { sha: current.sha, message });
    return { ok: true, data: result.data, commitSha: saved.commitSha, commitUrl: saved.commitUrl, kind: store.kind, target: store.target };
  } catch (error) {
    if (error instanceof StaleContentError) return { ok: false, code: "stale" };
    if (error instanceof StoreError) return { ok: false, code: "store", message: `${error.message}. Nothing was saved.` };
    console.error("admin save failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, code: "store" };
  }
}

/** The query string a redirect carries after a successful action (read by <Flash>). */
export function doneQuery(done: string, outcome: Extract<Outcome, { ok: true }>): string {
  const q = new URLSearchParams({ done });
  if (outcome.commitSha) q.set("commit", outcome.commitSha);
  return `?${q}`;
}

/** The "Saved" note an edit form shows when it stays on the page. Pass `draft` when the saved item is a draft. */
export function savedNote(outcome: Extract<Outcome, { ok: true }>, draft = false) {
  return outcome.kind === "github"
    ? {
        message: outcome.commitSha ? `Saved. Committed ${outcome.commitSha.slice(0, 7)} to ${outcome.target}.` : `Saved to ${outcome.target}.`,
        commitUrl: outcome.commitUrl,
        commitSha: outcome.commitSha,
        live: draft ? DRAFT_NOTE : "Live once your site rebuilds from the commit.",
      }
    : { message: "Saved to the local content files.", commitUrl: null, commitSha: null, live: "Local fs store, no commit: reload the dev site to see it." };
}

/**
 * Splits validation issues for one item (at `prefix`, e.g. `posts.3`) into
 * field errors keyed by the form's own field names and a list for the summary.
 */
export function itemErrors(issues: readonly ContentIssue[], prefix: string, fields: readonly string[]) {
  const errors: Record<string, string> = {};
  const other: string[] = [];
  for (const { path, message } of issues) {
    const rest = path.startsWith(`${prefix}.`) ? path.slice(prefix.length + 1) : null;
    const field = rest?.split(".")[0];
    if (field && fields.includes(field)) errors[field] ??= message;
    else other.push(`${path || "file"}: ${message}`);
  }
  return { errors, other };
}
