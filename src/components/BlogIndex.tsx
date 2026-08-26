"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { blogCategories, type BlogPost } from "@/data/blog";

type BlogCardData = Pick<BlogPost, "slug" | "category" | "title" | "description" | "updated"> & { readingTime: string };

export default function BlogIndex({ posts }: { posts: BlogCardData[] }) {
  const [category, setCategory] = useState<(typeof blogCategories)[number]>("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return posts.filter((post) => {
      const categoryMatch = category === "All" || post.category === category;
      const queryMatch = !normalized || `${post.title} ${post.description} ${post.category}`.toLowerCase().includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [category, posts, query]);

  return (
    <>
      <div className="blog-tools">
        <div className="category-filters" aria-label="Filter articles by category">
          {blogCategories.map((item) => (
            <button key={item} type="button" className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
        <label className="blog-search"><Search size={16} /><span className="sr-only">Search articles</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search articles" /></label>
      </div>

      {filtered.length > 0 ? (
        <div className="article-card-grid">
          {filtered.map((post) => (
            <article key={post.slug}>
              <div className="article-card-visual" aria-hidden="true"><span>{post.category}</span><i /><i /><i /></div>
              <div className="article-card-copy">
                <div><span>{post.category}</span><time dateTime={post.updated}>{post.readingTime}</time></div>
                <h2>{post.title}</h2>
                <p>{post.description}</p>
                <Link href={`/blog/${post.slug}`}>Read article <ArrowRight size={16} /></Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-articles"><strong>No articles match that search.</strong><p>Try another keyword or choose a different category.</p></div>
      )}
    </>
  );
}
