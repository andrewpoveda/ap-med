type Mentor = {
  name: string;
  role: string;
  identity: string[];
  specialty: string;
  openTo: string[];
  maxMentees: number;
};

export default function MentorCard({ mentor }: { mentor: Mentor }) {
  return (
    <div className="border border-neutral-300 dark:border-neutral-700 rounded-lg p-4 space-y-2">
      <h2 className="text-xl font-semibold text-black dark:text-white">
        {mentor.name}
      </h2>

      <p className="text-black dark:text-neutral-300">{mentor.role}</p>

      <p className="text-sm text-black dark:text-neutral-400">
        Specialty: {mentor.specialty}
      </p>

      <div className="flex flex-wrap gap-2 pt-2">
        {mentor.identity.map((tag) => (
          <span
            key={tag}
            className="px-2 py-1 text-xs rounded bg-neutral-200 dark:bg-neutral-700 text-black dark:text-white"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
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
        href={`https://docs.google.com/forms/d/e/1FAIpQLSdcoPWXIt_UxQPOHJ4OHe9s9Gfxf6qTMtPaIPpiJGmOTqahjg/viewform?usp=pp_url&entry.478643649=${encodeURIComponent(
          mentor.name
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 px-3 py-2 text-sm rounded bg-[var(--global-theme-color)] text-white hover:opacity-90 inline-block"
      >
        Request Mentorship
      </a>
    </div>
  );
}
