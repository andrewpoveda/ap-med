import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * Public Ascenso landing page — the discoverable front door for the cohort.
 *
 * /ascenso/apply already existed but was reachable only by pasting the raw URL;
 * this page (plus the homepage section that links here) is what makes the apply
 * flow findable. Deliberately static: no cohort lookup, so it can't 500 on a DB
 * hiccup and needs no service-role client on a public marketing surface. The
 * apply page itself is the one that resolves the open cohort and shows the
 * applications-closed state.
 */

export const metadata: Metadata = {
  title: 'Ascenso — LMSA-NE Mentorship Cohort | AP MED',
  description:
    'Ascenso is a structured, board-reviewed mentorship cohort run by LMSA-NE on AP MED, pairing premed students, med students, and residents across four tracks for a full program year.',
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

const ghostButton: React.CSSProperties = {
  background: 'transparent',
  color: '#1a1a2e',
  padding: '0.8rem 1.75rem',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.95rem',
  textDecoration: 'none',
  display: 'inline-block',
  border: '1px solid rgba(26,26,46,0.25)',
}

const serifHeading: React.CSSProperties = {
  fontFamily: "'Instrument Serif', Georgia, serif",
  fontWeight: 400,
  color: '#1a1a2e',
}

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
    title: 'Meet all year',
    body: 'Pairs meet regularly through the program year, with goals, session booking, and meeting tracking built into AP MED.',
  },
]

export default function AscensoPage() {
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
          Ascenso: a mentorship cohort built to{' '}
          <em style={{ fontStyle: 'italic', color: GOLD }}>go the distance</em>
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
          Ascenso is a structured mentorship program run by the Latino Medical
          Student Association — Northeast on AP MED. Where the open directory is
          built for a single connection whenever you need one, Ascenso is built
          for the year: a board-reviewed application, a deliberate match, and a
          mentor who stays with you from one milestone to the next.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/ascenso/apply" style={goldButton}>
            Apply to Ascenso
          </Link>
          <Link href="/mentors" style={ghostButton}>
            Browse open mentors
          </Link>
        </div>
      </section>

      <section>
        <h2 style={{ ...serifHeading, fontSize: '2rem', lineHeight: 1.15, margin: '0 0 1rem' }}>
          Why it exists
        </h2>
        <p style={{ color: '#4a4a5a', fontSize: '1rem', lineHeight: 1.7, maxWidth: '640px', margin: 0 }}>
          Latino and underrepresented students rarely lack ambition — they lack
          the person one step ahead who can tell them what the next step actually
          costs. Ascenso&apos;s goal is to close that gap on purpose rather than by
          luck: pairs are matched within a track by shared specialty interest and
          background, meet on a regular cadence, and set goals they revisit
          together. Mentorship that survives a busy semester is the whole point.
        </p>
      </section>

      <section>
        <h2 style={{ ...serifHeading, fontSize: '2rem', lineHeight: 1.15, margin: '0 0 1.5rem' }}>
          Four tracks
        </h2>
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
