/**
 * A small markdown parser for posts and pages: no dependencies and no HTML
 * passthrough. It returns a tree that <Markdown> renders as React elements, so
 * nothing in a post is ever injected as raw HTML. Pure: the admin's preview
 * runs it in the browser too.
 *
 * Supported: paragraphs, `#` headings, emphasis (`*em*`, `**strong**`,
 * `~~del~~`), `inline code`, fenced code blocks, links, images (site-relative
 * only, see the CSP), `<https://autolinks>`, block quotes, nested lists,
 * horizontal rules and hard line breaks (two trailing spaces or a backslash).
 */

export type Inline =
  | string
  | { readonly t: "em" | "strong" | "del"; readonly c: readonly Inline[] }
  | { readonly t: "code"; readonly text: string }
  | { readonly t: "a"; readonly href: string; readonly c: readonly Inline[] }
  | { readonly t: "img"; readonly src: string; readonly alt: string }
  | { readonly t: "br" };

export type Block =
  | { readonly t: "p"; readonly c: readonly Inline[] }
  | { readonly t: "h"; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly c: readonly Inline[] }
  | { readonly t: "code"; readonly lang: string; readonly text: string }
  | { readonly t: "quote"; readonly c: readonly Block[] }
  | { readonly t: "list"; readonly ordered: boolean; readonly start: number; readonly tight: boolean; readonly items: readonly (readonly Block[])[] }
  | { readonly t: "hr" };

/* ---------- links ---------- */

/** Links may be relative (`/path`, `#id`), http(s) or mailto. Anything else renders as text. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href || /[\s\\<>"]/.test(href) || [...href].some((c) => c.charCodeAt(0) < 0x20)) return null;
  if (href.startsWith("#")) return href;
  if (href.startsWith("/")) return href.startsWith("//") ? null : href;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (scheme === "https" || scheme === "http") {
    try {
      const url = new URL(href);
      return url.hostname && !url.username && !url.password ? href : null;
    } catch {
      return null;
    }
  }
  if (scheme === "mailto") return /^mailto:[^@\s]+@[^@\s]+$/i.test(href) ? href : null;
  return null;
}

/** Images come from this site only (the CSP allows `img-src 'self'`). */
export function safeImageSrc(raw: string): string | null {
  const src = raw.trim();
  return src.startsWith("/") && !src.startsWith("//") && safeHref(src) ? src : null;
}

export const isExternal = (href: string) => /^https?:/i.test(href);

/* ---------- blocks ---------- */

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+(.*))?$/;

const isBlank = (line: string) => line.trim() === "";
const indentOf = (line: string) => line.length - line.replace(/^ +/, "").length;

/** Does this line start a block that interrupts a paragraph? */
function startsBlock(line: string): boolean {
  if (FENCE.test(line) || HR.test(line) || QUOTE.test(line)) return true;
  if (HEADING.test(line) && /^ {0,3}#{1,6}(\s|$)/.test(line)) return true;
  const item = ITEM.exec(line);
  return !!item && item[3] !== undefined && item[4] !== undefined && item[4].trim() !== "";
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  return parseBlocks(lines, 0);
}

function parseBlocks(lines: readonly string[], depth: number): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) body.push(lines[i++]);
      i++; // the closing fence (or the end)
      out.push({ t: "code", lang: fence[2], text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading && /^ {0,3}#{1,6}(\s|$)/.test(line)) {
      out.push({ t: "h", level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6, c: parseInline(heading[2] ?? "") });
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && !isBlank(lines[i])) {
        const q = QUOTE.exec(lines[i]);
        // A line without `>` continues the quote's paragraph (a "lazy" line).
        body.push(q ? q[1] : lines[i]);
        i++;
      }
      out.push({ t: "quote", c: depth < 8 ? parseBlocks(body, depth + 1) : [{ t: "p", c: [body.join("\n")] }] });
      continue;
    }

    const first = ITEM.exec(line);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const delim = first[2].slice(-1);
      // Continuation lines are indented to the item's text ("- " is 2, "1. " is 3).
      const contentIndent = indentOf(line) + first[2].length + 1;
      const items: string[][] = [];
      let tight = true;
      let pendingBlank = false;
      while (i < lines.length) {
        const cur = lines[i];
        const m = ITEM.exec(cur);
        const sameList = m && /\d/.test(m[2]) === ordered && m[2].slice(-1) === delim && indentOf(cur) <= indentOf(line) + 1;
        if (sameList) {
          if (pendingBlank && items.length) tight = false;
          pendingBlank = false;
          const content = m[4] ?? "";
          items.push([content]);
          i++;
          continue;
        }
        if (isBlank(cur)) {
          pendingBlank = true;
          i++;
          continue;
        }
        if (indentOf(cur) >= 2) {
          if (pendingBlank) {
            items[items.length - 1].push("");
            tight = false;
          }
          pendingBlank = false;
          items[items.length - 1].push(cur.slice(Math.min(indentOf(cur), contentIndent)));
          i++;
          continue;
        }
        // An unindented line right after an item continues its paragraph.
        if (!pendingBlank && !startsBlock(cur)) {
          items[items.length - 1].push(cur);
          i++;
          continue;
        }
        break;
      }
      const start = ordered ? Number(first[2].slice(0, -1)) : 1;
      out.push({
        t: "list",
        ordered,
        start,
        tight,
        items: items.map((body) => (depth < 8 ? parseBlocks(body, depth + 1) : [{ t: "p", c: [body.join("\n")] }])),
      });
      continue;
    }

    const para: string[] = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) para.push(lines[i++]);
    out.push({ t: "p", c: parseInline(para.map((l) => l.replace(/^ +/, "")).join("\n")) });
  }
  return out;
}

