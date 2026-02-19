export default function AboutPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold mb-8 text-black dark:text-white">
        about
      </h1>

      <div className="prose max-w-none">
        <p className="text-lg text-black dark:text-neutral-300 leading-relaxed mb-6">
          AP: MED is a mentorship and storytelling platform centered on uplifting
          Latino and underrepresented voices in medicine. Through honest
          conversations with students, residents, physicians, and leaders, the
          goal is to make the path to medicine feel more human, more accessible,
          and more community-driven.
        </p>

        <p className="text-lg text-black dark:text-neutral-300 leading-relaxed mb-6">
          I started AP: MED as a first-year BS/MD student who didn’t see enough
          stories that reflected my background, my community, or the realities
          many of us face. Every episode is meant to highlight identity, roots,
          resilience, and the different ways people find their place in medicine.
        </p>

        <p className="text-lg text-black dark:text-neutral-300 leading-relaxed mb-6">
          Today, AP: MED continues to grow through partnerships, including LMSA-NE,
          and through the support of the students and mentors who believe in the
          mission. This platform is for anyone who has ever felt unseen in their
          journey — and for those who want to help change that.
        </p>

        <p className="text-lg text-black dark:text-neutral-300 leading-relaxed">
          Follow along on Instagram for updates, new episodes, and community work:{" "}
          <a
            href="https://www.instagram.com/apmedpodcast/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--global-theme-color)] hover:underline"
          >
            @apmedpodcast
          </a>
          .
        </p>
      </div>
    </div>
  );
}
