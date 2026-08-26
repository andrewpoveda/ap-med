import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BlogArticle from "@/components/BlogArticle";
import { blogPosts, getBlogPost } from "@/data/blog";
import { absoluteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  const title = post.seoTitle;
  const url = absoluteUrl(`/blog/${post.slug}`);
  const image = absoluteUrl("/opengraph-image");
  return {
    title,
    description: post.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    authors: [{ name: post.author }],
    openGraph: { title, description: post.description, url, type: "article", publishedTime: post.published, modifiedTime: post.updated, authors: [post.author], images: [{ url: image, width: 1200, height: 630, alt: "AP MED Mentors editorial guide" }] },
    twitter: { card: "summary_large_image", title, description: post.description, images: [image] },
  };
}

export default async function BlogArticleRoute({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();
  return <BlogArticle post={post} />;
}
