import { describe, expect, it, vi } from "vitest";
import { defineGitms } from "../config";
import { readActivity } from "../activity";
import { activityDraft, readActivityDraft } from "./activity-draft";
import { activityFileSchema, calendarWeeks, dayLabel, fetchContributions, parseApiCalendar, parseProfileCalendar, type ContributionDay } from "./activity";

/** A trimmed copy of the markup github.com/users/<login>/contributions serves. */
const PROFILE = `
<h2 class="f4 text-normal mb-2">
      1,234
      contributions
        in the last year
  </h2>
<table class="ContributionCalendar-grid"><tbody>
<tr>
  <td tabindex="0" data-ix="0" aria-selected="false" aria-describedby="contribution-graph-legend-level-0" style="width: 10px" data-date="2026-11-15" id="contribution-day-component-0-0" data-level="0" role="gridcell" data-view-component="true" class="ContributionCalendar-day"></td>
  <tool-tip id="tooltip-a" for="contribution-day-component-0-0" popover="manual" data-direction="n" data-type="label" data-view-component="true" class="sr-only position-absolute">No contributions on November 15th.</tool-tip>
  <td tabindex="0" data-ix="1" aria-selected="false" style="width: 10px" data-date="2026-11-16" id="contribution-day-component-1-1" data-level="3" role="gridcell" class="ContributionCalendar-day"></td>
  <tool-tip id="tooltip-b" for="contribution-day-component-1-1" popover="manual" class="sr-only position-absolute">1,024 contributions on November 16th.</tool-tip>
  <td tabindex="0" data-date="2026-11-14" id="contribution-day-component-6-0" data-level="1" role="gridcell" class="ContributionCalendar-day"></td>
  <tool-tip for="contribution-day-component-6-0" class="sr-only">1 contribution on November 14th.</tool-tip>
  <td class="ContributionCalendar-label">Mon</td>
</tr>
</tbody></table>`;

const day = (date: string, count = 0, level = 0) => ({ date, count, level }) as ContributionDay;

describe("the activity settings file", () => {
  it("needs a valid username to show the map, and none to hide it", () => {
    expect(activityFileSchema.safeParse({ activity: { show: true, github: "octo-cat" } }).success).toBe(true);
    expect(activityFileSchema.safeParse({ activity: { show: false, github: "" } }).success).toBe(true);
    expect(activityFileSchema.safeParse({ activity: { show: true, github: "" } }).success).toBe(false);
    expect(activityFileSchema.safeParse({ activity: { show: true, github: "-bad" } }).success).toBe(false);
    expect(activityFileSchema.safeParse({ activity: { show: true, github: "a--b" } }).success).toBe(false);
    expect(activityFileSchema.safeParse({ activity: { show: true, github: "x", extra: 1 } }).success).toBe(false);
  });

  it("is read by readActivity, which names the file on a bad one", () => {
    const cms = defineGitms({ siteUrl: "https://example.com/", activity: { file: "content/activity.json" } });
    expect(readActivity(cms, { activity: { show: true, github: "octocat" } })).toEqual({ show: true, github: "octocat" });
    expect(() => readActivity(cms, { activity: { show: "yes" } })).toThrow(/content\/activity\.json is invalid/);
    expect(() => readActivity(defineGitms({ siteUrl: "https://example.com/" }), {})).toThrow(/not configured/);
  });

  it("takes a pasted profile link or @name as the username", () => {
    const fd = (v: string, show = true) => {
      const f = new FormData();
      f.set("activity.github", v);
      if (show) f.set("activity.show", "on");
      return f;
    };
    expect(readActivityDraft(fd("https://github.com/octocat/"))).toEqual({ show: true, github: "octocat" });
    expect(readActivityDraft(fd("@octocat", false))).toEqual({ show: false, github: "octocat" });
    expect(activityDraft(null)).toEqual({ show: false, github: "" });
  });
});

describe("the config", () => {
  it("defaults the label and reserves the slug and file key", () => {
    expect(defineGitms({ siteUrl: "https://example.com/", activity: { file: "content/a.json" } }).activity).toEqual({ file: "content/a.json", label: "Activity" });
    expect(defineGitms({ siteUrl: "https://example.com/" }).activity).toBeNull();
    expect(() => defineGitms({ siteUrl: "https://example.com/", activity: { file: "../a.json" } })).toThrow(/activity\.file/);
    expect(() => defineGitms({ siteUrl: "https://example.com/", sections: [{ slug: "activity", label: "A" }] })).toThrow(/section slug/);
  });
});

