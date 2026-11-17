import Link from "next/link";
import { ContributionGraph, fetchContributions } from "gitms/activity";
import cms from "@/gitms.config";
import { activity, livePosts, site } from "@/lib/content";

export default async function Home() {
  // Fetched while the site builds; null (and left out) if GitHub can't be reached.
  const contributions = activity.show ? await fetchContributions(activity.github, { userAgent: cms.userAgent }) : null;
  return (
    <main>
      <p className="muted">{site.tagline}</p>
      {contributions ? <ContributionGraph data={contributions} /> : null}
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
