# Reading content

Your pages import the JSON files and read them with `gitms/content`, which
validates them with the same rules the admin uses. Invalid content fails
`next build` with the file and field named, so a bad edit never ships.

```ts
// lib/content.ts
import { postsWithPages, publishedPosts, readPages, readPosts, navPages } from "gitms/content";
import cms from "@/gitms.config";
import postsFile from "@/content/posts.json";
import pagesFile from "@/content/pages.json";

export const posts = readPosts(cms, postsFile);
export const pages = readPages(cms, pagesFile);

export const livePosts = () => publishedPosts(posts); // no drafts, nothing scheduled, newest first
export const postPages = () => postsWithPages(posts); // the ones with a body (their own page)
export const nav = () => navPages(pages);             // published pages marked "show in navigation"
```

Other helpers: `publishedPages`, `isScheduled`, `postStatus`, `postUrl`,
`pageUrl`, `livePostUrl`, `readRedirects` and `siteRedirects`.

Render bodies with the bundled renderer, which only emits safe links and
images:

```tsx
import { Markdown } from "gitms/Markdown";

<Markdown source={post.body} />
```

or parse them yourself with `parseMarkdown`, `excerpt` and `readingMinutes`
from `gitms/markdown`.

Because pages are built from the files, mark post and page routes static
(`generateStaticParams` and `dynamicParams = false`). Saves become commits and
your host's rebuild publishes them.

## Previews

Give `createAdmin()` components that render a post or page the way your site
does, and the editor's "View on site" opens a preview of drafts and scheduled
posts for the signed-in editor, read live from the store:

```tsx
export default createAdmin({
  preview: {
    post: ({ post }) => <SiteChrome><PostArticle post={post as Post} /></SiteChrome>,
    page: ({ page }) => <SiteChrome><PageArticle page={page as Page} /></SiteChrome>,
  },
});
```

Without them there's no preview, and "View on site" only shows once an item is
live.
