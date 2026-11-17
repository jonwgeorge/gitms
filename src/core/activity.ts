/**
 * The Activity section: a GitHub contribution heat map. The admin edits a
 * small settings file (show it or not, whose graph); the site fetches the
 * calendar on the server, usually while it builds, and renders it with
 * ContributionGraph. Nothing here runs in the browser, so a token never
 * reaches a visitor.
 */
import { z } from "zod";

/** A GitHub username: letters, digits and single dashes, not at either end, 39 at most. */
export const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export type ActivitySettings = {
  /** Show the heat map on the site. */
  readonly show: boolean;
  /** Whose contributions: a GitHub username. */
  readonly github: string;
};

export const activityFileSchema = z.strictObject({
  activity: z
    .strictObject({
      show: z.boolean(),
      github: z
        .string()
        .trim()
        .max(39, "A GitHub username is at most 39 characters")
        .refine((v) => v === "" || GITHUB_LOGIN.test(v), "Use a GitHub username, like octocat"),
    })
    .refine((a) => !a.show || a.github !== "", { path: ["github"], message: "Add a GitHub username to show the heat map" }),
});

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export type ContributionDay = {
  /** yyyy-mm-dd */
  readonly date: string;
  /** Null when GitHub's page didn't say (the level still does). */
  readonly count: number | null;
  /** GitHub's own shading, 0 (none) to 4 (most). */
  readonly level: ContributionLevel;
};

export type Contributions = {
  readonly login: string;
  /** Contributions in the period, as GitHub counts them. */
  readonly total: number;
  /** Oldest first, one per day. */
  readonly days: readonly ContributionDay[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toLevel = (n: number): ContributionLevel => (n >= 0 && n <= 4 ? (Math.trunc(n) as ContributionLevel) : 0);

/* ---------- GitHub's GraphQL API (with a token) ---------- */

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const LEVELS: Record<string, ContributionLevel> = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const apiSchema = z.object({
  data: z.object({
    user: z
      .object({
        contributionsCollection: z.object({
          contributionCalendar: z.object({
            totalContributions: z.number(),
            weeks: z.array(
              z.object({
                contributionDays: z.array(z.object({ date: z.string().regex(DATE), contributionCount: z.number(), contributionLevel: z.string() })),
              }),
            ),
          }),
        }),
      })
      .nullable(),
  }),
});

/** The calendar from a GraphQL response, or null if it isn't one. */
export function parseApiCalendar(login: string, json: unknown): Contributions | null {
  const parsed = apiSchema.safeParse(json);
  const calendar = parsed.success ? parsed.data.data.user?.contributionsCollection.contributionCalendar : null;
  if (!calendar) return null;
  const days = calendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount, level: LEVELS[d.contributionLevel] ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return days.length ? { login, total: calendar.totalContributions, days } : null;
}

/* ---------- the public profile calendar (no token) ---------- */

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/**
 * The calendar from github.com/users/<login>/contributions, the page the
 * profile graph loads. Each day is a <td data-date data-level id>, and its
 * count is in the <tool-tip for="<id>"> beside it ("3 contributions on …").
 * Returns null when the page has no calendar in it.
 */
export function parseProfileCalendar(login: string, html: string): Contributions | null {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/<tool-tip\b[^>]*>[^<]*<\/tool-tip>/g)) {
    const id = attr(m[0], "for");
    const text = />\s*(No|[\d,]+)\s+contributions?\b/i.exec(m[0]);
    if (id && text) counts.set(id, text[1].toLowerCase() === "no" ? 0 : Number(text[1].replace(/,/g, "")));
  }
  const byDate = new Map<string, ContributionDay>();
  for (const m of html.matchAll(/<td\b[^>]*>/g)) {
    const date = attr(m[0], "data-date");
    const level = attr(m[0], "data-level");
    if (!date || !DATE.test(date) || level === undefined || !/^\d$/.test(level)) continue;
    const id = attr(m[0], "id");
    byDate.set(date, { date, level: toLevel(Number(level)), count: id !== undefined && counts.has(id) ? counts.get(id)! : null });
  }
  if (byDate.size === 0) return null;
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const stated = /([\d,]+)\s+contributions?\s+in the last year/i.exec(html);
  const total = stated ? Number(stated[1].replace(/,/g, "")) : days.reduce((sum, d) => sum + (d.count ?? 0), 0);
  return { login, total, days };
}

/* ---------- fetching ---------- */

