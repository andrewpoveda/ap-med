"use client";

type Mentor = {
  name: string;
  role: string;
  identity: string[];
  specialty: string;
  openTo: string[];
  maxMentees: number;
  episode?: string;
};

import { track } from '@vercel/analytics';

export default function MentorCard({ mentor }: { mentor: Mentor }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 shadow-sm hover:shadow-md transition bg-white dark:bg-neutral-900">
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
        {mentor.name}
      </h2>

      <p className="text-neutral-700 dark:text-neutral-300">{mentor.role}</p>

      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
        Specialty: {mentor.specialty}
      </p>

      <div className="flex flex-wrap gap-2 pt-3">
        {mentor.identity.map((tag) => (
          <span
            key={tag}
            className="px-2 py-1 text-xs rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-3">
        {mentor.openTo.map((item) => (
          <span
            key={item}
            className="px-2 py-1 text-xs rounded bg-[var(--global-theme-color)] text-white"
          >
            {item}
          </span>
        ))}
      </div>

      <a
        onClick={() => track('mentor_click', { name: mentor.name })}
        href={`https://docs.google.com/forms/d/e/1FAIpQLSdcoPWXIt_UxQPOHJ4OHe9s9Gfxf6qTMtPaIPpiJGmOTqahjg/viewform?usp=pp_url&entry.478643649=${encodeURIComponent(
          mentor.name
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block px-3 py-2 text-sm rounded bg-[var(--global-theme-color)] text-white hover:opacity-90"
      >
        Request Mentorship
      </a>
      {mentor.episode && (
  <a
    href={mentor.episode}
    target="_blank"
    rel="noopener noreferrer"
    className="mt-2 inline-block px-3 py-2 text-sm rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white hover:opacity-90"
  >
    Listen to Episode
  </a>
)}
    </div>
  );
}
