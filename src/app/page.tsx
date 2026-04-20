import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-12">
      <div className="text-center space-y-6">
        <h1 className="text-5xl md:text-6xl font-bold text-black dark:text-white">
          Welcome
        </h1>
        <p className="text-xl text-black dark:text-white max-w-2xl mx-auto leading-relaxed">
          Exploring medicine, mentorship, and storytelling through the lens of underrepresented voices in healthcare.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/about"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-black hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">
            About
          </h2>
          <p className="text-black dark:text-white">
            Learn about my journey and the AP: MED platform for underrepresented voices in medicine.
          </p>
        </Link>

        <Link
          href="/projects"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-black hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">
            AP: MED
          </h2>
          <p className="text-black dark:text-white">
            Explore the AP: MED hub, episodes, community, and resources.
          </p>
        </Link>

        <Link
          href="/blog"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-black hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">
            Blog
          </h2>
          <p className="text-black dark:text-white">
            Read articles and insights on medicine and mentorship.
          </p>
        </Link>

        <Link
          href="/mentors"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-black hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">
            Mentors
          </h2>
          <p className="text-black dark:text-white">
            Connect with mentors and leaders in medicine.
          </p>
        </Link>
      </div>
    </div>
  );
}
