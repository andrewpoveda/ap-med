import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="space-y-12">
      {/* Profile Section */}
      <div className="flex flex-col md:flex-row items-start gap-8">
        <div className="flex-shrink-0">
          <div className="relative w-48 h-48 rounded-lg overflow-hidden border-2 border-neutral-200 dark:border-gray-700">
            <Image
              src="/headshot.jpg"
              alt="Andrew Poveda"
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
        <div className="flex-1">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-black dark:text-white">
            Andrew Poveda
          </h1>
          <p className="text-lg text-black dark:text-neutral-300 mb-4">
            Founder & Host of AP: MED
          </p>
          <div className="space-y-2 text-black dark:text-neutral-400">
            <p>Montclair State University/Rutgers NJMS</p>
            <p>NYC Metropolitan Area</p>
            <p className="pt-2">
              Reach me at{" "}
              <a
                href="mailto:apmedpodcast@gmail.com"
                className="text-[var(--global-theme-color)] hover:underline"
              >
                apmedpodcast@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* About Section */}
      <section>
        <p className="text-lg leading-relaxed text-black dark:text-neutral-300 mb-6">
          I&apos;m a passionate premed student and founder of AP: MED — a mentorship and storytelling platform amplifying underrepresented voices in medicine. You can learn more about my work on{" "}
          <a
            href="https://linkedin.com/in/andrew-poveda"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--global-theme-color)] hover:underline"
          >
            LinkedIn
          </a>
          .
        </p>
      </section>

      {/* AP: MED Section */}
      <section>
        <h2 className="text-3xl font-bold mb-6 text-black dark:text-white">
          About AP: MED
        </h2>
        <div className="prose max-w-none">
          <p className="text-lg text-black dark:text-neutral-300 leading-relaxed mb-6">
            AP: MED is a mentorship and storytelling platform centered on uplifting
            Latino and underrepresented voices in medicine. Through honest
            conversations with students, residents, physicians, and leaders, the
            goal is to make the path to medicine feel more human, more accessible,
            and more community-driven.
          </p>

          <p className="text-lg text-black dark:text-neutral-300 leading-relaxed mb-6">
            I started AP: MED as a first-year BS/MD student who didn&apos;t see enough
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
              href="https://www.instagram.com/apmedicine/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--global-theme-color)] hover:underline"
            >
              @apmedicine
            </a>
            .
          </p>
        </div>
      </section>

      {/* News Section */}
      <section>
        <h2 className="text-2xl font-bold mb-6 text-black dark:text-white">news</h2>
        <div className="space-y-4">
          <div className="flex gap-6 pb-4 border-b border-neutral-200 dark:border-gray-700 last:border-0">
            <div className="flex-shrink-0 w-20 text-sm font-medium text-[var(--global-theme-color)]">
              2026
            </div>
            <div className="flex-1 text-black dark:text-neutral-300 space-y-2">
              <p>
                Awarded 2nd Place for Research at the LMSA-NE Regional Conference, presenting work that highlighted identity and representation in medicine.
              </p>
              <p>
                Formalized partnership with LMSA-Northeast, establishing AP: MED as an official student resource for mentorship and storytelling.
              </p>
              <p>
                Launched the AP: MED Mentorship Directory — a growing national network connecting underrepresented premeds with mentors across medicine.
              </p>
              <p>
                Expanded AP: MED’s content series with new interviews, identity-driven storytelling, and community-focused episodes.
              </p>
            </div>
          </div>

          <div className="flex gap-6 pb-4 border-b border-neutral-200 dark:border-gray-700 last:border-0">
            <div className="flex-shrink-0 w-20 text-sm font-medium text-[var(--global-theme-color)]">
              2025
            </div>
            <div className="flex-1 text-black dark:text-neutral-300">
              Founded AP: MED — a mentorship and storytelling platform amplifying underrepresented voices in medicine. Began research and entered the BS/MD pathway.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
