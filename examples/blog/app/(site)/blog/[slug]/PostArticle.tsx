import { Markdown } from "gitms/Markdown";
import type { Post } from "gitms/content";

/** One post; the admin's preview renders this too. */
export function PostArticle({ post }: { post: Post }) {
  return (
    <main>
      <article>
        <h1>{post.title}</h1>
        <p className="muted">
          <time dateTime={post.at}>{post.at.slice(0, 10)}</time> · {String(post.category)}
        </p>
        <Markdown source={post.body} />
      </article>
    </main>
  );
}
