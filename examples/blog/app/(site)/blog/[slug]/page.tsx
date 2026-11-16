import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { postPages } from "@/lib/content";
import { PostArticle } from "./PostArticle";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => postPages().map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = postPages().find((p) => p.slug === slug);
  return post ? { title: post.title, description: post.description } : {};
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = postPages().find((p) => p.slug === slug);
  if (!post) notFound();
  return <PostArticle post={post} />;
}
