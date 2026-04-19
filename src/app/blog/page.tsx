export default function Blog() {
  return (
<section className="mt-16">
  {/* Blog Section */}
  <h2 className="text-2xl font-bold mb-6 text-black dark:text-white">blog</h2>

  <div className="space-y-8">

    {/* Post 1 — Harvard WPC Reflection */}
    <article className="flex flex-col gap-2 pb-6 border-b border-neutral-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold text-black dark:text-white">
        What I Learned at the Harvard WPC
      </h3>
      <time className="text-sm text-neutral-500 dark:text-neutral-400">March 2026</time>
      <p className="text-neutral-700 dark:text-neutral-300">
        One of the biggest lessons I took from the Harvard WPC is that storytelling is a form of leadership. The physicians who made the deepest impact weren&apos;t just experts, they were storytellers. That validated the entire foundation of AP:MED.
      </p>
    </article>

    {/* Post 2 — LMSA-NE Conference */}
    <article className="flex flex-col gap-2 pb-6 border-b border-neutral-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold text-black dark:text-white">
        What I Learned at the LMSA-NE Conference
      </h3>
      <time className="text-sm text-neutral-500 dark:text-neutral-400">March 2026</time>
      <p className="text-neutral-700 dark:text-neutral-300">
        Reflections from presenting research, connecting with leaders, and seeing firsthand how community-driven medicine shapes the next generation.
      </p>
    </article>

    {/* Post 3 — Directory Introduction */}
    <article className="flex flex-col gap-2 pb-6 border-b border-neutral-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold text-black dark:text-white">
        Introducing the AP: MED Mentorship Directory
      </h3>
      <time className="text-sm text-neutral-500 dark:text-neutral-400">February 2026</time>
      <p className="text-neutral-700 dark:text-neutral-300">
        A look at how the directory started, why it matters, and how it&apos;s becoming a national resource for students seeking guidance in medicine.
      </p>
    </article>

    {/* Post 4 — First-Gen Founder */}
    <article className="flex flex-col gap-2 pb-6 border-b border-neutral-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold text-black dark:text-white">
        Building AP: MED as a First-Gen Founder
      </h3>
      <time className="text-sm text-neutral-500 dark:text-neutral-400">January 2026</time>
      <p className="text-neutral-700 dark:text-neutral-300">
        Behind the scenes of building a platform while navigating the premed journey — the challenges, the wins, and the lessons shaping AP: MED.
      </p>
    </article>

    {/* Post 5 — Founder Story */}
    <article className="flex flex-col gap-2 pb-6 border-b border-neutral-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold text-black dark:text-white">
        Why I Started AP: MED
      </h3>
      <time className="text-sm text-neutral-500 dark:text-neutral-400">January 2026</time>
      <p className="text-neutral-700 dark:text-neutral-300">
        A founder note on identity, representation, and the moment I realized storytelling could become a mentorship platform for underrepresented premeds.
      </p>
    </article>

    {/* Post 6 — Platform Overview */}
    <article className="flex flex-col gap-2 pb-6 border-b border-neutral-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold text-black dark:text-white">
        What AP: MED Is & How to Use This Platform
      </h3>
      <time className="text-sm text-neutral-500 dark:text-neutral-400">January 2026</time>
      <p className="text-neutral-700 dark:text-neutral-300">
        A quick guide to AP: MED — what we do, who we serve, and how students can use the directory, episodes, and resources to navigate their premed journey.
      </p>
    </article>

  </div>
</section>
  );
}
