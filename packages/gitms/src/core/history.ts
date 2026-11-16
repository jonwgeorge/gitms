/**
 * Version history of one post or page, built from the commits that
 * touched its content file: each commit's copy of the file is read, the item
 * is picked out by slug, and runs of identical copies collapse into one
 * version. Server-only (it goes through the store).
 */
import { fingerprint, looseList } from "./save";
import type { ContentStore, Revision } from "./store";

/** The content files whose items have history, and the list each keeps them in. */
export const HISTORY_KINDS = {
  posts: { file: "posts", list: "posts", section: "/posts", noun: "post" },
  pages: { file: "pages", list: "pages", section: "/pages", noun: "page" },
} as const;

export type HistoryKind = keyof typeof HISTORY_KINDS;

/** Commits read per history page: one GitHub call each, well inside the Workers subrequest limit. */
export const HISTORY_DEPTH = 20;

export type Version = {
  /** The oldest commit (in the window read) whose copy of the file holds this version. */
  readonly commit: Revision;
  readonly item: Record<string, unknown>;
  readonly fingerprint: string;
  /** Same as the item as it stands now. */
  readonly current: boolean;
  /** Top-level fields that differ from the current item. */
  readonly changed: readonly string[];
};

export function itemIn(data: unknown, list: string, slug: string): Record<string, unknown> | undefined {
  const d = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  return looseList(d[list]).find((x) => x.slug === slug);
}

/** Field names whose values differ between two items (missing counts as differing). */
export function changedFields(a: Record<string, unknown>, b: Record<string, unknown> | undefined): string[] {
  if (!b) return [];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
}

/**
 * Collapses `[commit, item-or-undefined]` pairs (newest first) into versions:
 * consecutive commits with the same copy of the item become one version dated
 * by the oldest of them, i.e. the commit that introduced it. Commits where the
 * item didn't exist (before it was created, or under another slug) are skipped.
 */
export function collapse(
  snaps: readonly (readonly [Revision, Record<string, unknown> | undefined])[],
  now: Record<string, unknown> | undefined,
): Version[] {
  const nowPrint = now ? fingerprint(now) : null;
  const out: Version[] = [];
  let lastPrint: string | null = null;
  for (const [commit, item] of snaps) {
    if (!item) {
      lastPrint = null;
      continue;
    }
    const print = fingerprint(item);
    if (print === lastPrint) {
      // Same version, older commit: it was introduced at least this early.
      out[out.length - 1] = { ...out[out.length - 1], commit };
      continue;
    }
    lastPrint = print;
    out.push({ commit, item, fingerprint: print, current: print === nowPrint, changed: changedFields(item, now) });
  }
  return out;
}

/** The versions of item `slug` in the last HISTORY_DEPTH commits of its file. */
export async function itemHistory(store: ContentStore, kind: HistoryKind, slug: string, now: Record<string, unknown> | undefined) {
  const { file, list } = HISTORY_KINDS[kind];
  const commits = await store.history(file, HISTORY_DEPTH);
  const snaps = await Promise.all(commits.map(async (c) => [c, itemIn(await store.readAt(file, c.sha), list, slug)] as const));
  return { versions: collapse(snaps, now), truncated: commits.length >= HISTORY_DEPTH };
}
