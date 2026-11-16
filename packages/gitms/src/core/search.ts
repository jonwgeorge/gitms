/** The admin post list's search (client-safe). */

/** Whether a post matches a search: every word appears in its title, slug or one of its text fields, ignoring case. */
export function matchesSearch(post: Record<string, unknown>, query: string, fields: readonly string[] = []): boolean {
  const hay = ["title", "slug", ...fields]
    .map((k) => post[k])
    .filter((v): v is string => typeof v === "string")
    .join("\n")
    .toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}