/* ---------- inline ---------- */

const PUNCT = "\\`*_{}[]()#+-.!~>|<\"'";

/** Finds the `]` that closes the `[` at `open`, skipping nested brackets and code. */
function closeBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") i++;
    else if (c === "`") {
      const run = /^`+/.exec(s.slice(i))![0];
      const end = s.indexOf(run, i + run.length);
      if (end > 0) i = end + run.length - 1;
    } else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return i;
  }
  return -1;
}

/** `(url "optional title")` at `at`: the url and the index after `)`. */
function linkTarget(s: string, at: number): { url: string; end: number } | null {
  if (s[at] !== "(") return null;
  const m = /^\(\s*<?([^\s<>()]*(?:\([^\s<>()]*\)[^\s<>()]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/.exec(s.slice(at));
  return m ? { url: m[1], end: at + m[0].length } : null;
}

const wordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

export function parseInline(source: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push(text);
    text = "";
  };
  const push = (node: Inline) => {
    flush();
    out.push(node);
  };
  const s = source;
  let i = 0;
  while (i < s.length) {
    const c = s[i];

    if (c === "\\" && i + 1 < s.length) {
      if (s[i + 1] === "\n") {
        push({ t: "br" });
        i += 2;
        continue;
      }
      if (PUNCT.includes(s[i + 1])) {
        text += s[i + 1];
        i += 2;
        continue;
      }
    }

    if (c === "\n") {
      if (/ {2,}$/.test(text)) {
        text = text.replace(/ +$/, "");
        push({ t: "br" });
      } else text = `${text.replace(/ +$/, "")}\n`;
      i++;
      continue;
    }

    if (c === "`") {
      const run = /^`+/.exec(s.slice(i))![0];
      const end = s.indexOf(run, i + run.length);
      if (end > 0 && s[end + run.length] !== "`") {
        let code = s.slice(i + run.length, end).replace(/\n/g, " ");
        if (/^ .* $/.test(code) && code.trim()) code = code.slice(1, -1);
        push({ t: "code", text: code });
        i = end + run.length;
        continue;
      }
      text += run;
      i += run.length;
      continue;
    }

    if (c === "<") {
      const m = /^<(https?:\/\/[^\s<>]+|[^\s<>@]+@[^\s<>@]+\.[a-z]{2,})>/i.exec(s.slice(i));
      if (m) {
        const href = safeHref(m[1].includes("@") && !m[1].includes("://") ? `mailto:${m[1]}` : m[1]);
        if (href) {
          push({ t: "a", href, c: [m[1]] });
          i += m[0].length;
          continue;
        }
      }
    }

    if (c === "!" && s[i + 1] === "[") {
      const close = closeBracket(s, i + 1);
      const target = close > 0 ? linkTarget(s, close + 1) : null;
      if (target) {
        const alt = s.slice(i + 2, close);
        const src = safeImageSrc(target.url);
        const href = safeHref(target.url);
        if (src) push({ t: "img", src, alt });
        else if (href) push({ t: "a", href, c: [alt || href] });
        else text += alt;
        i = target.end;
        continue;
      }
    }

    if (c === "[") {
      const close = closeBracket(s, i);
      const target = close > 0 ? linkTarget(s, close + 1) : null;
      if (target) {
        const label = s.slice(i + 1, close);
        const inner = depth < 6 ? parseInline(label, depth + 1) : [label];
        const href = safeHref(target.url);
        if (href) push({ t: "a", href, c: inner });
        else {
          flush();
          out.push(...inner);
        }
        i = target.end;
        continue;
      }
    }

    if ((c === "*" || c === "_" || c === "~") && depth < 6) {
      const run = c === "~" ? (s.startsWith("~~", i) ? "~~" : "") : s.startsWith(c + c, i) ? c + c : c;
      if (run) {
        const after = s[i + run.length];
        const before = s[i - 1];
        // `_` inside a word (snake_case) is just text; an opener must touch what follows.
        const canOpen = after !== undefined && !/\s/.test(after) && !(c === "_" && wordChar(before));
        if (canOpen) {
          let j = i + run.length;
          let end = -1;
          while ((j = s.indexOf(run, j)) > 0) {
            const prev = s[j - 1];
            const next = s[j + run.length];
            const ok = !/\s/.test(prev) && s[j - 1] !== "\\" && !(c === "_" && wordChar(next)) && (run.length === 2 || next !== c);
            if (ok && j > i + run.length) {
              end = j;
              break;
            }
            j += 1;
          }
          if (end > 0) {
            const inner = parseInline(s.slice(i + run.length, end), depth + 1);
            push({ t: c === "~" ? "del" : run.length === 2 ? "strong" : "em", c: inner });
            i = end + run.length;
            continue;
          }
        }
        text += run;
        i += run.length;
        continue;
      }
    }

    text += c;
    i++;
  }
  flush();
  return out;
}

/* ---------- plain text ---------- */

function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((n) => {
      if (typeof n === "string") return n;
      if (n.t === "br") return " ";
      if (n.t === "code") return n.text;
      if (n.t === "img") return n.alt;
      return inlineText(n.c);
    })
    .join("")
    .replace(/\s+/g, " ");
}

/** The first paragraph as plain text, cut at a word boundary: list pages and RSS. */
export function excerpt(source: string, max = 220): string {
  const first = parseMarkdown(source).find((b) => b.t === "p");
  if (!first || first.t !== "p") return "";
  const text = inlineText(first.c).trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s,.;:!?-]+$/, "")}…`;
}

/** Rough reading time in minutes (220 words a minute), at least 1. */
export function readingMinutes(source: string): number {
  const words = source.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
