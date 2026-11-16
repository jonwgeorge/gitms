import { createAdmin } from "gitms/admin";
import type { Page, Post } from "gitms/content";
import { PageArticle } from "@/app/(site)/[slug]/PageArticle";
import { PostArticle } from "@/app/(site)/blog/[slug]/PostArticle";
import { SiteChrome } from "@/app/SiteChrome";
import { SiteSection } from "./SiteSection";

// The admin reads the session cookie and live content: never prerendered.
export const dynamic = "force-dynamic";

export { generateMetadata } from "gitms/admin";

export default createAdmin({
  sections: { site: SiteSection },
  preview: {
    post: ({ post }) => (
      <SiteChrome>
        <PostArticle post={post as Post} />
      </SiteChrome>
    ),
    page: ({ page }) => (
      <SiteChrome>
        <PageArticle page={page as Page} />
      </SiteChrome>
    ),
  },
});
