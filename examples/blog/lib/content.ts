import { readActivity } from "gitms/activity";
import { navPages, postsWithPages, publishedPages, publishedPosts, readPages, readPosts } from "gitms/content";
import cms from "@/gitms.config";
import activityFile from "@/content/activity.json";
import pagesFile from "@/content/pages.json";
import postsFile from "@/content/posts.json";
import siteFile from "@/content/site.json";
import { siteSchema } from "./site-schema";

// Validated at build time: bad content fails `next build` with the field named.
export const posts = readPosts(cms, postsFile);
export const pages = readPages(cms, pagesFile);
export const site = siteSchema.parse(siteFile).site;
export const activity = readActivity(cms, activityFile);

export const livePosts = () => publishedPosts(posts);
export const postPages = () => postsWithPages(posts);
export const livePages = () => publishedPages(pages);
export const nav = () => navPages(pages);
