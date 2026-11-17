/**
 * The Activity section on the site: read the settings the admin saves, fetch
 * the GitHub contribution calendar on the server, and draw it.
 *
 *   import cms from "@/gitms.config";
 *   import raw from "@/content/activity.json";
 *   import { readActivity, fetchContributions, ContributionGraph } from "gitms/activity";
 *
 *   const settings = readActivity(cms, raw);
 *   const data = settings.show ? await fetchContributions(settings.github, { userAgent: cms.userAgent }) : null;
 *   {data ? <ContributionGraph data={data} /> : null}
 *
 * See docs/activity.md.
 */
import type { ResolvedConfig } from "./config";
import { activityFileSchema, type ActivitySettings } from "./core/activity";
import { parseContent } from "./core/schema";

export {
  GITHUB_LOGIN,
  activityFileSchema,
  calendarWeeks,
  dayLabel,
  fetchContributions,
  parseApiCalendar,
  parseProfileCalendar,
  type ActivitySettings,
  type CalendarWeek,
  type ContributionDay,
  type ContributionLevel,
  type Contributions,
  type FetchContributionsOptions,
} from "./core/activity";
export { ContributionGraph } from "./activity/ContributionGraph";

/** The activity file's settings, validated; throws a readable error naming every bad field (so bad content fails the build). */
export function readActivity(cms: ResolvedConfig, raw: unknown): ActivitySettings {
  if (!cms.activity) throw new Error("gitms: activity is not configured");
  return parseContent(activityFileSchema, raw, cms.activity.file).activity;
}
