import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAscensoVisible } from '@/lib/app-settings'

/**
 * Public Ascenso landing page — the discoverable front door for the cohort.
 *
 * /ascenso/apply already existed but was reachable only by pasting the raw URL;
 * this page (plus the homepage section that links here) is what makes the apply
 * flow findable. The page body still does no cohort lookup — the apply page is
 * the one that resolves the open cohort and owns the applications-closed state.
 *
 * No longer static, though: it reads app_settings.ascenso_visible per request
 * and redirects home when the cohort is hidden. That read fails closed, so a DB
 * hiccup costs a redirect rather than a 500.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ascenso — LMSA-NE Mentorship Cohort | AP MED',
  description:
    "Ascenso is LMSA-NE's longitudinal mentorship initiative on AP MED — board-reviewed applications, thoughtful matching, and support beyond the match.",
}

const GOLD = '#c8a96e'

const goldButton: React.CSSProperties = {
  background: GOLD,
  color: '#1a1a2e',
  padding: '0.8rem 1.75rem',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.95rem',
  textDecoration: 'none',
  display: 'inline-block',
}

const serifHeading: React.CSSProperties = {
  fontFamily: "'Instrument Serif', Georgia, serif",
  fontWeight: 400,
  color: '#1a1a2e',
}

// Program mission, as written by the LMSA-NE board. Kept verbatim — this is the
// board's own language for what Ascenso is, not marketing copy to reword.
// "Latinx" (here and in "Why it exists") is the board's own revision.
const ABOUT_PARAGRAPHS = [
  'Ascenso is a structured, longitudinal mentorship initiative of LMSA Northeast, created in partnership with AP MED, a mentorship and storytelling platform dedicated to uplifting Latinx and underrepresented voices in medicine.',
  'The project was created to address a common challenge in mentorship: relationships are often formed through networking events or matching programs but lose momentum without continued structure, guidance, and follow-up.',
  'Ascenso focuses not only on creating thoughtful mentor-mentee matches, but also on supporting what happens after the match. Participants receive structured onboarding, mentor or mentee training, ongoing program support, opportunities for community engagement, and resources to help them build meaningful and lasting mentorship relationships.',
]

const PILLARS = [
  {
    title: 'Continuity',
    body: 'Mentorship should extend beyond an initial introduction and remain active through meaningful educational and professional milestones.',
  },
  {
    title: 'Accountability',
    body: 'Mentors and mentees share responsibility for communicating, participating, and investing in the relationship.',
  },
  {
    title: 'Longitudinal Relationships',
    body: 'Mentorship should evolve alongside the mentee’s educational and professional journey rather than ending after a single event or application cycle.',
  },
  {
    title: 'Community',
    body: 'Ascenso connects participants to a broader network of mentors and mentees that encourages collaboration, peer support, professional growth, and a genuine sense of belonging.',
  },
]

// The board's mission text lists these same four pairings as "four pathways".
// They aren't repeated as a bare list above — this section already IS that list,
// so the mission's lead-in sentence introduces it instead.
const TRACKS = [
  { pair: 'Med student → Premed', blurb: 'Getting through applications, the MCAT, and the parts nobody explains.' },
  { pair: 'Resident → Med student', blurb: 'Clerkships, specialty exploration, and choosing a path that fits.' },
  { pair: 'Attending → Med student', blurb: 'The long view: research, networks, and what practice actually looks like.' },
  { pair: 'Attending → Resident', blurb: 'Fellowship, first jobs, and building a career after training.' },
]

const HOW_IT_WORKS = [
  {
    title: 'Apply',
    body: 'One short application — about five minutes — as a mentor or a mentee, on the track that matches where you are.',
  },
  {
    title: 'Board review',
    body: 'Every application is read by the LMSA-NE program board. Nothing is auto-approved.',
  },
  {
    title: 'Matched',
    body: 'The board pairs you within your track using shared specialty interest and background, then makes the introduction by email.',
  },
  {
    title: 'Build the Relationship',
    body: 'Pairs stay engaged throughout the program with goal-setting, session scheduling, and a shared AP MED dashboard designed to support the mentorship relationship.',
  },
]

export default async function AscensoPage() {
  // Hidden → send visitors home, the same 307 the proxy used to serve. The
  // homepage panel and the sitemap entries drop out on the same flag, so there
  // is never a live link pointing at this redirect.
  if (!(await isAscensoVisible())) redirect('/')

  return (
    <div className="space-y-20">
      <section>
        <p
          style={{
            color: GOLD,
            fontSize: '0.75rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: '1.25rem',
          }}
        >
          Partnered with LMSA-NE
        </p>
        <h1
          style={{
            ...serifHeading,
            fontSize: 'clamp(2.25rem, 5.5vw, 3.25rem)',
            lineHeight: 1.1,
            maxWidth: '18ch',
            margin: 0,
          }}
        >
          Ascenso: Mentorship Beyond the Match
        </h1>
        <p
          style={{
            color: '#4a4a5a',
            maxWidth: '640px',
            margin: '1.5rem 0 0',
            fontSize: '1.1rem',
            lineHeight: 1.7,
          }}
        >
          A mentorship initiative built to go the distance.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/ascenso/apply" style={goldButton}>
            Apply to Ascenso
          </Link>
        </div>
      </section>

      <section>
        <h2 style={{ ...serifHeading, fontSize: '2rem', lineHeight: 1.15, margin: '0 0 1.5rem' }}>
          About Ascenso
        </h2>
        {/* Paragraph spacing lives in the inline style, not a space-y class:
            the inline `margin` on each <p> would override the class rule. */}
        <div style={{ maxWidth: '640px' }}>
          {ABOUT_PARAGRAPHS.map((paragraph, index) => (
            <p
              key={paragraph.slice(0, 40)}
              style={{
                color: '#4a4a5a',
                fontSize: '1rem',
                lineHeight: 1.7,
                margin: index === 0 ? 0 : '1.25rem 0 0',
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ...serifHeading, fontSize: '2rem', lineHeight: 1.15, margin: '0 0 1rem' }}>
          Why it exists
        </h2>
        <p style={{ color: '#4a4a5a', fontSize: '1rem', lineHeight: 1.7, maxWidth: '640px', margin: 0 }}>
          Latinx and underrepresented students rarely lack ambition — they lack
          the person one step ahead who can tell them what the next step actually
          costs. Ascenso&apos;s goal is to close that gap on purpose rather than by
          luck: pairs are matched within a track by shared specialty interest and
          background, meet on a regular cadence, and set goals they revisit
          together. Mentorship that survives a busy semester is the whole point.
        </p>
      </section>

      <section>
        <h2 style={{ ...serifHeading, fontSize: '2rem', lineHeight: 1.15, margin: '0 0 1rem' }}>
          Four tracks
        </h2>
        <p
          style={{
            color: '#4a4a5a',
            fontSize: '1rem',
            lineHeight: 1.7,
            maxWidth: '640px',
            margin: '0 0 1.5rem',
          }}
        >
          The inaugural cohort will include mentorship relationships across four pathways:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TRACKS.map((track) => (
            <div
              key={track.pair}
              style={{
                background: '#ffffff',
                border: '1px solid #e8e4dc',
                borderRadius: '12px',
                padding: '1.25rem 1.5rem',
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: '#1a1a2e', fontSize: '0.98rem' }}>
                {track.pair}
              </p>
              <p style={{ margin: '0.4rem 0 0', color: '#6b6b6b', fontSize: '0.9rem', lineHeight: 1.6 }}>
                {track.blurb}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ...serifHeading, fontSize: '2rem', lineHeight: 1.15, margin: '0 0 1.5rem' }}>
          Our four pillars
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              style={{
                background: '#ffffff',
                border: '1px solid #e8e4dc',
                borderRadius: '12px',
                padding: '1.25rem 1.5rem',
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: '#1a1a2e', fontSize: '0.98rem' }}>
                {pillar.title}
              </p>
              <p
                style={{
                  margin: '0.4rem 0 0',
                  color: '#6b6b6b',
                  fontSize: '0.9rem',
                  lineHeight: 1.6,
                }}
              >
                {pillar.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ...serifHeading, fontSize: '2rem', lineHeight: 1.15, margin: '0 0 1.5rem' }}>
          How it works
        </h2>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} className="space-y-5">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden
                style={{
                  color: GOLD,
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontSize: '1.5rem',
                  lineHeight: 1.2,
                  minWidth: '1.5rem',
                }}
              >
                {index + 1}
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: '#1a1a2e' }}>{step.title}</p>
                <p
                  style={{
                    margin: '0.25rem 0 0',
                    color: '#4a4a5a',
                    fontSize: '0.95rem',
                    lineHeight: 1.7,
                    maxWidth: '58ch',
                  }}
                >
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 style={{ ...serifHeading, fontSize: '2rem', lineHeight: 1.15, margin: '0 0 1rem' }}>
          More than a match
        </h2>
        <p
          style={{
            color: '#4a4a5a',
            fontSize: '1rem',
            lineHeight: 1.7,
            maxWidth: '640px',
            margin: 0,
          }}
        >
          Ascenso is designed to provide participants with more than a mentor
          assignment. It is a structured mentorship experience intended to help Latinx
          students and physicians feel supported, connected, and able to be themselves
          as they navigate medicine.
        </p>
      </section>

      <section
        className="text-center"
        style={{
          background: '#f5efe2',
          border: `1px solid ${GOLD}`,
          borderRadius: '12px',
          padding: '2.5rem 1.5rem',
        }}
      >
        <h2 style={{ ...serifHeading, fontSize: '1.75rem', lineHeight: 1.2, margin: 0 }}>
          Applications take about five minutes
        </h2>
        <p
          style={{
            color: '#4a4a5a',
            margin: '0.75rem auto 1.75rem',
            maxWidth: '48ch',
            fontSize: '0.98rem',
            lineHeight: 1.7,
          }}
        >
          Apply as a mentee looking for guidance, or as a mentor ready to give
          someone the map you had to draw yourself. Free, like everything on AP MED.
        </p>
        <Link href="/ascenso/apply" style={goldButton}>
          Apply to Ascenso →
        </Link>
      </section>
    </div>
  )
}
