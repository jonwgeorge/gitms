import { afterEach, describe, expect, it } from "vitest";
import {
  LIMITS,
  clientIp,
  loginAllowed,
  recordFailure,
  recordSuccess,
  reserveAttempt,
  resetThrottle,
  throttleKey,
  trackedClients,
} from "./throttle";

afterEach(() => {
  resetThrottle();
  LIMITS.maxEntries = 10_000;
});

describe("login throttling", () => {
  it("blocks an IP after 5 failures in the window, then lets it in after the window", () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITS.perIp; i++) {
      expect(loginAllowed("1.2.3.4", t)).toBe(true);
      recordFailure("1.2.3.4", t);
    }
    expect(loginAllowed("1.2.3.4", t)).toBe(false);
    expect(loginAllowed("5.6.7.8", t)).toBe(true);
    expect(loginAllowed("1.2.3.4", t + LIMITS.windowMs + 1)).toBe(true);
  });

  it("a success clears that IP's failures", () => {
    recordFailure("1.2.3.4");
    recordSuccess("1.2.3.4");
    for (let i = 0; i < LIMITS.perIp - 1; i++) recordFailure("1.2.3.4");
    expect(loginAllowed("1.2.3.4")).toBe(true);
  });

  it("reserveAttempt checks and counts in one step", () => {
    const got = Array.from({ length: 8 }, () => reserveAttempt("9.9.9.9", 1));
    expect(got).toEqual([true, true, true, true, true, false, false, false]);
  });

  it("has no global cap: a flood from many addresses never locks out another IP", () => {
    const t = 1_000_000;
    for (let i = 0; i < 1000; i++) for (let j = 0; j < LIMITS.perIp; j++) recordFailure(`10.${Math.floor(i / 256)}.${i % 256}.1`, t);
    expect(loginAllowed("192.168.1.1", t)).toBe(true);
    expect(reserveAttempt("192.168.1.1", t)).toBe(true);
    expect(loginAllowed("10.0.0.1", t)).toBe(false);
  });

  it("trusts only cf-connecting-ip and ignores spoofable forwarding headers", () => {
    expect(
      clientIp(new Headers({ "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": "198.51.100.9, 10.0.0.1" })),
    ).toBe("203.0.113.1");
    expect(clientIp(new Headers({ "cf-connecting-ip": " 2001:db8::1 " }))).toBe("2001:db8::1");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.8", "x-vercel-forwarded-for": "203.0.113.9" }))).toBe("unknown");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("requests with no IP header share one fail-closed 'unknown' bucket", () => {
    const ip = clientIp(new Headers());
    for (let i = 0; i < LIMITS.perIp; i++) expect(reserveAttempt(ip, 1)).toBe(true);
    expect(reserveAttempt(clientIp(new Headers()), 1)).toBe(false);
  });
});

describe("throttle keys", () => {
  it("groups IPv6 by /56 and keeps IPv4 as is", () => {
    expect(throttleKey("203.0.113.7")).toBe("203.0.113.7");
    expect(throttleKey("2001:db8:abcd:12::1")).toBe("2001:db8:abcd:0::/56");
    expect(throttleKey("2001:db8:abcd:12ff::1")).toBe("2001:db8:abcd:1200::/56");
    expect(throttleKey("2001:0db8:abcd:00ff:ffff:ffff:ffff:ffff")).toBe("2001:db8:abcd:0::/56");
    expect(throttleKey("2001:db8::")).toBe("2001:db8:0:0::/56");
    expect(throttleKey("::1")).toBe("0:0:0:0::/56");
    expect(throttleKey("fe80::1%eth0")).toBe("fe80:0:0:0::/56");
    expect(throttleKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(throttleKey("unknown")).toBe("unknown");
  });

  it("one /56 shares one limit however many addresses and /64s it rotates through", () => {
    const t = 1_000_000;
    // Five different /64s inside 2001:db8:1:0::/56.
    for (let i = 1; i <= LIMITS.perIp; i++) expect(reserveAttempt(`2001:db8:1:${i.toString(16)}::${i}`, t)).toBe(true);
    expect(reserveAttempt("2001:db8:1:ff:dead:beef:0:99", t)).toBe(false);
    expect(reserveAttempt("2001:db8:1:100::1", t)).toBe(true); // the next /56 is separate
  });

  it("an IPv4-mapped address shares its IPv4's limit", () => {
    for (let i = 0; i < LIMITS.perIp; i++) recordFailure("203.0.113.7");
    expect(loginAllowed("::ffff:203.0.113.7")).toBe(false);
  });
});

describe("map size cap", () => {
  it("never tracks more than maxEntries clients and evicts the least recently charged", () => {
    LIMITS.maxEntries = 100;
    const t = 1_000_000;
    for (let j = 0; j < LIMITS.perIp; j++) recordFailure("192.0.2.1", t); // blocked, charged first
    for (let i = 0; i < 99; i++) recordFailure(`10.0.0.${i}`, t);
    expect(trackedClients()).toBe(100);
    recordFailure("10.0.1.0", t); // one over: evicts the oldest
    expect(trackedClients()).toBe(100);
    expect(loginAllowed("192.0.2.1", t)).toBe(true); // 192.0.2.1 was oldest
    expect(loginAllowed("10.0.0.0", t)).toBe(true); // still tracked, 1 failure
  });

  it("re-charging a client makes it recent, so it isn't the one evicted", () => {
    LIMITS.maxEntries = 3;
    const t = 1_000_000;
    for (let j = 0; j < LIMITS.perIp - 1; j++) recordFailure("192.0.2.1", t);
    recordFailure("10.0.0.1", t);
    recordFailure("10.0.0.2", t);
    recordFailure("192.0.2.1", t); // now at the limit, and most recent
    recordFailure("10.0.0.3", t); // evicts 10.0.0.1
    expect(trackedClients()).toBe(3);
    expect(loginAllowed("192.0.2.1", t)).toBe(false);
  });

  it("stays O(1) per attempt with a full map (no scans)", () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITS.maxEntries; i++) recordFailure(`10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`, t);
    const start = performance.now();
    for (let i = 0; i < 20_000; i++) recordFailure(`11.${i >> 16}.${(i >> 8) & 255}.${i & 255}`, t);
    expect(trackedClients()).toBe(LIMITS.maxEntries);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
