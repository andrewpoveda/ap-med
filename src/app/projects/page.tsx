"use client";

import Link from "next/link";

export default function ProjectsPage() {
  return (
    <div className="space-y-10">
      <h1 className="text-4xl font-bold text-black dark:text-white mb-6">
        AP: MED hub
      </h1>

      <p className="text-lg text-black dark:text-neutral-300 leading-relaxed max-w-2xl">
        This page highlights the core parts of AP: MED — the stories, the community,
        the partnerships, and the resources built to support Latino and
        underrepresented students in medicine.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Episodes */}
        <Link
          href="/episodes"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">
            Episodes
          </h2>
          <p className="text-black dark:text-neutral-300">
            Conversations with students, residents, physicians, and leaders
            sharing their journeys in medicine.
          </p>
        </Link>

        {/* Directory */}
        <Link
          href="/directory"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">
            Directory
          </h2>
          <p className="text-black dark:text-neutral-300">
            A growing mentorship directory of AP: MED guests (coming soon).
          </p>
        </Link>

        {/* Community */}
        <Link
          href="/community"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">
            Community
          </h2>
          <p className="text-black dark:text-neutral-300">
            Stories, updates, and ways to get involved with the AP: MED mission.
          </p>
        </Link>

        {/* Partners */}
        <Link
          href="/partners"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">
            Partners
          </h2>
          <p className="text-black dark:text-neutral-300">
            Collaborations and organizations supporting AP: MED, including LMSA‑NE.
          </p>
        </Link>

        {/* Resources */}
        <Link
          href="/resources"
          className="p-6 rounded-lg border border-neutral-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-[var(--global-theme-color)] hover:shadow-md transition-all"
        >
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-2">
            Resources
          </h2>
          <p className="text-black dark:text-neutral-300">
            Guides, tools, and support for premeds and medical students.
          </p>
        </Link>
      </div>
    </div>
  );
}
