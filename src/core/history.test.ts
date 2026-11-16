// @vitest-environment node
import { describe, expect, it } from "vitest";
import { changedFields, collapse, itemHistory } from "./history";
import type { ContentStore, Revision } from "./store";

const rev = (n: number): Revision => ({ sha: String(n).repeat(40), message: `commit ${n}`, date: `2026-11-1${n}T10:00:00Z`, url: null });
const post = (body: string, title = "Hello") => ({ slug: "hello", title, at: "2026-11-01T10:00:00Z", category: "notes", body });

describe("collapse", () => {
  it("merges runs of the same version (dated by the commit that introduced it) and skips commits without the item", () => {
    const now = post("v3");
    const versions = collapse(
      [
        [rev(5), post("v3")],
        [rev(4), post("v2")],
        [rev(3), post("v2")], // another post changed; this one didn't
        [rev(2), post("v1")],
        [rev(1), undefined], // before it was created
      ],
      now,
    );
    expect(versions.map((v) => [v.commit.sha[0], v.item.body, v.current])).toEqual([
      ["5", "v3", true],
      ["3", "v2", false],
      ["2", "v1", false],
    ]);
    expect(versions[1].changed).toEqual(["body"]);
  });

  it("a version that comes back later is listed again, in order", () => {
    const versions = collapse([[rev(3), post("a")], [rev(2), post("b")], [rev(1), post("a")]], post("a"));
    expect(versions.map((v) => v.current)).toEqual([true, false, true]);
  });
});

describe("changedFields", () => {
  it("names fields that differ, including added and removed ones", () => {
    expect(changedFields({ a: 1, b: "x" }, { a: 1, c: true })).toEqual(["b", "c"]);
  });
});

describe("itemHistory", () => {
  it("reads each commit's copy of the file and picks the item out by slug", async () => {
    const copies: Record<string, unknown> = {
      [rev(2).sha]: { posts: [post("new", "Hello again")] },
      [rev(1).sha]: { posts: [{ ...post("old"), slug: "other" }, post("old")] },
    };
    const store = {
      history: async () => [rev(2), rev(1)],
      readAt: async (_f: string, sha: string) => copies[sha],
    } as unknown as ContentStore;
    const { versions, truncated } = await itemHistory(store, "posts", "hello", post("new", "Hello again"));
    expect(truncated).toBe(false);
    expect(versions.map((v) => v.item.body)).toEqual(["new", "old"]);
    expect(versions[1].changed).toEqual(["title", "body"]);
  });
});
