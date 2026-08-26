import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, GraduationCap, HeartPulse, Network, Sparkles } from "lucide-react";
import { alternatives } from "@/data/alternatives";
import { absoluteUrl } from "@/lib/site";

const canonical = absoluteUrl("/alternatives");

export const metadata: Metadata = {
  title: "Mentoring Software Alternatives & Comparisons | AP MED Mentors",
  description: "Compare mentoring platforms for corporate, university, association, healthcare, and structured professional pipeline programs.",
  alternates: { canonical },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Find the right mentorship platform for your program",
    description: "Independent-minded comparisons for teams evaluating mentoring software across employee, education, association, and professional pipeline use cases.",
    url: canonical,
    type: "website",
    images: [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: "AP MED Mentors comparison guides" }],
  },
  twitter: { card: "summary_large_image", title: "Mentoring Software Alternatives | AP MED", description: "Compare mentoring platforms for corporate, university, association, healthcare, and professional pipeline programs.", images: [absoluteUrl("/opengraph-image")] },
};

const programModels = [
  { icon: BriefcaseBusiness, title: "Corporate mentoring", text: "Employee development, leadership, onboarding, internal mobility, and workplace connection." },
  { icon: GraduationCap, title: "University mentoring", text: "Peer support, student belonging, retention, career readiness, and alumni connection." },
  { icon: Network, title: "Association programs", text: "Member development, professional community, cohorts, and board-led initiatives." },
  { icon: HeartPulse, title: "Professional pipelines", text: "Applications, eligibility, stage-aware cohorts, structured matching, and repeated program cycles." },
];

export default function AlternativesHub() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "AP MED Mentors Alternatives",
    url: canonical,
    description: metadata.description,
    hasPart: alternatives.map((alternative) => ({
      "@type": "WebPage",
      name: `${alternative.name} Alternative`,
      url: absoluteUrl(`/alternatives/${alternative.slug}`),
    })),
  };

  return (
    <div className="seo-shell alternatives-hub">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <div className="seo-breadcrumb"><Link href="/">Home</Link><span>/</span><span>Alternatives</span></div>
      <header className="hub-hero">
        <div className="seo-eyebrow"><Sparkles size={14} /> Mentoring software comparisons</div>
        <h1>Find the right mentorship platform for your program</h1>
        <p>Mentorship software varies significantly depending on whether an organization is running corporate mentoring, university mentoring, association programs, healthcare pipelines, or structured cohort-based mentorship.</p>
      </header>

      <section className="program-models" aria-labelledby="program-model-heading">
        <div className="section-heading">
          <span>Start with the operating model</span>
          <h2 id="program-model-heading">Different programs need different infrastructure</h2>
          <p>The most useful shortlist begins with who participates, who owns the program, how matches are approved, and what outcomes the organization must report.</p>
        </div>
        <div>{programModels.map((model) => { const Icon = model.icon; return <article key={model.title}><Icon size={21} /><h3>{model.title}</h3><p>{model.text}</p></article>; })}</div>
      </section>

      <section className="hub-comparisons" aria-labelledby="comparison-heading">
        <div className="section-heading">
          <span>Alternative guides</span>
          <h2 id="comparison-heading">Research each platform in context</h2>
          <p>Every guide explains where the competitor may be a stronger fit, where AP MED differs, and which requirements deserve direct validation.</p>
        </div>
        <div className="alternative-card-grid">
          {alternatives.map((alternative, index) => (
            <article key={alternative.slug}>
              <div><span>{String(index + 1).padStart(2, "0")}</span><small>{alternative.shortPosition}</small></div>
              <h3>{alternative.name} alternative</h3>
              <p>{alternative.description}</p>
              <Link href={`/alternatives/${alternative.slug}`}>Read the {alternative.name} comparison <ArrowRight size={16} /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="hub-positioning">
        <div><span>AP MED Mentors</span><h2>Mentorship infrastructure built for healthcare, education, and professional pipelines.</h2></div>
        <div><p>AP MED focuses on organizations managing structured mentorship programs across stages of professional development rather than attempting to be generic HR software.</p><p>The product model starts with participant intake: applications, review, matching, relationship activity, milestones, communications, measurement, and the next cohort.</p><Link className="seo-button seo-button-primary" href="/about">Explore AP MED Mentors <ArrowRight size={17} /></Link></div>
      </section>
    </div>
  );
}