export type FetchContributionsOptions = {
  /**
   * A GitHub token for the GraphQL API (any token works; it only reads public
   * data). Defaults to the GITMS_ACTIVITY_TOKEN environment variable. Without
   * one, the public profile calendar is read instead.
   */
  readonly token?: string;
  /** Sent to GitHub. Pass your config's `userAgent`. */
  readonly userAgent?: string;
  /** Give up after this long. Defaults to 10 seconds. */
  readonly timeoutMs?: number;
  /** Extra fetch options, e.g. `{ next: { revalidate: 3600 } }` on a host with ISR. */
  readonly init?: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } };
  /** For tests. */
  readonly fetch?: typeof fetch;
};

/**
 * The last year of `login`'s GitHub contributions, or null if GitHub couldn't
 * be reached or answered with something unexpected (it logs why). Never
 * throws, so a GitHub outage can't fail a build: the site just leaves the
 * graph out. Server-only.
 */
export async function fetchContributions(login: string, options: FetchContributionsOptions = {}): Promise<Contributions | null> {
  if (!GITHUB_LOGIN.test(login)) return null;
  const token = options.token ?? process.env.GITMS_ACTIVITY_TOKEN ?? "";
  const doFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = { "User-Agent": options.userAgent ?? "gitms" };
  const signal = AbortSignal.timeout(options.timeoutMs ?? 10_000);
  try {
    if (token) {
      const res = await doFetch("https://api.github.com/graphql", {
        ...options.init,
        method: "POST",
        headers: { ...headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { login } }),
        signal,
      });
      if (!res.ok) throw new Error(`GitHub API answered ${res.status}`);
      const calendar = parseApiCalendar(login, await res.json());
      if (!calendar) throw new Error("no calendar in the GitHub API's answer");
      return calendar;
    }
    const res = await doFetch(`https://github.com/users/${encodeURIComponent(login)}/contributions`, {
      ...options.init,
      headers: { ...headers, Accept: "text/html" },
      signal,
    });
    if (!res.ok) throw new Error(`github.com answered ${res.status}`);
    const calendar = parseProfileCalendar(login, await res.text());
    if (!calendar) throw new Error("no calendar on the profile page");
    return calendar;
  } catch (error) {
    // Never the token: only what went wrong.
    console.warn(`gitms: couldn't load GitHub activity for ${login}: ${error instanceof Error ? error.message : "unknown error"}`);
    return null;
  }
}

/* ---------- layout ---------- */

export type CalendarWeek = {
  /** Sunday to Saturday; null pads the first and last weeks. */
  readonly days: readonly (ContributionDay | null)[];
  /** "Jan" on the first week that holds a month's first day (or the first week). */
  readonly month: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Days in week columns, Sunday on top, the way GitHub draws them. */
export function calendarWeeks(days: readonly ContributionDay[]): CalendarWeek[] {
  const weeks: (ContributionDay | null)[][] = [];
  let week: (ContributionDay | null)[] = [];
  for (const day of days) {
    const wd = weekday(day.date);
    if (week.length === 0) week = Array<ContributionDay | null>(wd).fill(null);
    else if (wd === 0) {
      weeks.push(week);
      week = [];
    }
    week.push(day);
  }
  if (week.length) weeks.push([...week, ...Array<null>(7 - week.length).fill(null)]);
  const monthOf = (d: ContributionDay) => MONTHS[Number(d.date.slice(5, 7)) - 1];
  const hasFirst = (w: readonly (ContributionDay | null)[]) => w.find((d) => d?.date.endsWith("-01")) ?? null;
  return weeks.map((w, i) => {
    const first = hasFirst(w);
    if (first) return { days: w, month: monthOf(first) };
    // The first week names its month too, unless the next month's label is right beside it.
    const opener = i === 0 ? w.find((d) => d !== null) : null;
    return { days: w, month: opener && !weeks.slice(1, 3).some(hasFirst) ? monthOf(opener) : null };
  });
}

const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "3 contributions on November 12, 2026" (or "No contributions on …"). */
export function dayLabel(day: ContributionDay): string {
  const [y, m, d] = day.date.split("-").map(Number);
  const when = `${LONG_MONTHS[m - 1]} ${d}, ${y}`;
  if (day.count === null) return day.level === 0 ? `No contributions on ${when}` : `Contributions on ${when}`;
  return `${day.count === 0 ? "No" : day.count.toLocaleString("en-US")} contribution${day.count === 1 ? "" : "s"} on ${when}`;
}
