/** Small date formatting helpers for the admin (pure, client-safe). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Oct 08 21:14` from an ISO date-time, read in the timestamp's own offset (so the server's zone can't shift it). */
export function stamp(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[1]) - 1]} ${m[2]} ${m[3]}`;
}

/** `Oct 8, 2026` from an ISO date-time, in the timestamp's own offset. */
export function postDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}
