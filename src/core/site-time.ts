/**
 * Post dates in the site's time zone (config `timeZone`). The admin shows and
 * takes dates in that zone; the content files keep ISO date-times with the
 * matching offset, e.g. 2026-11-14T09:30:00-06:00. Client-safe.
 */
const DEFAULT_ZONE = "UTC";

const pad = (n: number) => String(n).padStart(2, "0");

/** The zone's UTC offset in minutes at an instant (e.g. -300 for CDT). */
export function zoneOffsetMinutes(epochMs: number, timeZone = DEFAULT_ZONE): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date(epochMs))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? "");
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

const offsetText = (minutes: number) => {
  if (minutes === 0) return "Z";
  const a = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
};

/** An ISO date-time → the `YYYY-MM-DDTHH:mm` a datetime-local input shows, in the site zone. */
export function toLocalInput(iso: string, timeZone = DEFAULT_ZONE): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const local = new Date(ms + zoneOffsetMinutes(ms, timeZone) * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` in the site zone → an ISO date-time with that zone's offset; null if malformed. */
export function fromLocalInput(value: string, timeZone = DEFAULT_ZONE): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset across a DST change.
  let offset = zoneOffsetMinutes(asUtc, timeZone);
  offset = zoneOffsetMinutes(asUtc - offset * 60_000, timeZone);
  const check = new Date(asUtc);
  if (check.getUTCDate() !== d) return null; // e.g. Feb 31
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${offsetText(offset)}`;
}

/** Now, as a datetime-local value in the site zone. */
export const localNow = (timeZone = DEFAULT_ZONE) => toLocalInput(new Date().toISOString(), timeZone);
