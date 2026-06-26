import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About AP MED | Free Pre-Med Mentorship Platform",
  description:
    "AP MED is a free mentorship platform and podcast for underrepresented pre-med students, founded by Andrew Poveda.",
};

export default function AboutPage() {
  return (
    <div className="space-y-12">
      {/* Profile Section */}
      <div className="flex flex-col md:flex-row items-start gap-8">
        <div className="flex-shrink-0">
          <div className="relative w-48 h-48 rounded-lg overflow-hidden border-2 border-[#e8e4dc]">
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-[#1a1a2e]">
            About AP MED
          </h1>
          <p className="text-lg text-[#4a4a5a] mb-4">
            Founded & hosted by Andrew Poveda
          </p>
          <div className="space-y-2 text-[#6b6b6b]">
            <p>Montclair State University / Rutgers NJMS</p>
            <p>NYC Metropolitan Area</p>
            <p className="pt-2">
              Contact us at{" "}
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

      {/* AP MED Section */}
      <section>
        <h2 className="text-3xl font-bold mb-6 text-[#1a1a2e]">
          Our mission
        </h2>
        <div className="prose max-w-none">
          <p className="text-lg text-[#4a4a5a] leading-relaxed mb-6">
            AP MED is a mentorship and storytelling platform centered on uplifting
            Latino and underrepresented voices in medicine. Through honest
            conversations with students, residents, physicians, and leaders, the
            goal is to make the path to medicine feel more human, more accessible,
            and more community-driven.
          </p>

          <p className="text-lg text-[#4a4a5a] leading-relaxed mb-6">
            I started AP MED as a first-year BS/MD student who didn&apos;t see enough
            stories that reflected my background, my community, or the realities
            many of us face. Every episode is meant to highlight identity, roots,
            resilience, and the different ways people find their place in medicine.
          </p>

          <p className="text-lg text-[#4a4a5a] leading-relaxed mb-6">
            Today, AP MED continues to grow through partnerships, including LMSA-NE,
            and through the support of the students and mentors who believe in the
            mission. This platform is for anyone who has ever felt unseen in their
            journey — and for those who want to help change that.
          </p>

          <p className="text-lg text-[#4a4a5a] leading-relaxed">
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
        <h2 className="text-2xl font-bold mb-6 text-[#1a1a2e]">news</h2>
        <div className="space-y-4">
          <div className="flex gap-6 pb-4 border-b border-[#e8e4dc] last:border-0">
            <div className="flex-shrink-0 w-20 text-sm font-medium text-[var(--global-theme-color)]">
              2026
            </div>
            <div className="flex-1 text-[#4a4a5a] space-y-2">
              <p>
                Awarded 2nd Place for Research at the LMSA-NE Regional Conference, presenting work that highlighted identity and representation in medicine.
              </p>
              <p>
                Formalized partnership with LMSA-Northeast, establishing AP MED as an official student resource for mentorship and storytelling.
              </p>
              <p>
                Launched the AP MED Mentorship Directory — a growing national network connecting underrepresented premeds with mentors across medicine.
              </p>
              <p>
                Expanded AP MED’s content series with new interviews, identity-driven storytelling, and community-focused episodes.
              </p>
            </div>
          </div>

          <div className="flex gap-6 pb-4 border-b border-[#e8e4dc] last:border-0">
            <div className="flex-shrink-0 w-20 text-sm font-medium text-[var(--global-theme-color)]">
              2025
            </div>
            <div className="flex-1 text-[#4a4a5a]">
              Founded AP MED — a mentorship and storytelling platform amplifying underrepresented voices in medicine. Began research and entered the BS/MD pathway.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
