import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  GraduationCap,
  Network,
  School,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react";
import type { Alternative } from "@/data/alternatives";
import { absoluteUrl, SITE_URL } from "@/lib/site";

const pipeline = ["Intake", "Review", "Match", "Support", "Measure", "Repeat"];
const audienceIcons = [Stethoscope, Network, GraduationCap, School];

function StructuredData({ value }: { value: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, "\\u003c") }}
    />
  );
}

function ProductWorkflow() {
  const stages = [
    { icon: Users, title: "Participant intake", details: "Cohort applications and eligibility review" },
    { icon: Network, title: "Matching administration", details: "Deterministic scoring and board decisions" },
    { icon: CalendarDays, title: "Relationship records", details: "Meetings, goals, milestones, and scheduling" },
    { icon: BarChart3, title: "Program reporting", details: "Activity, surveys, analytics, and CSV exports" },
  ];

  return (
    <div className="product-workflow" aria-label="Implemented AP MED Mentors workflow areas">
      <div className="product-workflow-heading">
        <span>Implemented product areas</span>
        <strong>How a structured cohort moves through AP MED</strong>
      </div>
      <div className="product-workflow-stages">
        {stages.map(({ icon: Icon, title, details }, index) => (
          <div key={title}>
            <i><Icon size={19} /></i>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{title}</h3>
            <p>{details}</p>
            {index < stages.length - 1 && <ArrowRight aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AlternativePage({ alternative }: { alternative: Alternative }) {
  const pageUrl = absoluteUrl(`/alternatives/${alternative.slug}`);
  const reviewedLabel = new Date(`${alternative.reviewed}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const toc = [
    ["quick-answer", "Quick answer"],
    ["comparison", `AP MED vs ${alternative.name}`],
    ["why-alternatives", "Why teams compare"],
    ["better-choice", `When ${alternative.name} fits`],
    ["pipeline", "The AP MED model"],
    ["product", "Product preview"],
    ["switching", "Evaluating a switch"],
    ["faq", "FAQ"],
  ];

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: `${alternative.name} Alternative`, item: pageUrl },
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: alternative.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <div className="seo-shell alternative-page">
      <StructuredData value={breadcrumbSchema} />
      <StructuredData value={faqSchema} />

      <div className="seo-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link><span>/</span><span>{alternative.name} Alternative</span>
      </div>

      <header className="alternative-hero">
        <div className="seo-eyebrow"><Sparkles size={14} /> {alternative.name} Alternative</div>
        <h1>Looking for a {alternative.name} alternative?</h1>
        <p>{alternative.description}</p>
        <div className="seo-actions">
          <Link className="seo-button seo-button-primary" href="/about">Explore AP MED Mentors <ArrowRight size={17} /></Link>
          <Link className="seo-button seo-button-secondary" href="#pipeline">See how it works</Link>
        </div>
        <div className="fit-summary" aria-label="At a glance">
          <h2>Best fit</h2>
          <div><span>AP MED is designed for</span><strong>Professional pipeline programs</strong></div>
          <div><span>{alternative.name} publicly focuses on</span><strong>{alternative.shortPosition}</strong></div>
          <div><span>The decision comes down to</span><strong>Program model and operational fit</strong></div>
        </div>
      </header>

      <div className="editorial-layout">
        <aside className="page-toc" aria-label="On this page">
          <strong>On this page</strong>
          {toc.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          <div className="toc-note"><ShieldCheck size={16} /><span>Competitor details reviewed from public product materials on {reviewedLabel}.</span></div>
        </aside>

        <article className="alternative-content">
          <section id="quick-answer" className="quick-answer">
            <span>Quick answer</span>
            <h2>Is AP MED Mentors a good alternative to {alternative.name}?</h2>
            <p>{alternative.quickAnswer}</p>
          </section>

          <section id="comparison" className="content-section">
            <div className="section-heading">
              <span>Side-by-side</span>
              <h2>AP MED Mentors vs {alternative.name}</h2>
              <p>The AP MED column reflects functionality present in the current product. The {alternative.name} column summarizes current official materials; confirm plan-level details, security, pricing, and integrations during procurement.</p>
            </div>
            <div className="comparison-wrap">
              <table>
                <thead><tr><th>Category</th><th>AP MED Mentors</th><th>{alternative.name}</th></tr></thead>
                <tbody>
                  {alternative.comparison.map((row) => (
                    <tr key={row.label}><th scope="row">{row.label}</th><td>{row.apMed}</td><td>{row.competitor}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="research-note">
              <strong>About the competitor information</strong>
              <p>{alternative.publicPositioning}</p>
              <div className="research-sources" aria-label={`${alternative.name} official sources`}>
                <span>Official sources:</span>
                {alternative.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>)}
              </div>
            </div>
          </section>

          <section id="why-alternatives" className="content-section">
            <div className="section-heading">
              <span>Decision context</span>
              <h2>Why organizations consider alternatives to {alternative.name}</h2>
              <p>{alternative.decisionContext}</p>
            </div>
            <div className="reason-grid">
              {alternative.reasons.map((reason, index) => (
                <div className="reason-card" key={reason.title}><b>{String(index + 1).padStart(2, "0")}</b><h3>{reason.title}</h3><p>{reason.body}</p></div>
              ))}
            </div>
          </section>

          <section id="better-choice" className="content-section competitor-fit">
            <div className="section-heading">
              <span>Where the competitor may win</span>
              <h2>{alternative.name} may make more sense if…</h2>
              <p>{alternative.betterChoiceIntro}</p>
            </div>
            <div className="check-list">
              {alternative.betterChoice.map((item) => (
                <div key={item.title}><i><Check size={16} /></i><div><h3>{item.title}</h3><p>{item.body}</p></div></div>
              ))}
            </div>
          </section>

          <section id="pipeline" className="content-section">
            <div className="section-heading">
              <span>Where AP MED is different</span>
              <h2>{alternative.pipelineHeading}</h2>
              <p>{alternative.pipelineDescription}</p>
            </div>
            <div className="pipeline" aria-label="Intake, review, match, support, measure, repeat">
              {pipeline.map((step, index) => <div key={step}><span>{index + 1}</span><strong>{step}</strong>{index < pipeline.length - 1 && <ArrowRight aria-hidden="true" />}</div>)}
            </div>
            <div className="pipeline-callout">
              <div>
                <span>Healthcare and professional pipeline model</span>
                <h3>Support people as they move through a profession</h3>
                <p>{alternative.pathwayIntro}</p>
              </div>
              <div className="pathways">
                <p><strong>Premed</strong><ArrowRight size={14} /><span>Medical student</span><ArrowRight size={14} /><span>Resident</span><ArrowRight size={14} /><span>Physician</span></p>
                <p><strong>Pre-PA</strong><ArrowRight size={14} /><span>PA student</span><ArrowRight size={14} /><span>PA</span></p>
                <p><strong>Predental</strong><ArrowRight size={14} /><span>Dental student</span><ArrowRight size={14} /><span>Dentist</span></p>
                <p><strong>Prelaw</strong><ArrowRight size={14} /><span>Law student</span><ArrowRight size={14} /><span>Attorney</span></p>
              </div>
            </div>
          </section>

          <section id="product" className="content-section product-section">
            <div className="section-heading">
              <span>Product experience</span>
              <h2>{alternative.productHeading}</h2>
              <p>{alternative.productDescription}</p>
            </div>
            <ProductWorkflow />
            <div className="product-capabilities">
              <span><Users size={17} /> Participant profiles</span>
              <span><CalendarDays size={17} /> Cohort operations</span>
              <span><Network size={17} /> Matching review</span>
              <span><BarChart3 size={17} /> Program reporting</span>
            </div>
          </section>

          <section className="content-section">
            <div className="section-heading"><span>Program fit</span><h2>{alternative.audienceHeading}</h2><p>{alternative.audienceDescription}</p></div>
            <div className="audience-grid">
              {alternative.audiences.map((audience, index) => { const Icon = audienceIcons[index % audienceIcons.length]; return <div key={audience.title}><Icon size={20} /><h3>{audience.title}</h3><p>{audience.text}</p></div>; })}
            </div>
          </section>

          <section id="switching" className="switching-section">
            <div><span>Evaluation, not a forced migration</span><h2>Considering switching from {alternative.name}?</h2><p>{alternative.switchingCopy}</p></div>
            <a className="seo-button seo-button-primary" href="mailto:apmedpodcast@gmail.com?subject=AP%20MED%20Mentors%20program%20evaluation">Talk to AP MED <ArrowRight size={17} /></a>
          </section>

          <section className="content-section cluster-links">
            <div className="section-heading">
              <span>Keep researching</span>
              <h2>Practical guides for running mentorship programs</h2>
              <p>Continue with focused guidance on choosing software, designing matching, and building a program your organization can operate repeatedly.</p>
            </div>
            <div className="future-links">
              <Link href="/blog/best-mentoring-platforms-for-healthcare-organizations">Best mentoring platforms for healthcare organizations <ArrowRight size={15} /></Link>
              <Link href="/blog/mentor-matching-software-what-to-look-for">Mentor matching software: what to look for <ArrowRight size={15} /></Link>
              <Link href="/blog/how-to-start-a-mentorship-program">How to start a mentorship program <ArrowRight size={15} /></Link>
            </div>
          </section>

          <section id="faq" className="content-section faq-section">
            <div className="section-heading"><span>Frequently asked questions</span><h2>{alternative.name} alternative FAQ</h2></div>
            <div>
              {alternative.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<span>+</span></summary><p>{faq.answer}</p></details>)}
            </div>
          </section>
        </article>
      </div>

      <section className="final-seo-cta">
        <span>Mentorship infrastructure for professional pipelines</span>
        <h2>{alternative.closingHeading}</h2>
        <p>{alternative.closingCopy}</p>
        <div className="seo-actions"><Link className="seo-button seo-button-primary" href="/about">Explore AP MED Mentors <ArrowRight size={17} /></Link><a className="seo-button seo-button-light" href="mailto:apmedpodcast@gmail.com">Talk to us</a></div>
      </section>
    </div>
  );
}
