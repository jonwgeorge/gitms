# Example blog

A small Next.js site using gitms: posts with a custom `category` field, pages,
redirects, uploads, draft previews and a custom "Site" section that edits
`content/site.json`.

```sh
# from the repository root
npm install
cd examples/blog
cp .env.example .env.local   # then fill in the two values below
npx gitms hash               # → GITMS_ADMIN_PASSWORD_HASH
npx gitms secret             # → GITMS_ADMIN_SESSION_SECRET
npm run dev
```

Open http://localhost:3000/admin. In `next dev` saves go to the files in
`content/`; see [the setup guide](../../docs/setup.md) for production.

Where things are:

- `gitms.config.ts`: the config
- `next.config.ts`, `proxy.ts`: the two Next.js hooks
- `app/admin/[[...gitms]]/`: the admin page, the preview components and the Site section
- `lib/content.ts`: reading content in the site's pages
