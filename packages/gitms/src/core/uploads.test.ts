// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadError, altText, fileStem, fsUploads, gitBlobSha, githubUploads, sniffImage, uploadPath } from "./uploads";
const T = { dir: "public/uploads", publicPath: "/uploads" };

const pad = (head: number[] | string, n = 32) => {
  const bytes = typeof head === "string" ? [...head].map((c) => c.charCodeAt(0)) : head;
  return new Uint8Array([...bytes, ...new Array(n).fill(0)]);
};
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);

describe("sniffImage", () => {
  it("recognises PNG, JPEG, GIF, WebP and AVIF from their bytes", () => {
    expect(sniffImage(PNG)?.ext).toBe("png");
    expect(sniffImage(JPEG)?.ext).toBe("jpg");
    expect(sniffImage(pad("GIF89a"))?.ext).toBe("gif");
    expect(sniffImage(pad("RIFF\0\0\0\0WEBPVP8 "))?.ext).toBe("webp");
    expect(sniffImage(pad("\0\0\0\x1cftypavif"))?.ext).toBe("avif");
  });

  it("refuses SVG, HTML and anything else, whatever the file is called", () => {
    expect(sniffImage(pad('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImage(pad("<!doctype html><script>"))).toBeNull();
    expect(sniffImage(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("uploadPath", () => {
  it("files by year and month with a content hash in the name", () => {
    const { path, url } = uploadPath(T, "My Desk (Front).PNG", PNG, { ext: "png", mime: "image/png" }, new Date("2026-11-15T12:00:00Z"));
    expect(path).toMatch(/^public\/uploads\/2026\/11\/my-desk-front-[0-9a-f]{10}\.png$/);
    expect(url).toBe(path.replace(/^public/, ""));
  });

  it("gives the same bytes the same path, and different bytes different paths", () => {
    const t = { ext: "png", mime: "image/png" } as const;
    const when = new Date("2026-01-02T00:00:00Z");
    expect(uploadPath(T, "a.png", PNG, t, when)).toEqual(uploadPath(T, "a.png", PNG, t, when));
    expect(uploadPath(T, "a.png", PNG, t, when).path).not.toBe(uploadPath(T, "a.png", pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 1]), t, when).path);
  });

  it("makes a safe stem from any name", () => {
    expect(fileStem("../../etc/passwd.png")).toBe("etc-passwd");
    expect(fileStem("Café menü.jpg")).toBe("cafe-menu");
    expect(fileStem("???.png")).toBe("image");
    expect(fileStem(`${"x".repeat(100)}.png`)).toHaveLength(48);
  });
});

describe("altText", () => {
  it("keeps alt text to one line with no brackets, falling back to the file name", () => {
    expect(altText("the [desk]\nfront", "x")).toBe("the desk front");
    expect(altText("  ", "my-desk")).toBe("my desk");
  });
});

describe("fs uploads", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "uploads-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes under public/uploads and reports a repeat upload as existing", async () => {
    const store = fsUploads(dir, "public/uploads");
    const path = "public/uploads/2026/11/desk-0123456789.png";
    expect(await store.put(path, PNG, "m")).toMatchObject({ existed: false });
    expect(new Uint8Array(readFileSync(join(dir, path)))).toEqual(PNG);
    expect(await store.put(path, PNG, "m")).toMatchObject({ existed: true });
  });

  it("refuses any path outside public/uploads", async () => {
    const store = fsUploads(dir, "public/uploads");
    for (const p of ["content/pages.json", "public/uploads/../../x.png", "public/uploads/2026/11/x.svg", "public/uploads/x.png"]) {
      await expect(store.put(p, PNG, "m")).rejects.toBeInstanceOf(UploadError);
    }
  });
});

describe("github uploads", () => {
  const path = "public/uploads/2026/11/desk-0123456789.png";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const setup = (handler: (url: string, init: RequestInit) => Response) => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {}));
    return { store: githubUploads({ dir: "public/uploads", token: "tok", repo: "octo/site", branch: "main", fetch: fetchMock as typeof fetch }), fetchMock };
  };

  it("commits the bytes base64-encoded to the branch", async () => {
    const { store, fetchMock } = setup(() => json({ commit: { sha: "c0ffee1234", html_url: "https://github.com/octo/site/commit/c0ffee1234" } }, 201));
    const saved = await store.put(path, PNG, "uploads: add desk");
    expect(saved).toEqual({ commitSha: "c0ffee1234", commitUrl: "https://github.com/octo/site/commit/c0ffee1234", existed: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.github.com/repos/octo/site/contents/${path}`);
    expect(init?.method).toBe("PUT");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ message: "uploads: add desk", content: Buffer.from(PNG).toString("base64"), branch: "main" });
  });

  it("treats a 422 as already uploaded only when the stored blob is the same bytes", async () => {
    const same = setup((_u, init) => (init.method === "PUT" ? json({}, 422) : json({ sha: gitBlobSha(PNG) })));
    expect(await same.store.put(path, PNG, "m")).toMatchObject({ existed: true, commitSha: null });

    const other = setup((_u, init) => (init.method === "PUT" ? json({}, 422) : json({ sha: "f".repeat(40) })));
    await expect(other.store.put(path, PNG, "m")).rejects.toThrow("GitHub returned 422");
  });

  it("never puts the token or a response body in its errors", async () => {
    const { store } = setup(() => json({ message: "Bad credentials tok" }, 401));
    const error = await store.put(path, PNG, "m").catch((e: Error) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as Error).message).toBe(`GitHub returned 401 saving ${path}`);
  });
});
