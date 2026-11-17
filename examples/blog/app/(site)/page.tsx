import Link from "next/link";
import { livePosts, site } from "@/lib/content";

export default function Home() {
  return (
    <main>
      <p className="muted">{site.tagline}</p>
      <ul>
        {livePosts().map((p) => (
          <li key={p.slug}>
            {p.body.trim() ? <Link href={`/blog/${p.slug}`}>{p.title}</Link> : p.title}{" "}
            <span className="muted">· {String(p.category)}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