describe("parsing GitHub's calendar", () => {
  it("reads days, levels and counts from the profile page", () => {
    const c = parseProfileCalendar("octocat", PROFILE)!;
    expect(c.total).toBe(1234);
    expect(c.days).toEqual([day("2026-11-14", 1, 1), day("2026-11-15", 0, 0), day("2026-11-16", 1024, 3)]);
    expect(parseProfileCalendar("octocat", "<html>rate limited</html>")).toBeNull();
  });

  it("falls back to summing, and to unknown counts, when the page leaves them out", () => {
    const bare = `<td data-date="2026-01-01" data-level="2" id="a"></td><td data-date="2026-01-02" data-level="0"></td>`;
    expect(parseProfileCalendar("o", bare)).toEqual({ login: "o", total: 0, days: [{ date: "2026-01-01", count: null, level: 2 }, { date: "2026-01-02", count: null, level: 0 }] });
  });

  it("reads the GraphQL answer", () => {
    const json = {
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: {
              totalContributions: 7,
              weeks: [{ contributionDays: [{ date: "2026-11-16", contributionCount: 7, contributionLevel: "FOURTH_QUARTILE" }, { date: "2026-11-15", contributionCount: 0, contributionLevel: "NONE" }] }],
            },
          },
        },
      },
    };
    expect(parseApiCalendar("o", json)).toEqual({ login: "o", total: 7, days: [day("2026-11-15"), day("2026-11-16", 7, 4)] });
    expect(parseApiCalendar("o", { data: { user: null } })).toBeNull();
    expect(parseApiCalendar("o", { errors: [] })).toBeNull();
  });
});

describe("fetchContributions", () => {
  it("reads the public profile page without a token", async () => {
    const fetch = vi.fn(async () => new Response(PROFILE));
    const c = await fetchContributions("octocat", { fetch, token: "", userAgent: "test-site" });
    expect(c?.total).toBe(1234);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://github.com/users/octocat/contributions");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("test-site");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("uses the GraphQL API with a token", async () => {
    const json = { data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 1, weeks: [{ contributionDays: [{ date: "2026-11-16", contributionCount: 1, contributionLevel: "FIRST_QUARTILE" }] }] } } } } };
    const fetch = vi.fn(async () => Response.json(json));
    const c = await fetchContributions("octocat", { fetch, token: "t0ken" });
    expect(c?.days).toEqual([day("2026-11-16", 1, 1)]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/graphql");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
    expect(JSON.parse(String(init.body)).variables).toEqual({ login: "octocat" });
  });

  it("returns null, never throws, and never logs the token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await fetchContributions("octocat", { token: "", fetch: vi.fn(async () => new Response("nope", { status: 429 })) })).toBeNull();
    expect(await fetchContributions("octocat", { token: "s3cret", fetch: vi.fn(async () => { throw new Error("offline"); }) })).toBeNull();
    expect(await fetchContributions("octocat", { token: "", fetch: vi.fn(async () => new Response("<html></html>")) })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("s3cret");
    const fetch = vi.fn();
    expect(await fetchContributions("../etc", { fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("calendar layout", () => {
  const span = (from: string, n: number) =>
    Array.from({ length: n }, (_, i) => day(new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)));

  it("puts days in Sunday-first week columns, padding the ends", () => {
    // 2026-11-11 is a Wednesday.
    const weeks = calendarWeeks(span("2026-11-11", 10));
    expect(weeks).toHaveLength(2);
    expect(weeks[0].days.slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0].days[3]?.date).toBe("2026-11-11");
    expect(weeks[1].days[0]?.date).toBe("2026-11-15");
    expect(weeks[1].days.slice(6)).toEqual([null]);
    expect(weeks.every((w) => w.days.length === 7)).toBe(true);
  });

  it("names each month once, on the week its first day falls in", () => {
    const weeks = calendarWeeks(span("2025-11-16", 366));
    expect(weeks).toHaveLength(53);
    const months = weeks.map((w) => w.month).filter(Boolean);
    expect(months).toEqual(["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].slice(1));
    // Starting on the 2nd of a month with the next month far away, the first week is named.
    expect(calendarWeeks(span("2026-03-02", 40))[0].month).toBe("Mar");
  });

  it("labels days for the tooltip", () => {
    expect(dayLabel(day("2026-11-16", 3, 2))).toBe("3 contributions on November 16, 2026");
    expect(dayLabel(day("2026-01-01", 1, 1))).toBe("1 contribution on January 1, 2026");
    expect(dayLabel(day("2026-01-01"))).toBe("No contributions on January 1, 2026");
    expect(dayLabel({ date: "2026-01-01", count: null, level: 2 })).toBe("Contributions on January 1, 2026");
  });
});
