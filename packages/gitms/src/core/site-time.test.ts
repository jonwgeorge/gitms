import { describe, expect, it } from "vitest";
import { fromLocalInput, toLocalInput } from "./site-time";

const Z = "America/New_York";

describe("a site time zone (America/New_York)", () => {
  it("shows a stored date-time in that zone", () => {
    expect(toLocalInput("2026-10-08T21:14:00-04:00", Z)).toBe("2026-10-08T21:14");
    expect(toLocalInput("2026-07-16T03:00:00Z", Z)).toBe("2026-07-15T23:00");
    expect(toLocalInput("2026-12-01T12:00:00Z", Z)).toBe("2026-12-01T07:00");
    expect(toLocalInput("nope", Z)).toBe("");
  });

  it("stores a picked time with the right offset on either side of DST", () => {
    expect(fromLocalInput("2026-10-08T21:14", Z)).toBe("2026-10-08T21:14:00-04:00");
    expect(fromLocalInput("2026-11-14T09:30", Z)).toBe("2026-11-14T09:30:00-05:00");
    expect(fromLocalInput("2026-03-08T12:00", Z)).toBe("2026-03-08T12:00:00-04:00");
  });

  it("round-trips", () => {
    for (const iso of ["2026-10-08T21:14:00-04:00", "2026-01-31T00:05:00-05:00"]) expect(fromLocalInput(toLocalInput(iso, Z), Z)).toBe(iso);
  });

  it("refuses malformed input", () => {
    for (const v of ["", "2026-13-01T00:00", "2026-02-31T10:00", "2026-01-01 10:00", "tomorrow"]) expect(fromLocalInput(v, Z)).toBeNull();
  });
});

describe("the default zone", () => {
  it("is UTC", () => {
    expect(toLocalInput("2026-07-16T03:00:00Z")).toBe("2026-07-16T03:00");
    expect(fromLocalInput("2026-07-16T03:00")).toBe("2026-07-16T03:00:00Z");
  });
});
