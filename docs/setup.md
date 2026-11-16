# Setup

gitms adds an admin to an existing Next.js 16 App Router site. It reads and
writes JSON files in your repository: in production through the GitHub API (a
save is a commit, your host rebuilds from it), and in `next dev` straight to
the files on disk.

## 1. Install

```sh
npm install gitms zod
```

## 2. Write the config

`gitms.config.ts` at the project root. It's plain data (no React), so
`next.config.ts` can import it too.

```ts
import { defineGitms } from "gitms";

export default defineGitms({
  siteUrl: "https://example.com/",
  timeZone: "America/New_York",
  posts: { file: "content/posts.json", route: "/blog/:slug" },
  pages: { file: "content/pages.json", reservedSlugs: ["blog"] },
  redirects: { file: "content/redirects.json", routes: ["/", "/blog"] },
  uploads: { dir: "public/uploads", publicPath: "/uploads" },
});
```

Create the content files it names, even if empty:

```json
{ "posts": [] }
```

See [configuration.md](configuration.md) for every option.

## 3. Wire it into Next.js

**next.config.ts**

```ts
import { withGitms } from "gitms/next-config";
import cms from "./gitms.config";

export default withGitms(cms, { /* your Next config */ });
```

`withGitms` points the package at your config file (pass
`{ configFile: "./path/to/config.ts" }` as the third argument if it isn't
`./gitms.config.ts`), serves the redirects edited in the admin, raises the
server-action body limit for uploads and marks the admin `noindex`.

**proxy.ts** (Next 16's middleware)

```ts
export { gitmsProxy as proxy } from "gitms/proxy";

// Next reads this statically, so it's written out: keep it in step with basePath.
export const config = { matcher: ["/admin", "/admin/:path*"] };
```

If you already have a proxy, call `gitmsProxy(request)` from it for admin paths
(`isAdminPath(pathname)` tells you which) and add the two matchers.

**app/admin/[[...gitms]]/page.tsx**

```tsx
import { createAdmin } from "gitms/admin";

export const dynamic = "force-dynamic";
export { generateMetadata } from "gitms/admin";

export default createAdmin();
```

The folder name must match `basePath` (default `/admin`). Every admin screen is
served from this one file. `createAdmin()` also takes your preview components
and custom sections; see [content.md](content.md#previews) and
[custom-sections.md](custom-sections.md).

**tsconfig.json**: add the alias so TypeScript sees your config through the
package:

```json
{ "compilerOptions": { "paths": { "gitms-site-config": ["./gitms.config.ts"] } } }
```

The admin renders inside your root layout. If that layout draws your site's
header, move it into a route group (`app/(site)/layout.tsx`) so the admin gets
the whole window, as the example does.

## 4. Secrets

```sh
npx gitms hash     # prompts for a password, prints its hash
npx gitms secret   # prints a random session secret
```

Put them in `.env.local` for development:

```sh
GITMS_ADMIN_PASSWORD_HASH=scrypt:...
GITMS_ADMIN_SESSION_SECRET=...
```

Use a long random password (a password manager's 20+ characters): login
throttling slows guessing, but the password is the real defence.

Run `next dev` and open `/admin`. Saves go to the files in your working tree.

## 5. Production

In production gitms commits through the GitHub API. Make a
[fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
with access to **only this repository** and **Contents: read and write**, then
set these on your host:

```sh
GITMS_ADMIN_PASSWORD_HASH=scrypt:...
GITMS_ADMIN_SESSION_SECRET=...
GITMS_GITHUB_TOKEN=github_pat_...
GITMS_GITHUB_REPO=owner/name
GITMS_GITHUB_BRANCH=main        # optional, defaults to main
```

Your host must rebuild the site on each push to that branch (most do by
default), since the public pages are built from the content files.

The admin's pages say exactly which variable is missing or invalid, and refuse
logins and saves until everything is set.

### Hosts

- **Node (`next start`)**: works as is. Behind a proxy or load balancer, set
  `clientIpHeader` to the header it sets with the client's address.
- **Cloudflare Workers (OpenNext)**: works as is; `clientIpHeader` defaults
  to `cf-connecting-ip`. The local file store is refused on Workers.
- **Vercel**: should work with `clientIpHeader: "x-real-ip"`; not yet tested
  by the maintainers.

### Scheduled posts

A post dated in the future stays off the site until a build runs after that
time. If you schedule posts, add a scheduled job that triggers a rebuild (for
example a GitHub Actions `schedule` that calls your host's deploy hook).
