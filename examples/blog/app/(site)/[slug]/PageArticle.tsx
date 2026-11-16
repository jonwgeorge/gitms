import { Markdown } from "gitms/Markdown";
import type { Page } from "gitms/content";

export function PageArticle({ page }: { page: Page }) {
  return (
    <main>
      <h1>{page.title}</h1>
      <Markdown source={page.body} />
    </main>
  );
}
