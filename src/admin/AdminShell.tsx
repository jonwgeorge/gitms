import Link from "next/link";
import type { ReactNode } from "react";
import { admin, cms } from "../runtime";
import { logout } from "./actions/auth";
import btn from "./Button.module.css";
import styles from "./admin.module.css";
import theme from "./theme.module.css";

/** The sidebar sections, from the config: built-in ones that are configured, then your own. */
export function adminNav(): { href: string; label: string }[] {
  const c = cms();
  return [
    { href: admin(), label: "Dashboard" },
    ...(c.posts ? [{ href: admin("/posts"), label: c.posts.label }] : []),
    ...(c.pages ? [{ href: admin("/pages"), label: c.pages.label }] : []),
    ...(c.redirects ? [{ href: admin("/redirects"), label: "Redirects" }] : []),
    ...(c.activity ? [{ href: admin("/activity"), label: c.activity.label }] : []),
    ...c.sections.map((s) => ({ href: admin(`/${s.slug}`), label: s.label })),
  ];
}

export type Crumb = { href: string; label: string };

type Props = {
  title: string;
  /** The current section's nav href; omitted on the login and not-configured pages (no nav). */
  current?: string;
  /** Links above the title, e.g. Posts / this post. The current page is the title itself. */
  crumbs?: readonly Crumb[];
  /** Buttons beside the title (the page's main action). */
  actions?: ReactNode;
  /** A message shown above the page (e.g. "Post deleted") after a redirect. */
  flash?: ReactNode;
  children: ReactNode;
};

/**
 * Admin chrome (and the theme root): a sidebar with the sections, "view site" and log out (a plain
 * form, no JS needed); under 720px the sidebar becomes a top bar.
 */
export function AdminShell({ title, current, crumbs, actions, flash, children }: Props) {
  const { brand, basePath } = cms();
  // A site's own title if it set one, else a shell prompt: "<name>:<basePath>$".
  const brandMark = brand.title ? (
    <span className={styles.user}>{brand.title}</span>
  ) : (
    <>
      <span className={styles.user}>{brand.name}</span>:{basePath}$
    </>
  );
  const nav = current
    ? adminNav().map((item) => (
        <li key={item.href}>
          <a href={item.href} aria-current={item.href === current ? "page" : undefined}>
            {item.label}
          </a>
        </li>
      ))
    : null;
  const logoutForm = (
    <form action={logout}>
      <button type="submit" className={`gitms-button ${btn.btn} ${styles.button}`}>
        Log out
      </button>
    </form>
  );
  return (
    <div className={`${theme.root} gitms-root ${styles.shell}`} data-bare={current ? undefined : ""}>
      {current ? (
        <>
          <aside className={styles.side}>
            <div className={styles.sideInner}>
              <p className={`gitms-code gitms-brand ${styles.brand}`}>
                {brandMark}
              </p>
              <nav aria-label="Admin">
                <ul className={`gitms-body ${styles.nav}`}>{nav}</ul>
              </nav>
              <div className={`gitms-small ${styles.sideFoot}`}>
                <Link href="/">View site ↗</Link>
                {logoutForm}
              </div>
            </div>
          </aside>
          <header className={styles.top}>
            <div className={styles.topRow}>
              <span className="gitms-code gitms-brand">
                {brandMark}
              </span>
              <span className={styles.toolbar}>
                <Link href="/" className="gitms-small">
                  View site
                </Link>
                {logoutForm}
              </span>
            </div>
            <nav aria-label="Admin sections">
              <ul className={`gitms-body ${styles.topNav}`}>{nav}</ul>
            </nav>
          </header>
        </>
      ) : null}
      <div className={styles.content}>
        <main id="main" tabIndex={-1} className={styles.main}>
          {crumbs?.length ? (
            <nav aria-label="Breadcrumb">
              <ol className={`gitms-small ${styles.crumbs}`}>
                {crumbs.map((c) => (
                  <li key={c.href}>
                    <a href={c.href}>{c.label}</a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <div className={styles.pageHead}>
            <h1 className={`gitms-h1 ${styles.title}`}>{title}</h1>
            {actions ? <div className={styles.pageActions}>{actions}</div> : null}
          </div>
          {flash ? <div className={styles.flash}>{flash}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
