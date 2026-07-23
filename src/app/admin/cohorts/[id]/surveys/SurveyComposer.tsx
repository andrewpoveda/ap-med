'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  QUESTION_TYPES,
  SURVEY_WAVES,
  WAVE_LABELS,
  MAX_QUESTIONS,
  type QuestionType,
  type SurveyWave,
} from '@/lib/surveys'

/**
 * Create-survey form for the admin surveys page (ascenso-prm.md §5.12). The
 * admin picks a wave, a title, and an ordered set of questions (text / scale /
 * select). Question ids are assigned server-side, so this only sends
 * `{ prompt, type, options? }` per question. A survey lands as `draft`; opening
 * it is a separate action on the list below. Waves already in use are disabled —
 * unique(cohort_id, wave) allows one survey per wave.
 */

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#4a4a5a',
  margin: '0 0 0.35rem',
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

const linkButton: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#8a6a2f',
  cursor: 'pointer',
}

const TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Free text',
  scale: 'Scale (1–5)',
  select: 'Multiple choice',
}

type DraftQuestion = {
  localId: number
  prompt: string
  type: QuestionType
  optionsText: string
}

let nextLocalId = 1
function newQuestion(): DraftQuestion {
  return { localId: nextLocalId++, prompt: '', type: 'text', optionsText: '' }
}

export default function SurveyComposer({
  cohortId,
  usedWaves,
}: {
  cohortId: string
  usedWaves: string[]
}) {
  const router = useRouter()
  const availableWaves = SURVEY_WAVES.filter((w) => !usedWaves.includes(w))

  const [wave, setWave] = useState<SurveyWave | ''>(availableWaves[0] ?? '')
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([newQuestion()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateQuestion(localId: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.localId === localId ? { ...q, ...patch } : q)))
  }

  function addQuestion() {
    setQuestions((prev) => (prev.length >= MAX_QUESTIONS ? prev : [...prev, newQuestion()]))
  }

  function removeQuestion(localId: number) {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((q) => q.localId !== localId)))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!wave) {
      setError('Pick a wave for this survey.')
      return
    }
    if (!title.trim()) {
      setError('Give the survey a title.')
      return
    }
    const payloadQuestions = questions.map((q) => ({
      prompt: q.prompt.trim(),
      type: q.type,
      ...(q.type === 'select'
        ? {
            options: q.optionsText
              .split('\n')
              .map((o) => o.trim())
              .filter(Boolean),
          }
        : {}),
    }))
    if (payloadQuestions.some((q) => !q.prompt)) {
      setError('Every question needs a prompt.')
      return
    }
    if (payloadQuestions.some((q) => q.type === 'select' && (q.options?.length ?? 0) < 2)) {
      setError('Multiple-choice questions need at least two options (one per line).')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohortId, wave, title: title.trim(), questions: payloadQuestions }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'Could not create the survey. Please try again.')
        setSubmitting(false)
        return
      }
      setTitle('')
      setQuestions([newQuestion()])
      setSubmitting(false)
      router.refresh()
    } catch {
      setError('Could not create the survey. Please try again.')
      setSubmitting(false)
    }
  }

  if (availableWaves.length === 0) {
    return (
      <p className="text-[#6b6b6b]" style={{ margin: 0, fontSize: '0.95rem' }}>
        Both the mid-year and end-of-year surveys already exist. Delete one (only
        possible before it has responses) to recreate it.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div style={{ maxWidth: '16rem' }}>
        <label style={labelStyle} htmlFor="survey-wave">
          Wave
        </label>
        <select
          id="survey-wave"
          value={wave}
          onChange={(e) => setWave(e.target.value as SurveyWave)}
          style={inputStyle}
        >
          {availableWaves.map((w) => (
            <option key={w} value={w}>
              {WAVE_LABELS[w]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle} htmlFor="survey-title">
          Title
        </label>
        <input
          id="survey-title"
          type="text"
          required
          maxLength={200}
          placeholder="e.g. Ascenso mid-year check-in"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div className="space-y-4">
        <label style={labelStyle}>Questions</label>
        {questions.map((q, index) => (
          <div
            key={q.localId}
            style={{ border: '1px solid #e8e4dc', borderRadius: '8px', padding: '0.85rem 1rem' }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#9a948a]" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                Question {index + 1}
              </span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(q.localId)}
                  style={{ ...linkButton, color: '#a3372b' }}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              type="text"
              maxLength={200}
              placeholder="Question prompt"
              value={q.prompt}
              onChange={(e) => updateQuestion(q.localId, { prompt: e.target.value })}
              style={inputStyle}
              aria-label={`Question ${index + 1} prompt`}
            />
            <div style={{ maxWidth: '16rem' }}>
              <select
                value={q.type}
                onChange={(e) => updateQuestion(q.localId, { type: e.target.value as QuestionType })}
                style={inputStyle}
                aria-label={`Question ${index + 1} type`}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            {q.type === 'select' && (
              <div>
                <label
                  style={{ ...labelStyle, fontWeight: 500 }}
                  htmlFor={`survey-q-${q.localId}-options`}
                >
                  Options — one per line
                </label>
                <textarea
                  id={`survey-q-${q.localId}-options`}
                  rows={3}
                  placeholder={'Yes\nNo\nUnsure'}
                  value={q.optionsText}
                  onChange={(e) => updateQuestion(q.localId, { optionsText: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            )}
          </div>
        ))}
        {questions.length < MAX_QUESTIONS && (
          <button type="button" onClick={addQuestion} style={linkButton}>
            + Add question
          </button>
        )}
      </div>

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
        {submitting ? 'Creating…' : 'Create survey'}
      </button>
    </form>
  )
}
