/** The config the package's own tests run against (aliased as gitms-site-config). */
import { defineGitms } from "../src/config";

export default defineGitms({
  basePath: "/admin",
  siteUrl: "https://example.com/",
  hosts: ["www.example.com"],
  timeZone: "America/New_York",
  brand: { name: "editor@example" },
  posts: {
    file: "content/posts.json",
    route: "/blog/:slug",
    reservedSlugs: ["page", "tag"],
    fields: {
      category: { type: "text", label: "Category", pattern: "[a-z0-9][a-z0-9-]{0,31}", patternMessage: "Use lowercase letters, digits or dashes", lowercase: true, suggest: true, default: "notes" },
      mood: { type: "select", label: "Mood", options: ["calm", "busy"] },
    },
  },
  pages: { file: "content/pages.json", reservedSlugs: ["blog", "contact"] },
  redirects: { file: "content/redirects.json", routes: ["/", "/blog", "/contact"] },
  uploads: { dir: "public/uploads", publicPath: "/uploads" },
});
