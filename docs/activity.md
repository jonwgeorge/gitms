# Activity: a GitHub heat map

The Activity section puts a GitHub contribution heat map (the green squares
on a GitHub profile) on your site. The editor turns it on or off and picks
whose contributions it shows; your site fetches the calendar on the server and
draws it with `ContributionGraph`. No script runs in the visitor's browser and
no token is ever sent to it.

## 1. Turn the section on

```ts
// gitms.config.ts
activity: { file: "content/activity.json" },
```

and create the file:

```json
{ "activity": { "show": true, "github": "octocat" } }
```

The admin now has an Activity section (and a dashboard tile) for both values.

## 2. Draw it

```tsx
// app/page.tsx (a server component)
import cms from "@/gitms.config";
import activityFile from "@/content/activity.json";
import { ContributionGraph, fetchContributions, readActivity } from "gitms/activity";

const activity = readActivity(cms, activityFile); // bad content fails the build

export default async function Home() {
  const data = activity.show ? await fetchContributions(activity.github, { userAgent: cms.userAgent }) : null;
  return <main>{data ? <ContributionGraph data={data} /> : null}</main>;
}
```

`fetchContributions` never throws: if GitHub can't be reached it logs why and
returns `null`, so a GitHub outage leaves the graph out instead of failing
your build.

### Where the data comes from

- **With a token** (`GITMS_ACTIVITY_TOKEN` in the build's environment, or
  `fetchContributions(login, { token })`): GitHub's GraphQL API. Any token
  works, a fine-grained one with no permissions included; it only reads
  public data.
- **Without one**: the public calendar at
  `github.com/users/<login>/contributions`, the page your profile loads.
  Nothing to set up, but it isn't an official API, so the token route is the
  sturdier one.

Either way, the counts include private contributions only if the user turned
on "Include private contributions on my profile" on GitHub.

### Keeping it fresh

On a static site the graph is as fresh as the last build. Every admin save
rebuilds the site; to also roll it over each day, have a scheduled job ask
your host to rebuild (a deploy hook on Cloudflare Workers Builds, Vercel or
Netlify). On a host with ISR, pass
`init: { next: { revalidate: 3600 } }` instead.

## 3. Style it

`ContributionGraph` has GitHub-like greens by default. Set these on it or a
parent to match your site:

| Property | Default | |
| --- | --- | --- |
| `--gitms-activity-0` … `--gitms-activity-4` | grey, then four greens | Cell colours, from no contributions to most. |
| `--gitms-activity-cell` | `10px` | Cell size. |
| `--gitms-activity-gap` | `3px` | Space between cells. |
| `--gitms-activity-radius` | `2px` | Cell corners. |
| `--gitms-activity-label` | inherited colour | Month, day and legend text. |

The classes `gitms-activity`, `gitms-activity-cell` (with `data-level`) and
`gitms-activity-label` are stable hooks too. Props: `label` (what screen
readers hear instead of the cells), `footer` (shown under the graph, e.g. a
profile link) and `legend` (`["Less", "More"]` by default, `null` to drop it).

On narrow screens the graph scrolls sideways, starting at the newest week.
