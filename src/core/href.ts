/** Pure link checks, shared by the schema and the admin forms (no zod, so client-safe). */

/** A relative link (`/path`, not `//host`) or an absolute `https:` URL. */
export function isSafeHref(value: string): boolean {
  // No whitespace, backslashes or control characters anywhere in a link.
  if ([...value].some((c) => c.charCodeAt(0) < 0x20 || c === "\\" || /\s/.test(c))) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (!value.startsWith("https://")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
  }
}
