'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { SCALE_MIN, SCALE_MAX, waveLabel, type MemberSurveyView } from '@/lib/surveys'

/**
 * The cohort member's open surveys (ascenso-prm.md §5.12 / §7.15). Each open
 * survey is either a form (if the member hasn't answered) or a "response
 * submitted" confirmation — one response per member is enforced server-side by
 * unique(survey_id, member_id), so there's no editing after submit. Identity is
 * resolved from the session on the server; nothing here is a security boundary.
 */

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
}

const eyebrowStyle: CSSProperties = {
  fontSize: '0.7rem',
  color: '#9a948a',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: '0 0 0.5rem',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.9rem',
  fontWeight: 600,
  color: '#1a1a2e',
  margin: '0 0 0.5rem',
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.55rem 0.7rem',
  fontSize: '0.95rem',
  color: '#1a1a2e',
}

const goldButton: CSSProperties = {
  background: '#c8a96e',
  color: '#1a1a2e',
  padding: '0.6rem 1.4rem',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.9rem',
  border: 'none',
  cursor: 'pointer',
}

const SCALE_VALUES = Array.from(
  { length: SCALE_MAX - SCALE_MIN + 1 },
  (_, i) => SCALE_MIN + i,
)

function SurveyForm({ survey }: { survey: MemberSurveyView }) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Scale answers go up as numbers; text/select as strings. Only include
    // answered keys — the server validates required (scale/select) vs optional
    // (text) per question.
    const payload: Record<string, unknown> = {}
    for (const q of survey.questions) {
      const raw = answers[q.id]
      if (raw == null || raw === '') continue
      payload[q.id] = q.type === 'scale' ? Number(raw) : raw
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/survey-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: survey.id, answers: payload }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Could not submit your response. Please try again.')
        setSubmitting(false)
        return
      }
      setSubmitting(false)
      router.refresh()
    } catch {
      setError('Could not submit your response. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>{waveLabel(survey.wave)} survey</p>
      <h3 className="text-[#1a1a2e]" style={{ fontSize: '1.15rem', fontWeight: 500, margin: '0 0 1rem' }}>
        {survey.title}
      </h3>

      <form onSubmit={onSubmit} className="space-y-5">
        {survey.questions.map((q, index) => (
          <div key={q.id}>
            <label style={labelStyle} htmlFor={`${survey.id}-${q.id}`}>
              {index + 1}. {q.prompt}
              {q.type === 'scale' && (
                <span className="text-[#9a948a]" style={{ fontWeight: 400 }}>
                  {' '}
                  ({SCALE_MIN}–{SCALE_MAX})
                </span>
              )}
            </label>

            {q.type === 'text' && (
              <textarea
                id={`${survey.id}-${q.id}`}
                rows={3}
                maxLength={2000}
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            )}

            {q.type === 'scale' && (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.prompt}>
                {SCALE_VALUES.map((n) => {
                  const selected = answers[q.id] === String(n)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAnswer(q.id, String(n))}
                      aria-pressed={selected}
                      style={{
                        width: '2.6rem',
                        height: '2.6rem',
                        borderRadius: '8px',
                        border: `1px solid ${selected ? '#c8a96e' : '#e8e4dc'}`,
                        background: selected ? '#c8a96e' : '#ffffff',
                        color: selected ? '#1a1a2e' : '#4a4a5a',
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                      }}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            )}

            {q.type === 'select' && (
              <select
                id={`${survey.id}-${q.id}`}
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                style={inputStyle}
              >
                <option value="">Select…</option>
                {(q.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}

        {error && (
          <p
            style={{
              background: '#fdecea',
              border: '1px solid #e6a49b',
              color: '#a3372b',
              borderRadius: '8px',
              padding: '0.6rem 0.9rem',
              fontSize: '0.85rem',
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{ ...goldButton, opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? 'Submitting…' : 'Submit response'}
        </button>
      </form>
    </div>
  )
}

function SubmittedCard({ survey }: { survey: MemberSurveyView }) {
  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>{waveLabel(survey.wave)} survey</p>
      <h3 className="text-[#1a1a2e]" style={{ fontSize: '1.15rem', fontWeight: 500, margin: '0 0 0.5rem' }}>
        {survey.title}
      </h3>
      <p className="flex items-center gap-2 text-[#2f8f5f]" style={{ margin: 0, fontSize: '0.95rem' }}>
        <span aria-hidden style={{ fontWeight: 700 }}>
          ✓
        </span>
        Thanks — your response has been submitted.
      </p>
    </div>
  )
}

export default function SurveySection({ surveys }: { surveys: MemberSurveyView[] }) {
  if (surveys.length === 0) return null
  return (
    <>
      {surveys.map((survey) =>
        survey.responded ? (
          <SubmittedCard key={survey.id} survey={survey} />
        ) : (
          <SurveyForm key={survey.id} survey={survey} />
        ),
      )}
    </>
  )
}
