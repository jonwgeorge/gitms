import type { Editor } from "gitms/server";
import { siteSchema, type SiteSettings } from "@/lib/site-schema";

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function toSiteDraft(content: unknown): SiteSettings {
  const site = (content as { site?: Record<string, unknown> } | null)?.site ?? {};
  return { title: str(site.title), tagline: str(site.tagline) };
}

/** How the Site form maps to content/site.json. */
export const siteEditor: Editor<SiteSettings> = {
  key: "site",
  file: "site",
  commitMessage: "site: update title and tagline",
  read: (fd) => ({ title: str(fd.get("site.title")), tagline: str(fd.get("site.tagline")) }),
  op: () => null, // no lists in this form
  merge: (_current, draft) => ({ site: { title: draft.title.trim(), tagline: draft.tagline.trim() } }),
  validate: (content) => {
    const r = siteSchema.safeParse(content);
    return r.success ? { ok: true, data: r.data } : { ok: false, issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  },
  owns: (path) => path.startsWith("site."),
  fields: [/^site\.(title|tagline)$/],
  toDraft: toSiteDraft,
};
