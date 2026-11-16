/** The redirect form's model (client-safe). */

export type RedirectDraft = { from: string; to: string; permanent: boolean };

export const emptyRedirect = (): RedirectDraft => ({ from: "", to: "", permanent: true });

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A pasted link to this site (any of its hosts), with or without the scheme. */
const siteOrigin = (hosts: readonly string[]) => new RegExp(`^(?:https?:\\/\\/)?(?:${hosts.map(escape).join("|")})(?=\\/|$)`, "i");
const get = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v.slice(0, 1000) : "";
};

/**
 * Tidies a typed old URL into a path: a pasted link to this site loses its
 * origin, the leading slash is added and a trailing slash dropped
 * (`example.com/old/` → `/old`). The schema judges what is left.
 */
export function normalizeFrom(value: string, hosts: readonly string[]): string {
  let v = hosts.length ? value.trim().replace(siteOrigin(hosts), "") : value.trim();
  if (v && !v.startsWith("/")) v = `/${v}`;
  return v.length > 1 ? v.replace(/\/+$/, "") : v;
}

/** A target on this site becomes a path; anything else is kept as typed. */
export function normalizeTo(value: string, hosts: readonly string[]): string {
  let v = hosts.length ? value.trim().replace(siteOrigin(hosts), "") : value.trim();
  if (v === "") return /^https?:/i.test(value.trim()) ? "/" : "";
  if (!v.startsWith("/") && !/^[a-z]+:/i.test(v)) v = `/${v}`;
  return v;
}

export function readRedirectDraft(fd: FormData): RedirectDraft {
  return { from: get(fd, "from"), to: get(fd, "to"), permanent: get(fd, "permanent") === "on" };
}

/** The stored redirect (the schema then judges it). */
export const redirectContent = (d: RedirectDraft, hosts: readonly string[]) => ({ from: normalizeFrom(d.from, hosts), to: normalizeTo(d.to, hosts), permanent: d.permanent });
