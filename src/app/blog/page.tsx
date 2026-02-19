import Link from "next/link";

const posts = [
  {
    slug: "lmsa-ne-buffalo-prep",
    title: "Countdown to Buffalo",
    summary: "Updates, reflections, and behind-the-scenes as AP: MED prepares for the LMSA-NE Conference.",
    date: "February, 2026",
  },
  {
    slug: "why-i-started-apmed",
    title: "Why I Started AP: MED",
    summary: "A short reflection on building a mentorship and storytelling platform for Latino and underrepresented students in medicine.",
    date: "January, 2026",
  },
];

export default function BlogPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold mb-8 text-black dark:text-white">
        blog
      </h1>

      <div className="space-y-6">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="group p-6 rounded-lg border border-neutral-200 dark:border-gray-700 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all duration-200 bg-white dark:bg-gray-800"
          >
            <Link href={`/blog/${post.slug}`} className="block">
              <h2 className="text-2xl font-semibold mb-2 group-hover:text-[var(--global-theme-color)] transition-colors duration-200 text-black dark:text-white">
                {post.title}
              </h2>
              <p className="text-sm text-black dark:text-neutral-400 mb-3">
                {post.date}
              </p>
              <p className="text-black dark:text-neutral-300 leading-relaxed whitespace-pre-line">
                {post.summary}
              </p>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
