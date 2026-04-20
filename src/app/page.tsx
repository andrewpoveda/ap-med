import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-12">
      <div className="text-center space-y-6">
        <h1 className="text-5xl md:text-6xl font-bold text-[var(--global-text-color)]">
          Welcome
        </h1>
        <p className="text-xl text-[var(--global-text-color)] dark:text-neutral-300 max-w-2xl mx-auto leading-relaxed">
          Exploring medicine, mentorship, and storytelling through the lens of underrepresented voices in healthcare.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/profile"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-[var(--global-text-color)] mb-2">
            About
          </h2>
          <p className="text-[var(--global-text-color)] dark:text-neutral-300">
            Learn about my journey and the AP: MED platform for underrepresented voices in medicine.
          </p>
        </Link>

        <Link
          href="/projects"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-[var(--global-text-color)] mb-2">
            AP: MED
          </h2>
          <p className="text-[var(--global-text-color)] dark:text-neutral-300">
            Explore the AP: MED hub, episodes, community, and resources.
          </p>
        </Link>

        <Link
          href="/blog"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-[var(--global-text-color)] mb-2">
            Blog
          </h2>
          <p className="text-[var(--global-text-color)] dark:text-neutral-300">
            Read articles and insights on medicine and mentorship.
          </p>
        </Link>

        <Link
          href="/mentors"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-[var(--global-text-color)] mb-2">
            Mentors
          </h2>
          <p className="text-[var(--global-text-color)] dark:text-neutral-300">
            Connect with mentors and leaders in medicine.
          </p>
        </Link>
      </div>
    </div>
  );
}
