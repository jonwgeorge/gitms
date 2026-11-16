# gitms

A small, Git-backed CMS for Next.js. Your content lives in your repo as JSON
with markdown bodies, and every save in the admin is a commit.

> Not published to npm: sites install it straight from GitHub, so a change
> here reaches every site that uses it. See [docs/sites.md](docs/sites.md).

## Why

- **The repo is the database.** No CMS server, no database, no vendor. Content
  is plain files you can read, diff and move.
- **Every save is a commit.** Backups, an audit log and per-item version
  history come from Git. Restore any past version from the admin.
- **Safe concurrent edits.** A save changes one item and is refused if that
  item changed since you opened it.
- **Small on purpose.** One editor with a password, posts, pages, redirects,
  image uploads and your own sections. Nothing else to run.

## What you get

- Posts with drafts, scheduled publishing and custom fields you define
- Standalone pages, optionally linked in your navigation
- A markdown editor with live preview, image upload (pick, paste or drop) and
  front-matter paste
- Version history and one-click restore, built from the content file's commits
- Redirects, offered automatically when you rename a published URL
- Draft preview rendered by your own components, for the signed-in editor only
- Password login (scrypt), signed 12-hour sessions, login throttling
- Your own admin sections for singleton content (site settings and the like)
- A notice on the dashboard when a newer gitms is out, with an "Update now"
  button (sites otherwise update themselves daily)

## Quick start

```sh
npm install github:jonwgeorge/gitms#main zod
```

Then follow [docs/setup.md](docs/setup.md): a config file, three small files in
your app, and two environment variables. The [example blog](examples/blog)
shows a complete site.

## Docs

- [Setup](docs/setup.md): install, wire it into Next.js, deploy
- [Using gitms in your sites](docs/sites.md): installing from GitHub and keeping every site up to date
- [Configuration](docs/configuration.md): every option of `defineGitms()`
- [Reading content](docs/content.md): using the content in your pages
- [Custom sections](docs/custom-sections.md): editing your own content files
- [Theming](docs/theming.md): making the admin look like your site
- [Security](docs/security.md): how the admin is protected, and what it trusts

## Requirements

Next.js 16 (App Router), React 19, Node 20+. The content store in production
is a GitHub repository; locally, `next dev` saves to the files on disk.

## Repository layout

- `src`, `bin`: the package (installed from this repo)
- `examples/blog`: a small site using it
- `templates/update-gitms.yml`: the workflow that keeps a site on the newest gitms

## License

[MIT](LICENSE)
