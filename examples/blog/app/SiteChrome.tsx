import Link from "next/link";
import type { ReactNode } from "react";
import { nav, site } from "@/lib/content";

/** The public site's header around a page; the admin's previews use it too. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <Link href="/" className="site-title">
          {site.title}
        </Link>
        <nav>
          {nav().map((p) => (
            <Link key={p.slug} href={`/${p.slug}`}>
              {p.title}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </>
  );
}
