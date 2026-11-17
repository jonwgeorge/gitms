// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cms from "gitms-site-config";
import { STALE_MESSAGE, StaleContentError, StoreError, blobSha, commonDir, contentFiles, fsStore, githubStore, serialize, type ContentFile } from "./store";

const FIXTURES = join(__dirname, "..", "..", "test", "fixtures");
const original = (name: string) => readFileSync(join(FIXTURES, "content", name), "utf8");
const postsData = () => JSON.parse(original("posts.json"));
const files = contentFiles(cms);

describe("blobSha", () => {
  it("matches git's blob hash (what GitHub reports as sha)", () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(blobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});

describe("github store (AC8)", () => {
  const sha = "a".repeat(40);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  function setup(handler: (url: string, init: RequestInit) => Response) {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {}));
    const store = githubStore({ files, userAgent: "gitms-test", token: "tok-secret", repo: "octo/site", branch: "main", fetch: fetchMock as typeof fetch });
    return { store, fetchMock };
  }

  it("reads a file: base64 content and its sha, from the configured branch", async () => {
    const text = original("posts.json");
    const b64 = Buffer.from(text).toString("base64").replace(/(.{60})/g, "$1\n");
    const { store, fetchMock } = setup(() => json({ content: b64, encoding: "base64", sha }));
    const snap = await store.read("posts");
    expect(snap).toEqual({ data: JSON.parse(text), sha });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/octo/site/contents/content/posts.json?ref=main");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-secret");
    expect(init?.cache).toBe("no-store");
  });

  it("saves with a PUT carrying base64 content, the prior sha, the branch and the commit message", async () => {
    const { store, fetchMock } = setup(() =>
      json({ content: { sha: "b".repeat(40) }, commit: { sha: "c0ffee1234567", html_url: "https://github.com/octo/site/commit/c0ffee1234567" } }),
    );
    const data = postsData();
    data.posts[0].title = "Edited";
    const saved = await store.write("posts", data, { sha, message: "posts: update \"Edited\"" });
    expect(saved).toEqual({
      sha: "b".repeat(40),
      commitSha: "c0ffee1234567",
      commitUrl: "https://github.com/octo/site/commit/c0ffee1234567",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/octo/site/contents/content/posts.json");
    expect(init?.method).toBe("PUT");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ message: 'posts: update "Edited"', content: expect.any(String), sha, branch: "main" });
    expect(Buffer.from(body.content, "base64").toString("utf8")).toBe(serialize(data));
  });

  it.each([409, 422])("turns a %i sha conflict into the 'content changed, reload' error", async (status) => {
    const { store } = setup(() => json({ message: "sha does not match" }, status));
    const err = await store.write("posts", postsData(), { sha, message: "m" }).catch((e) => e);
    expect(err).toBeInstanceOf(StaleContentError);
    expect(err.message).toBe(STALE_MESSAGE);
    expect(err.message).toMatch(/changed.*reload/i);
  });

  it("never sends invalid content", async () => {
    const { store, fetchMock } = setup(() => json({}));
    const data = postsData();
    data.posts[0].at = "sideways";
    await expect(store.write("posts", data, { sha, message: "m" })).rejects.toBeInstanceOf(StoreError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only touches the allow-listed paths", async () => {
    const { store, fetchMock } = setup(() => json({}));
    await expect(store.read("../../.env" as ContentFile)).rejects.toBeInstanceOf(StoreError);
    await expect(store.read("constructor" as ContentFile)).rejects.toBeInstanceOf(StoreError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports other failures without leaking the token or the response body", async () => {
    const { store } = setup(() => json({ message: "Bad credentials tok-secret" }, 401));
    const err = await store.read("pages").catch((e) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect(err.message).toBe("GitHub returned 401 reading content/pages.json");
  });

  it("drops a commit link that isn't on github.com", async () => {
    const { store } = setup(() => json({ content: { sha }, commit: { sha: "1", html_url: "javascript:alert(1)" } }));
    expect((await store.write("posts", postsData(), { sha, message: "m" })).commitUrl).toBeNull();
  });

  it("finds the last content commit", async () => {
    const { store, fetchMock } = setup(() =>
      json([{ html_url: "https://github.com/o/r/commit/1", commit: { message: "posts: update \"A\"\n\nbody", author: { date: "2026-10-12T03:00:00Z" } } }]),
    );
    expect(await store.lastCommit()).toEqual({ message: 'posts: update "A"', date: "2026-10-12T03:00:00Z", url: "https://github.com/o/r/commit/1" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/octo/site/commits?path=content&sha=main&per_page=1");
  });

  it("lists a file's commits for history, dropping entries without a full sha", async () => {
    const c1 = "1".repeat(40);
    const { store, fetchMock } = setup(() =>
      json([
        { sha: c1, html_url: `https://github.com/o/r/commit/${c1}`, commit: { message: "posts: update \"A\"\n\nmore", author: { date: "2026-11-14T21:14:00Z" } } },
        { sha: "nope", commit: { message: "x" } },
      ]),
    );
    expect(await store.history("posts", 500)).toEqual([{ sha: c1, message: 'posts: update "A"', date: "2026-11-14T21:14:00Z", url: `https://github.com/o/r/commit/${c1}` }]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/octo/site/commits?path=content%2Fposts.json&sha=main&per_page=100");
  });

  it("reads a file at a commit, and only at a full commit sha", async () => {
    const text = original("posts.json");
    const { store, fetchMock } = setup(() => json({ content: Buffer.from(text).toString("base64"), encoding: "base64", sha }));
    const c = "2".repeat(40);
    expect(await store.readAt("posts", c)).toEqual(JSON.parse(text));
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.github.com/repos/octo/site/contents/content/posts.json?ref=${c}`);
    await expect(store.readAt("posts", "main")).rejects.toBeInstanceOf(StoreError);
    await expect(store.readAt("posts", "../x")).rejects.toBeInstanceOf(StoreError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fs store (AC5, AC6)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "content-"));
    mkdirSync(join(dir, "content"));
    for (const name of ["posts.json", "pages.json", "redirects.json"]) writeFileSync(join(dir, "content", name), original(name));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads with the blob sha and writes validated JSON in place", async () => {
    const store = fsStore(dir, files);
    const snap = await store.read("posts");
    expect(snap.sha).toBe(blobSha(original("posts.json")));
    const data = postsData();
    data.posts[0].title = "New title";
    const saved = await store.write("posts", data, { sha: snap.sha, message: "m" });
    const text = readFileSync(join(dir, "content", "posts.json"), "utf8");
    expect(JSON.parse(text).posts[0].title).toBe("New title");
    expect(saved.sha).toBe(blobSha(text));
    expect(saved.commitUrl).toBeNull();
  });

  it("refuses a stale sha and leaves the file alone", async () => {
    const store = fsStore(dir, files);
    await expect(store.write("posts", postsData(), { sha: "0".repeat(40), message: "m" })).rejects.toBeInstanceOf(StaleContentError);
    expect(readFileSync(join(dir, "content", "posts.json"), "utf8")).toBe(original("posts.json"));
  });

  it("refuses invalid content", async () => {
    const store = fsStore(dir, files);
    const { sha } = await store.read("pages");
    await expect(store.write("pages", { pages: [{ slug: "" }] }, { sha, message: "m" })).rejects.toBeInstanceOf(StoreError);
    expect(readFileSync(join(dir, "content", "pages.json"), "utf8")).toBe(original("pages.json"));
  });
});

describe("content files", () => {
  it("names the configured files, and nothing else", () => {
    expect(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.path]))).toEqual({
      posts: "content/posts.json",
      pages: "content/pages.json",
      redirects: "content/redirects.json",
    });
  });

  it("finds the folder shared by every content file", () => {
    expect(commonDir(["content/a.json", "content/b.json"])).toBe("content");
    expect(commonDir(["content/blog/a.json", "content/b.json"])).toBe("content");
    expect(commonDir(["a.json", "content/b.json"])).toBe("");
  });

  it("sends the configured User-Agent", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    await githubStore({ files, userAgent: "gitms-test", token: "t", repo: "octo/site", branch: "main", fetch: fetchMock as typeof fetch }).lastCommit();
    expect(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)["User-Agent"]).toBe("gitms-test");
  });
});
