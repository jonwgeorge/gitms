/**
 * Everything gitms needs to know about this site. Pure data, so next.config
 * imports it too. Secrets come from the environment (see .env.example).
 */
import { defineGitms } from "gitms";
import { siteSchema } from "./lib/site-schema";

export default defineGitms({
  siteUrl: "https://example.com/",
  timeZone: "America/New_York",
  brand: { name: "editor@example" },
  posts: {
    file: "content/posts.json",
    route: "/blog/:slug",
    fields: {
      category: { type: "text", label: "Category", pattern: "[a-z0-9-]{1,32}", patternMessage: "Lowercase letters, digits and dashes", lowercase: true, suggest: true, default: "notes" },
    },
  },
  pages: { file: "content/pages.json", reservedSlugs: ["blog"] },
  redirects: { file: "content/redirects.json", routes: ["/", "/blog"] },
  uploads: { dir: "public/uploads", publicPath: "/uploads" },
  sections: [{ slug: "site", label: "Site" }],
  files: { site: { path: "content/site.json", schema: siteSchema } },
});
