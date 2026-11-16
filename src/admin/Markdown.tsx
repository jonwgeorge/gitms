import type { ReactNode } from "react";
import { isExternal, parseMarkdown, type Block, type Inline } from "../core/markdown";
import styles from "./Markdown.module.css";

/**
 * Renders a post body. Built from lib/markdown's tree as React elements, so a
 * post can never inject HTML. Headings shift down one level: the page's h1 is
 * the post title, so `# Heading` in a post is an h2.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={`${styles.prose} ${className ?? ""}`}>{blocks(parseMarkdown(source))}</div>;
}

function blocks(list: readonly Block[], tight = false): ReactNode[] {
  return list.map((b, i) => block(b, i, tight));
}

function block(b: Block, key: number, tight: boolean): ReactNode {
  switch (b.t) {
    case "p":
      return tight ? <span key={key}>{inlines(b.c)}</span> : <p key={key}>{inlines(b.c)}</p>;
    case "h": {
      const Tag = `h${Math.min(6, b.level + 1)}` as "h2";
      return <Tag key={key}>{inlines(b.c)}</Tag>;
    }
    case "code":
      return (
        <pre key={key} className={`gitms-code ${styles.pre}`} data-lang={b.lang || undefined}>
          <code>{b.text}</code>
        </pre>
      );
    case "quote":
      return <blockquote key={key}>{blocks(b.c)}</blockquote>;
    case "hr":
      return <hr key={key} />;
    case "list": {
      const items = b.items.map((item, i) => <li key={i}>{blocks(item, b.tight)}</li>);
      return b.ordered ? (
        <ol key={key} start={b.start === 1 ? undefined : b.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
  }
}

function inlines(list: readonly Inline[]): ReactNode[] {
  return list.map((n, i) => {
    if (typeof n === "string") return n;
    switch (n.t) {
      case "em":
        return <em key={i}>{inlines(n.c)}</em>;
      case "strong":
        return <strong key={i}>{inlines(n.c)}</strong>;
      case "del":
        return <del key={i}>{inlines(n.c)}</del>;
      case "code":
        return (
          <code key={i} className="gitms-code">
            {n.text}
          </code>
        );
      case "br":
        return <br key={i} />;
      case "img":
        // eslint-disable-next-line @next/next/no-img-element -- post images are plain files under /public
        return <img key={i} src={n.src} alt={n.alt} loading="lazy" />;
      case "a":
        return (
          <a key={i} href={n.href} rel={isExternal(n.href) ? "noopener noreferrer" : undefined}>
            {inlines(n.c)}
          </a>
        );
    }
  });
}
