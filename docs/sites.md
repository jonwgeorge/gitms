# Using gitms in your sites

gitms isn't published to npm. Each site installs it straight from this
repository, and a small workflow in each site moves it to the newest gitms
whenever `main` changes here. Change gitms once, and every site picks it up.

## Installing

```sh
npm install github:jonwgeorge/gitms#main
```

`package.json` keeps `"gitms": "github:jonwgeorge/gitms#main"`, and
`package-lock.json` pins the exact commit, so builds are repeatable until the
site is updated. To hold a site back, use a commit or tag instead of `main`
(`#v0.2.0`).

## If the repository is private

Anything that runs `npm install` or `npm ci` for a site needs read access to
this repository: the site's GitHub Actions and its host's build.

1. Make a [fine-grained token](https://github.com/settings/personal-access-tokens/new)
   with access to **only the gitms repository** and **Contents: read**. Give
   it an expiry and a calendar reminder.
2. Let git use it for GitHub URLs. npm records GitHub dependencies as
   `git+ssh://` in the lockfile, so rewrite both forms. Set these environment
   variables wherever the site is built (on Cloudflare: Workers & Pages → the
   project → Settings → Build → Variables and secrets; on GitHub Actions they're
   already in the update workflow):

   ```sh
   GIT_CONFIG_COUNT=2
   GIT_CONFIG_KEY_0=url.https://x-access-token:<token>@github.com/.insteadOf
   GIT_CONFIG_VALUE_0=ssh://git@github.com/
   GIT_CONFIG_KEY_1=url.https://x-access-token:<token>@github.com/.insteadOf
   GIT_CONFIG_VALUE_1=https://github.com/
   ```

   Mark the two `KEY` values as secrets, since they contain the token.

A public repository needs none of this.

## Keeping every site up to date

**In each site**, copy [`templates/update-gitms.yml`](../templates/update-gitms.yml)
to `.github/workflows/update-gitms.yml`. It:

1. moves the site to the newest gitms on `main`,
2. runs the site's `typecheck`, `test` and `build` scripts,
3. commits the update to the default branch if they pass. Your host deploys it
   like any other push.

If a check fails, nothing is committed and GitHub emails you about the failed
run, so a gitms change can't break a site silently. The workflow runs daily,
by hand from the Actions tab, and when gitms tells it to.

If gitms is private, add the read token from above as the site's
`GITMS_READ_TOKEN` repository secret.

**In gitms**, so sites update within minutes rather than by the next daily
run, set:

- a repository **variable** `GITMS_SITES`: your site repos, space-separated,
  e.g. `owner/site-one owner/site-two`
- a repository **secret** `GITMS_SITES_TOKEN`: a fine-grained token on those
  site repos with **Contents: read and write** (that's what GitHub requires to
  send them an event)

After CI passes on `main`, the "Notify sites" workflow sends each site a
`gitms-updated` event. Without these two settings it does nothing, and the
daily run still keeps sites current.

## Update notices in the admin

The admin dashboard tells you when a newer gitms is out. `withGitms()` records
the gitms commit each build was made with (from `package-lock.json`), and the
dashboard compares it with the newest commit on gitms's `main`, at most once an
hour. When the site is behind, it lists the new changes and offers
**Update now**; the Publishing panel always shows the running version.

**Update now** sends the site's repository the same `gitms-updated` event that
gitms sends after CI, so the site's "Update gitms" workflow (above) runs right
away: it moves to the newest gitms, checks the site builds, and commits. Your
host deploys it as usual, and the notice goes away once that deploy is live. If
you don't press it, the workflow's daily run does the same.

It uses the admin's existing `GITMS_GITHUB_TOKEN` (Contents: read and write is
what GitHub requires to send the event), so there's nothing new to set up as
long as the site has the update workflow. The check reads gitms with that token
too; if gitms is private and that token can't read it, set
`GITMS_SOURCE_TOKEN` on the host to the read-only token from above. With the
local file store (`next dev`), Update now isn't available: run
`npm install github:jonwgeorge/gitms#main` instead.

## Changing gitms safely

Everything on `main` reaches every site, so:

- work on a branch and merge through a pull request; CI runs the tests and
  builds the example site first
- keep config changes backwards compatible, or update the sites' configs
  before merging
- to try a change on one site first, point that site at the branch
  (`github:jonwgeorge/gitms#my-branch`), then back to `main` once it's merged
