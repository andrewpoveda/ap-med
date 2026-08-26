import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Mail } from "lucide-react";
import BlogIndex from "@/components/BlogIndex";
import { blogPosts, getBlogReadingTime } from "@/data/blog";
import { absoluteUrl } from "@/lib/site";

const canonical = absoluteUrl("/blog");

export const metadata: Metadata = {
  title: "Mentorship Program Guides | AP MED Blog",
  description: "Practical guides for building, matching, managing, measuring, and scaling healthcare, education, association, and professional mentorship programs.",
  alternates: { canonical },
  robots: { index: true, follow: true },
  openGraph: {
    title: "The AP MED Mentors editorial library",
    description: "Clear, practical guidance for people who operate structured mentorship programs.",
    url: canonical,
    type: "website",
    images: [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: "AP MED Mentors editorial guides" }],
  },
  twitter: { card: "summary_large_image", title: "Mentorship Program Guides | AP MED Blog", description: "Clear, practical guidance for people who operate structured mentorship programs.", images: [absoluteUrl("/opengraph-image")] },
};

export default function BlogPage() {
  const featured = blogPosts.find((post) => post.featured) ?? blogPosts[0];
  const latest = blogPosts.filter((post) => post.slug !== featured.slug);
  const featuredReadingTime = getBlogReadingTime(featured);

  return (
    <div className="seo-shell blog-index">
      <div className="seo-breadcrumb"><Link href="/">Home</Link><span>/</span><span>Blog</span></div>
      <header className="blog-hero">
        <div className="seo-eyebrow"><BookOpen size={14} /> AP MED Editorial</div>
        <h1>Useful thinking for people who run mentorship programs.</h1>
        <p>Buying guides, operating frameworks, and practical lessons for healthcare, education, associations, and professional pipelines.</p>
      </header>

      <section className="featured-article" aria-labelledby="featured-heading">
        <div className="featured-visual" aria-label="Editorial illustration representing a structured professional mentorship pipeline">
          <span>AP MED FIELD GUIDE / 01</span>
          <div><i>Pre-health</i><ArrowRight /><i>Training</i><ArrowRight /><i>Practice</i></div>
          <strong>Build the system around the people.</strong>
        </div>
        <div>
          <span>{featured.category} · {featuredReadingTime}</span>
          <h2 id="featured-heading">{featured.title}</h2>
          <p>{featured.description}</p>
          <Link className="seo-button seo-button-primary" href={`/blog/${featured.slug}`}>Read the featured guide <ArrowRight size={17} /></Link>
        </div>
      </section>

      <section className="latest-articles" aria-labelledby="latest-heading">
        <div className="section-heading"><span>Editorial library</span><h2 id="latest-heading">Latest articles</h2><p>Search the library or filter by the kind of program problem you are solving.</p></div>
        <BlogIndex posts={latest.map((post) => ({ slug: post.slug, category: post.category, title: post.title, description: post.description, updated: post.updated, readingTime: getBlogReadingTime(post) }))} />
      </section>

      <section className="editorial-cta">
        <Mail size={22} />
        <div><span>AP MED editorial updates</span><h2>Get the next practical guide.</h2><p>We publish buying guidance and operating lessons for mentorship program leaders. No inflated benchmarks or generic trend summaries.</p></div>
        <a className="seo-button seo-button-secondary" href="mailto:apmedpodcast@gmail.com?subject=AP%20MED%20editorial%20updates">Join the list <ArrowRight size={16} /></a>
      </section>
    </div>
  );
}
