import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Quote } from "lucide-react";
import type { BlogPost } from "@/data/blog";
import { getBlogPost, getBlogReadingTime } from "@/data/blog";
import { absoluteUrl, SITE_NAME, SITE_URL } from "@/lib/site";

function StructuredData({ value }: { value: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, "\\u003c") }} />;
}

export default function BlogArticle({ post }: { post: BlogPost }) {
  const canonical = absoluteUrl(`/blog/${post.slug}`);
  const related = post.related.map(getBlogPost).filter((item): item is BlogPost => Boolean(item));
  const readingTime = getBlogReadingTime(post);
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.published,
    dateModified: post.updated,
    mainEntityOfPage: canonical,
    image: absoluteUrl("/opengraph-image"),
    author: { "@type": "Organization", name: "AP MED Editorial", url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL, logo: { "@type": "ImageObject", url: absoluteUrl("/favicon.ico") } },
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: absoluteUrl("/blog") },
      { "@type": "ListItem", position: 3, name: post.title, item: canonical },
    ],
  };

  return (
    <div className="seo-shell blog-article">
      <StructuredData value={articleSchema} />
      <StructuredData value={breadcrumbSchema} />
      <div className="seo-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/blog">Blog</Link><span>/</span><span>{post.title}</span></div>

      <header className="article-header">
        <span>{post.category}</span>
        <h1>{post.title}</h1>
        <p>{post.description}</p>
        <div className="article-byline">
          <div className="author-mark">AP</div>
          <div><strong>{post.author}</strong><span>Published <time dateTime={post.published}>{new Date(`${post.published}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time> · Updated <time dateTime={post.updated}>{new Date(`${post.updated}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></span></div>
          <div><Clock3 size={15} /> {readingTime}</div>
        </div>
      </header>

      <div className="article-hero-visual" role="img" aria-label={`Editorial visual for ${post.title}`}>
        <div><span>AP MED / {post.category}</span><strong>Programs work when the operating model is clear.</strong></div>
        <div className="visual-orbit" aria-hidden="true"><i>Intake</i><i>Match</i><i>Support</i><i>Measure</i><b>MENTORSHIP<br />SYSTEM</b></div>
      </div>

      <div className="article-layout">
        <aside className="page-toc article-toc" aria-label="Article contents">
          <strong>In this article</strong>
          {post.sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.number && <span>{section.number}</span>}{section.title}</a>)}
        </aside>

        <article className="article-body">
          <p className="article-deck">{post.intro}</p>

          {post.sections.map((section, sectionIndex) => (
            <section id={section.id} key={section.id}>
              {section.number && <span className="section-number">{section.number}</span>}
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}><CheckCircle2 size={17} /> <span>{bullet}</span></li>)}</ul>}
              {section.callout && <aside className="article-callout"><span>{section.callout.label}</span><p>{section.callout.text}</p></aside>}
              {section.table && <div className="article-table"><table><thead><tr>{section.table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row) => <tr key={row.join("-")}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div>}

              {sectionIndex === 1 && (
                <figure className="article-quote">
                  <Quote size={28} />
                  <blockquote>{post.pullQuote.quote}</blockquote>
                  <figcaption>{post.pullQuote.attribution}</figcaption>
                </figure>
              )}

              {sectionIndex === 2 && (
                <aside className="article-support-panel">
                  <div><span>{post.supporting.label}</span><h3>{post.supporting.title}</h3><p>{post.supporting.body}</p></div>
                  <ul>
                    {post.supporting.items.map((item) => <li key={item}><CheckCircle2 size={16} /><span>{item}</span></li>)}
                  </ul>
                </aside>
              )}
            </section>
          ))}

          <aside className="inline-article-cta">
            <div><span>AP MED Mentors</span><h2>Operating a structured professional pipeline?</h2><p>See how applications, matching, milestones, relationship activity, surveys, and reporting can fit into one program model.</p></div>
            <Link className="seo-button seo-button-primary" href="/about">Explore AP MED Mentors <ArrowRight size={17} /></Link>
          </aside>
        </article>
      </div>

      <section className="related-articles">
        <div className="section-heading"><span>Continue reading</span><h2>Related articles</h2></div>
        <div>{related.map((item) => <article key={item.slug}><span>{item.category}</span><h3>{item.title}</h3><p>{item.description}</p><Link href={`/blog/${item.slug}`}>Read article <ArrowRight size={15} /></Link></article>)}</div>
      </section>

      <section className="final-seo-cta article-final-cta">
        <span>AP MED Mentors</span>
        <h2>Build the program, not just the match.</h2>
        <p>Infrastructure for healthcare, education, association, and professional pipeline mentorship programs.</p>
        <div className="seo-actions"><Link className="seo-button seo-button-primary" href="/about">Explore AP MED Mentors <ArrowRight size={17} /></Link><a className="seo-button seo-button-light" href="mailto:apmedpodcast@gmail.com">Talk to us</a></div>
      </section>
    </div>
  );
}
