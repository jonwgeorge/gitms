/**
 * The editor's form model. A draft is what the form shows (all strings, as
 * typed); each field's `name` is its path in the content file, e.g.
 * `social.1.href`, so schema issues map straight back to the field. Pure: the
 * client forms import it too.
 */

export type FieldErrors = Readonly<Record<string, string>>;

export type SavedNote = {
  readonly message: string;
  readonly commitUrl: string | null;
  readonly commitSha: string | null;
  readonly live: string;
};

export type FormState<D> = {
  readonly draft: D;
  /** Blob sha of the file this draft was loaded from (the stale-edit check). */
  readonly sha: string;
  /** Bumped whenever the server returns a new draft, so the form remounts with it. */
  readonly rev: number;
  readonly errors: FieldErrors;
  readonly formError: string | null;
  readonly saved: SavedNote | null;
  /** Element id to focus after the update (keeps keyboard users in place). */
  readonly focus: string | null;
};

/** `social.1.href` → `f-social-1-href`. */
export const fieldId = (name: string) => `f-${name.replace(/\./g, "-")}`;
export const errorId = (name: string) => `${fieldId(name)}-error`;
export const buttonId = (op: string, list: string, index?: number) =>
  `btn-${op}-${list.replace(/\./g, "-")}${index === undefined ? "" : `-${index}`}`;

export function initialState<D>(draft: D, sha: string): FormState<D> {
  return { draft, sha, rev: 0, errors: {}, formError: null, saved: null, focus: null };
}

/** `os, linux,, kde plasma` → `["os", "linux", "kde plasma"]` (blanks dropped). */
export const splitTags = (v: string) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/* ---------- FormData → draft ---------- */

const MAX_ROWS = 100;
const MAX_VALUE = 4000;

export const formValue = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v.slice(0, MAX_VALUE) : "";
};

/** Sorted row indices present under `prefix.<i>` (or `prefix.<i>.<key>`). */
export function indices(fd: FormData, prefix: string): number[] {
  const re = new RegExp(`^${prefix.replace(/\./g, "\\.")}\\.(\\d{1,3})(?:\\.|$)`);
  const found = new Set<number>();
  for (const key of fd.keys()) {
    const m = re.exec(key);
    if (m && Number(m[1]) < MAX_ROWS) found.add(Number(m[1]));
  }
  return [...found].sort((a, b) => a - b);
}

export function rows<K extends string>(fd: FormData, prefix: string, keys: readonly K[]): Record<K, string>[] {
  return indices(fd, prefix).map(
    (i) => Object.fromEntries(keys.map((k) => [k, formValue(fd, `${prefix}.${i}.${k}`)])) as Record<K, string>,
  );
}

/* ---------- list buttons: add / delete / move ---------- */

export type ListOp =
  | { readonly op: "add"; readonly list: string; readonly variant: string }
  | { readonly op: "del" | "up" | "down"; readonly list: string; readonly index: number };

export type Intent = "save" | ListOp;

/** `save`, `add:<list>[:<variant>]`, or `del|up|down:<list>:<index>`. */
export function parseIntent(value: FormDataEntryValue | null): Intent | null {
  if (value === null || value === "" || value === "save") return "save";
  if (typeof value !== "string") return null;
  let m = /^add:([a-z.]{1,20})(?::([a-z]{1,10}))?$/.exec(value);
  if (m) return { op: "add", list: m[1], variant: m[2] ?? "" };
  m = /^(del|up|down):([a-z.]{1,20}):(\d{1,3})$/.exec(value);
  if (m) return { op: m[1] as "del" | "up" | "down", list: m[2], index: Number(m[3]) };
  return null;
}

/**
 * Applies a list op and says what to focus next: the new row's first field,
 * the same move button at the row's new place, or the list's add button.
 */
export function editList<T>(
  items: readonly T[],
  op: ListOp,
  make: () => T,
  firstField: string,
): { items: T[]; focus: string } {
  const out = [...items];
  if (op.op === "add") {
    if (out.length >= MAX_ROWS) return { items: out, focus: buttonId("add", op.list, undefined) };
    out.push(make());
    return { items: out, focus: fieldId(`${op.list}.${out.length - 1}.${firstField}`.replace(/\.$/, "")) };
  }
  const i = op.index;
  if (i < 0 || i >= out.length) return { items: out, focus: buttonId("add", op.list) };
  if (op.op === "del") {
    out.splice(i, 1);
    return { items: out, focus: buttonId("add", op.list) };
  }
  const j = op.op === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= out.length) return { items: out, focus: buttonId(op.op, op.list, i) };
  [out[i], out[j]] = [out[j], out[i]];
  return { items: out, focus: buttonId(op.op, op.list, j) };
}

/**
 * Splits schema issues into errors on this form's fields and a summary for
 * anything else (e.g. a problem elsewhere in the same file). `fields` are
 * regexes for the form's own field paths, e.g. `/^social\.\d+\.[a-z]+$/`; an
 * issue deeper than a field lands on that field.
 */
export function splitIssues(
  issues: readonly { path: string; message: string }[],
  owns: (path: string) => boolean,
  fields: readonly RegExp[],
): { errors: Record<string, string>; other: string[] } {
  const isField = (path: string) => fields.some((re) => re.test(path));
  const fieldFor = (path: string) => {
    const parts = path.split(".");
    for (let n = parts.length - 1; n > 0; n--) {
      const candidate = parts.slice(0, n).join(".");
      if (isField(candidate)) return candidate;
    }
    return null;
  };
  const errors: Record<string, string> = {};
  const other: string[] = [];
  for (const { path, message } of issues) {
    if (owns(path) && isField(path)) errors[path] ??= message;
    else if (owns(path)) {
      const field = fieldFor(path);
      if (field) errors[field] ??= message;
      else other.push(`${path || "file"}: ${message}`);
    } else other.push(`${path || "file"}: ${message}`);
  }
  return { errors, other };
}

const SINGLE: Record<string, string> = {
  at: "Date and time",
  from: "Old URL",
  to: "Redirects to",
  shareImage: "Share image",
};

/** A readable name for a field path, for the error summary: `labels` first, then `items.1.name` → `Item 2 name`, `title` → `Title`. */
export function fieldLabel(path: string, labels: Readonly<Record<string, string>> = {}): string {
  if (Object.hasOwn(labels, path)) return labels[path];
  if (Object.hasOwn(SINGLE, path)) return SINGLE[path];
  const m = /^([a-zA-Z]+)\.(\d+)(?:\.([a-zA-Z]+))?$/.exec(path);
  if (m) {
    const row = labels[m[1]] ?? "Item";
    return `${row} ${Number(m[2]) + 1}${m[3] ? ` ${m[3]}` : ""}`;
  }
  return path ? path[0].toUpperCase() + path.slice(1) : path;
}

/** What a save note says instead of "Live after the deploy" when the item is a draft. */
export const DRAFT_NOTE = "This is a draft, so it stays off the site. Choose Published under Visibility and save to put it live.";
