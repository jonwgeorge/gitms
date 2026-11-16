/**
 * Best-effort login throttling, in memory: a fixed delay after every failed
 * attempt and a per-client limit per window. There is deliberately no global
 * cap, so a stranger flooding bad logins can only lock out their own address,
 * never the owner. On serverless each instance has its own memory, so this
 * slows guessing rather than stopping it; the strong defence is a long random
 * password (see README).
 *
 * A "client" is an IPv4 address or an IPv6 /56 (a typical end-site
 * allocation, so one holder can't rotate through its /64s to dodge the limit). The map has a hard size cap and
 * evicts the least recently charged client, so it never grows or scans
 * without bound.
 */
import { isIPv4, isIPv6 } from "node:net";

export const LIMITS = {
  windowMs: 15 * 60 * 1000,
  perIp: 5,
  /** Delay after a failed attempt. Tests shorten it. */
  failDelayMs: 1000,
  /** Most clients tracked at once; the least recently charged is evicted first. */
  maxEntries: 10_000,
};

type Bucket = { count: number; resetAt: number };
const byIp = new Map<string, Bucket>();

function live(bucket: Bucket | undefined, now: number): Bucket {
  return bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + LIMITS.windowMs };
}

/** Expands an IPv6 address to its 8 hextets, or null if it isn't one. */
function hextets(ip: string): string[] | null {
  if (!isIPv6(ip)) return null;
  let addr = ip.split("%")[0].toLowerCase();
  // An embedded IPv4 tail (e.g. ::ffff:1.2.3.4) becomes two hextets.
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (v4) {
    const [a, b, c, d] = v4[1].split(".").map(Number);
    addr = addr.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = addr.includes("::") ? addr.split("::") : [addr, null];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = tail === null ? [] : Array<string>(8 - h.length - t.length).fill("0");
  return [...h, ...fill, ...t].map((x) => x.replace(/^0+(?=.)/, ""));
}

/**
 * The throttle key for a client address: IPv4 as is, IPv4-mapped IPv6 as its
 * IPv4, any other IPv6 as its /56 prefix. Anything else is used verbatim.
 */
export function throttleKey(ip: string): string {
  const trimmed = ip.trim();
  if (isIPv4(trimmed)) return trimmed;
  const h = hextets(trimmed);
  if (!h) return trimmed.slice(0, 64);
  const mapped = h.slice(0, 5).every((x) => x === "0") && h[5] === "ffff";
  if (mapped) {
    const n = (x: string) => parseInt(x, 16);
    return [n(h[6]) >> 8, n(h[6]) & 255, n(h[7]) >> 8, n(h[7]) & 255].join(".");
  }
  // /56: the first three hextets plus the high byte of the fourth.
  const fourth = (parseInt(h[3], 16) & 0xff00).toString(16);
  return `${h.slice(0, 3).join(":")}:${fourth}::/56`;
}

/** False when this client has used up its attempts for the window. */
export function loginAllowed(ip: string, now: number = Date.now()): boolean {
  return live(byIp.get(throttleKey(ip)), now).count < LIMITS.perIp;
}

/** Counts one attempt against this client's window. O(1): no scans. */
function charge(ip: string, now: number): void {
  const key = throttleKey(ip);
  const b = live(byIp.get(key), now);
  b.count += 1;
  // Re-insert so Map order runs from least to most recently charged.
  byIp.delete(key);
  byIp.set(key, b);
  while (byIp.size > LIMITS.maxEntries) byIp.delete(byIp.keys().next().value!);
}

/**
 * Checks the limit and charges the attempt in one synchronous step, before the
 * (async) password check runs, so parallel requests can't all slip past the
 * check. Every attempt is charged up front as if it failed; a successful login
 * clears the IP with `recordSuccess`.
 */
export function reserveAttempt(ip: string, now: number = Date.now()): boolean {
  if (!loginAllowed(ip, now)) return false;
  charge(ip, now);
  return true;
}

/** Records a failed attempt (reserveAttempt already does this for logins). */
export function recordFailure(ip: string, now: number = Date.now()): void {
  charge(ip, now);
}

/** Clears this client's attempts after a successful login. */
export function recordSuccess(ip: string): void {
  byIp.delete(throttleKey(ip));
}

export function failureDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LIMITS.failDelayMs));
}

/**
 * The client address, from one header your host sets itself and overwrites
 * whatever the client sent (config `clientIpHeader`; `cf-connecting-ip` on
 * Cloudflare, the default). Headers a client can set, like `x-forwarded-for`
 * on hosts that pass it through, would let a client pick a fresh address per
 * attempt and skip the limit, so only name one your host guarantees.
 */
export function clientIp(headers: Headers, header: string = "cf-connecting-ip"): string {
  // No header (e.g. `next dev`): every such request shares one "unknown"
  // bucket (fail closed: they can lock each other out, but none goes unlimited).
  const v = headers.get(header)?.trim() ?? "";
  // x-forwarded-for style lists: the left-most entry is the client.
  return v.split(",")[0].trim() || "unknown";
}

/** Test helper: how many clients are tracked. */
export function trackedClients(): number {
  return byIp.size;
}

/** Test helper. */
export function resetThrottle(): void {
  byIp.clear();
}
