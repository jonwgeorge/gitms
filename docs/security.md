# Security

gitms is built for one editor (or a few sharing a password) on a public site.
This is how it's protected and what it relies on.

## Sign-in

- The password is checked against an scrypt hash
  (`GITMS_ADMIN_PASSWORD_HASH`) in constant time. The password itself is never
  stored.
- A session is a stateless signed cookie (HMAC-SHA256 with
  `GITMS_ADMIN_SESSION_SECRET`), valid for 12 hours, `HttpOnly`, `Secure`,
  `SameSite=Strict` and scoped to the admin path. Rotating the secret signs
  everyone out.
- Failed logins are delayed and limited per client address in memory. On
  serverless hosts each instance has its own memory, so this slows guessing
  rather than stopping it: use a long random password.
- The client address comes from `clientIpHeader`. It must be a header your host
  sets itself and a client can't forge (`cf-connecting-ip` on Cloudflare,
  `x-real-ip` on Vercel). Never use `x-forwarded-for` from an untrusted edge.

## Every request

- `proxy.ts` sends signed-out requests to the login page and marks every admin
  response `noindex` and `no-store`. That's only the first line: every admin
  page and server action checks the session again itself.
- Server actions are protected against cross-site posts by Next.js's origin
  check, and the session cookie is `SameSite=Strict`.

## Saves

- Content is validated against the schema before it's written; invalid content
  is never committed.
- Each save sends the version it started from. If the item (or file) changed
  since, the save is refused, so two tabs can't silently overwrite each other.
- Uploads are identified by their bytes (PNG, JPEG, GIF, WebP, AVIF only),
  renamed, size-limited and written under the configured folder only. SVG is
  refused (it can carry script).
- Markdown links only allow site paths, `#anchors`, `http(s):` and `mailto:`;
  images only site paths. Anything else renders as text, and raw HTML is never
  rendered.
- Redirect targets are site paths or `https:` URLs, and redirects can't hide
  the site's own routes.

## The GitHub token

Use a fine-grained token limited to the one repository, with only **Contents:
read and write**. It never reaches the browser. Anyone who can sign in to the
admin can change what that token can change, so treat the admin password like
a deploy key.

## Reporting a problem

Please report security issues privately through GitHub's "Report a
vulnerability" on this repository rather than in a public issue.
