import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { livePages } from "@/lib/content";
import { PageArticle } from "./PageArticle";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => livePages().map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = livePages().find((p) => p.slug === slug);
  return page ? { title: page.title, description: page.description } : {};
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = livePages().find((p) => p.slug === slug);
  if (!page) notFound();
  return <PageArticle page={page} />;
}
