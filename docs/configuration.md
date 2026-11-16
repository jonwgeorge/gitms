# Configuration

Everything goes through `defineGitms()` in `gitms.config.ts`. It checks the
config when your app starts and throws a readable error for anything invalid.
Only `siteUrl` is required; leave a section out and the admin doesn't show it.

```ts
import { defineGitms } from "gitms";

export default defineGitms({
  basePath: "/admin",
  siteUrl: "https://example.com/",
  hosts: ["www.example.com"],
  timeZone: "Europe/Berlin",
  brand: { name: "editor@example" },
  clientIpHeader: "cf-connecting-ip",
  posts: { ... },
  pages: { ... },
  redirects: { ... },
  uploads: { ... },
  sections: [ ... ],
  files: { ... },
});
```

## Top level

| Option | Default | |
| --- | --- | --- |
| `siteUrl` | (required) | The canonical URL, e.g. `https://example.com/`. |
| `basePath` | `"/admin"` | Where the admin lives. Must match the folder in `app/` and the proxy matcher. |
| `hosts` | `[]` | Extra hostnames that count as this site when someone pastes a full URL into a redirect. The `siteUrl` host is always included. |
| `timeZone` | `"UTC"` | IANA zone the editor shows and takes post dates in. Dates are stored as ISO 8601 with the offset. |
| `brand.name` | `"admin"` | Shown at the top of the admin sidebar. |
| `userAgent` | `"gitms"` | Sent to the GitHub API. |
| `clientIpHeader` | `"cf-connecting-ip"` | The request header with the client's IP, for login throttling. It must be one your host sets itself; see [security.md](security.md). |

## `posts`

```ts
posts: {
  file: "content/posts.json",
  route: "/blog/:slug",
  label: "Blog",
  reservedSlugs: ["tag", "page"],
  max: 1000,
  fields: {
    category: { type: "text", label: "Category", suggest: true, lowercase: true },
    mood: { type: "select", label: "Mood", options: ["calm", "busy"] },
  },
},
```

| Option | Default | |
| --- | --- | --- |
| `file` | (required) | Repo-relative JSON file holding `{ "posts": [...] }`. |
| `route` | (required) | The public URL of a post; `:slug` is replaced. |
| `label` | `"Posts"` | Sidebar and heading label. |
| `reservedSlugs` | `[]` | Slugs a post can't take because your own routes use them. |
| `max` | `1000` | Most posts the file may hold. |
| `fields` | `{}` | Your own fields, shown under the title in the editor. |

Every post has `slug`, `title`, `at` (ISO date-time), `body` (markdown), and
optionally `draft`, `description` and `shareImage`. A post with an empty body
has no page of its own: it's a short entry for lists.

### Custom fields

Stored on each post under their key. The first two show as columns in the post
list and are searched.

**Text**: `{ type: "text", label, required?, pattern?, patternMessage?, maxLength?, lowercase?, suggest?, default?, hint? }`

- `required` defaults to `true`; an empty optional field is left out of the file.
- `pattern` is a regular expression the whole trimmed value must match.
- `suggest` offers the values other posts already use.

**Select**: `{ type: "select", label, options, default?, hint? }`. The first
option is the default.

Field names must start with a lowercase letter, be letters and digits only, and
not reuse a built-in name (`slug`, `title`, `at`, `draft`, `description`,
`shareImage`, `body`, `status`).

## `pages`

```ts
pages: { file: "content/pages.json", route: "/:slug", nav: true, reservedSlugs: ["blog", "contact"] },
```

| Option | Default | |
| --- | --- | --- |
| `file` | (required) | Repo-relative JSON file holding `{ "pages": [...] }`. |
| `route` | `"/:slug"` | The public URL of a page. |
| `label` | `"Pages"` | |
| `reservedSlugs` | `[]` | Your own top-level routes. The admin's own segment is always reserved. |
| `nav` | `true` | Offer a "Show in the site navigation" box, stored as `nav: true`. |
| `max` | `200` | |

## `redirects`

```ts
redirects: {
  file: "content/redirects.json",
  routes: ["/", "/blog", "/contact"],
  routePrefixes: ["/api"],
  builtIn: [{ source: "/feed", destination: "/rss.xml", permanent: true, label: "Old feed URL" }],
},
```

| Option | Default | |
| --- | --- | --- |
| `file` | (required) | Repo-relative JSON file holding `{ "redirects": [...] }`. |
| `routes` | `["/"]` | Exact paths your site serves; a redirect can't start at one (it would hide the page). |
| `routePrefixes` | `[]` | Path prefixes your site serves. The admin path and `/_next` are always included. |
| `builtIn` | `[]` | Redirects kept in code. They're served after the editable ones and shown read-only in the admin. |

A redirect whose old URL is a live page or post again is skipped, so a
redirect never hides content. Chains and loops are refused when saving.

## `uploads`

```ts
uploads: { dir: "public/uploads", publicPath: "/uploads", maxBytes: 5 * 1024 * 1024 },
```

Images (PNG, JPEG, GIF, WebP, AVIF, checked by their bytes, not their name)
are committed under `<dir>/<yyyy>/<mm>/` with a content hash in the name, so
uploading the same file twice reuses it. Leave `uploads` out to turn uploads
off.

## `sections` and `files`

Your own admin screens and the content files they edit. See
[custom-sections.md](custom-sections.md).

```ts
sections: [{ slug: "settings", label: "Settings" }],
files: { settings: { path: "content/settings.json", schema: settingsSchema } },
```

Each section gets a sidebar link and a dashboard tile, except a settings
section (label or slug "Settings"), which is in the sidebar only. Set
`dashboard: false` or `true` on a section to choose for yourself.

## Environment variables

Each is read as `GITMS_<NAME>` first, then as the bare name.

| Variable | |
| --- | --- |
| `GITMS_ADMIN_PASSWORD_HASH` | From `npx gitms hash`. |
| `GITMS_ADMIN_SESSION_SECRET` | 32+ characters; from `npx gitms secret`. Changing it signs everyone out. |
| `GITMS_ADMIN_STORE` | `fs` or `github`. Defaults to `fs` in `next dev` and `github` otherwise. |
| `GITMS_GITHUB_TOKEN` | Fine-grained token, this repo only, Contents read and write. |
| `GITMS_GITHUB_REPO` | `owner/name`. |
| `GITMS_GITHUB_BRANCH` | Defaults to `main`. |
