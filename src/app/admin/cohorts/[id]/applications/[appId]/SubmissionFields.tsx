import type { ReactNode } from 'react'
import { safeUrl, isHttpUrl } from '@/lib/url'
import { TRACK_LABELS, type CohortTrack } from '@/types/cohort'

/**
 * One submission's answers, rendered as read-only fields.
 *
 * Extracted from the review page so the CURRENT and the SUPERSEDED version
 * (migration 0007's previous_submission) render through exactly the same code —
 * a reviewer comparing the two is comparing answers, not two layouts that drifted
 * apart. Everything here is a value from `answers` jsonb: allowlisted at intake,
 * but still rendered as text, never markup.
 */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p
        className="text-[#6b6b6b]"
        style={{
          margin: 0,
          fontSize: '0.72rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <div
        className="text-[#1a1a2e]"
        style={{ marginTop: '0.25rem', fontSize: '0.95rem', lineHeight: 1.6 }}
      >
        {children}
      </div>
    </div>
  )
}

function asText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '—'
}

/**
 * A structured tag array from `answers`, rendered as chips. These are the
 * matcher's actual inputs (identity 40% · specialty 35% · mentorship needs 25%)
 * and carry over to the member row on approval, so the board sees exactly what
 * the candidate scores will be built from.
 */
function TagField({ label, value }: { label: string; value: unknown }) {
  const tags = Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
  return (
    <Field label={label}>
      {tags.length === 0 ? (
        '—'
      ) : (
        <span className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: '#f5f2ec',
                border: '1px solid #e8e4dc',
                borderRadius: '999px',
                padding: '0.1rem 0.6rem',
                fontSize: '0.8rem',
              }}
            >
              {tag}
            </span>
          ))}
        </span>
      )}
    </Field>
  )
}

export default function SubmissionFields({
  role,
  email,
  answers,
  /** Shown only on a superseded version, where they may differ from the header. */
  fullName,
  track,
}: {
  role: string
  email?: string
  answers: Record<string, unknown>
  fullName?: string
  track?: string
}) {
  const linkedin = typeof answers.linkedin_url === 'string' ? answers.linkedin_url : ''

  return (
    <div className="space-y-5">
      {fullName !== undefined && <Field label="Name on this version">{asText(fullName)}</Field>}
      {track !== undefined && (
        <Field label="Track on this version">
          {TRACK_LABELS[track as CohortTrack] ?? asText(track)}
        </Field>
      )}
      {email !== undefined && <Field label="Email">{email}</Field>}
      <Field label="Institution">{asText(answers.institution)}</Field>
      <Field label="Current position">{asText(answers.current_position)}</Field>
      <Field label="Current location">{asText(answers.current_location)}</Field>
      {role === 'mentor' ? (
        <>
          <TagField label="Specialties" value={answers.specialty} />
          <TagField label="Can help with" value={answers.can_help_with} />
          {/* Collected for the board to weigh by hand — the matcher still pairs
              one mentee per mentor regardless of what this says. */}
          <Field label="Mentees willing to take">{asText(answers.mentee_capacity)}</Field>
          <Field label="Especially prepared to support">
            <span style={{ whiteSpace: 'pre-wrap' }}>{asText(answers.prepared_to_support)}</span>
          </Field>
        </>
      ) : (
        <>
          <TagField label="Specialties of interest" value={answers.preferred_specialty} />
          <TagField label="Wants support with" value={answers.help_with} />
          <Field label="First-year goals / milestones">
            <span style={{ whiteSpace: 'pre-wrap' }}>{asText(answers.goals_milestones)}</span>
          </Field>
          <Field label="Previous mentor">{asText(answers.previous_mentor)}</Field>
          <Field label="Notes on previous mentorship">
            <span style={{ whiteSpace: 'pre-wrap' }}>
              {asText(answers.previous_mentor_notes)}
            </span>
          </Field>
        </>
      )}
      {typeof answers.help_with_other === 'string' && answers.help_with_other.trim() && (
        // Free text from the "Other" support area. Not a matching tag — shown so
        // the board can read it and weigh it by hand.
        <Field label="Other support area">{asText(answers.help_with_other)}</Field>
      )}
      <TagField label="Identity / background" value={answers.identity} />
      <Field label="Motivation">
        <span style={{ whiteSpace: 'pre-wrap' }}>{asText(answers.motivation)}</span>
      </Field>
      <Field label="Experience & goals">
        <span style={{ whiteSpace: 'pre-wrap' }}>{asText(answers.experience_goals)}</span>
      </Field>
      <Field label="LinkedIn">
        {isHttpUrl(linkedin) ? (
          <a
            href={safeUrl(linkedin)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#8a6a2f' }}
          >
            {linkedin}
          </a>
        ) : (
          '—'
        )}
      </Field>
      <Field label="Commitment">
        {answers.can_commit === true
          ? 'Confirmed — regular meetings for the program year'
          : 'Not confirmed'}
      </Field>
      <Field label="Acknowledgments">
        {/* Required at submit, so on a current row these all read Confirmed.
            They're still shown one by one because an application taken before
            these were added simply has no key here, and "Not confirmed" on an
            older submission means "never asked", not "declined". */}
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          <li>
            Feedback surveys: {answers.agrees_surveys === true ? 'Confirmed' : 'Not confirmed'}
          </li>
          <li>
            Conduct &amp; confidentiality:{' '}
            {answers.agrees_conduct === true ? 'Confirmed' : 'Not confirmed'}
          </li>
          <li>
            Active participation:{' '}
            {answers.agrees_participation === true ? 'Confirmed' : 'Not confirmed'}
          </li>
        </ul>
      </Field>
    </div>
  )
}
