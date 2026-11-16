# gitms

A small, Git-backed CMS for Next.js. Your content lives in your repo as JSON
with markdown bodies; every save in the admin is a commit.

> Work in progress. Not yet published to npm.

## Why

- **The repo is the database.** No server, no database, no vendor. Content is
  plain files you can read, diff and move.
- **Every save is a commit.** Backups, an audit log and per-item version
  history come from Git. Restore any past version from the admin.
- **Safe concurrent edits.** Each save changes one item and is refused if that
  item changed since you opened it.
- **Small.** One author, a password login, posts, pages, redirects and image
  uploads. Runs on Node or Cloudflare Workers.

## Planned features

- Posts (with drafts and scheduled publishing) and standalone pages
- Markdown editor with image upload (paste or drop), front matter paste
- Version history and restore, built from the content file's commits
- Redirects, including "redirect the old URL" when a slug is renamed
- Draft preview for signed-in editors
- Password login with signed sessions and login throttling
- Custom admin sections for your own singleton content

## License

[MIT](LICENSE)
