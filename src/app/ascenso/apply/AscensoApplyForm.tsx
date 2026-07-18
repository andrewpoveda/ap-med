'use client'
import { useState, useRef } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import Link from 'next/link'

type Role = 'mentor' | 'mentee'

type ApplicationFormData = {
  role: Role
  track: string
  full_name: string
  email: string
  institution: string
  current_position: string
  motivation: string
  experience_goals: string
  linkedin_url: string
  can_commit: boolean
}

// Track values match cohort_applications.track (ascenso-prm.md §4). Labels are
// phrased from the applicant's side per role — Ascenso "mentees" include med
// students and residents depending on track, so no premed assumptions (§5.2).
const TRACKS: { value: string; mentor: string; mentee: string }[] = [
  {
    value: 'ms_premed',
    mentor: "I'm a med student — mentoring a premed student",
    mentee: "I'm a premed student — seeking a med-student mentor",
  },
  {
    value: 'resident_ms',
    mentor: "I'm a resident — mentoring a med student",
    mentee: "I'm a med student — seeking a resident mentor",
  },
  {
    value: 'attending_ms',
    mentor: "I'm an attending — mentoring a med student",
    mentee: "I'm a med student — seeking an attending mentor",
  },
  {
    value: 'attending_resident',
    mentor: "I'm an attending — mentoring a resident",
    mentee: "I'm a resident — seeking an attending mentor",
  },
]

export default function AscensoApplyForm({
  cohortId,
  cohortName,
}: {
  cohortId: string
  cohortName: string
}) {
  const [form, setForm] = useState<ApplicationFormData>({
    role: 'mentee',
    track: '',
    full_name: '',
    email: '',
    institution: '',
    current_position: '',
    motivation: '',
    experience_goals: '',
    linkedin_url: '',
    can_commit: false,
  })

  const [submitted, setSubmitted] = useState(false)
  const [alreadyApplied, setAlreadyApplied] = useState(false)
  const [loading, setLoading] = useState(false)
  const turnstileToken = useRef<string | null>(null)

  const isMentor = form.role === 'mentor'

  const setRole = (role: Role) => {
    // Track meanings flip with the role (your own level changes), so a stale
    // selection would silently mean the wrong thing — reset it.
    setForm(prev => (prev.role === role ? prev : { ...prev, role, track: '' }))
  }

  const handleSubmit = async () => {
    if (!form.track) {
      alert('Please select your track.')
      return
    }
    if (!form.full_name.trim() || !form.email.trim() || !form.institution.trim() || !form.motivation.trim()) {
      alert('Please fill out all required fields.')
      return
    }
    if (!form.can_commit) {
      alert('Please confirm you can commit to regular meetings for the program year.')
      return
    }
    if (!turnstileToken.current) {
      alert('Please complete the CAPTCHA check first.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/cohort-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          cohort_id: cohortId,
          turnstile_token: turnstileToken.current,
        }),
      })

      const resData = await res.json()

      if (res.status === 409) {
        setAlreadyApplied(true)
        return
      }

      if (!res.ok) {
        console.error('Application API error:', resData?.error || resData)
        alert(resData?.error || 'Something went wrong, please try again.')
        return
      }

      setSubmitted(true)
    } catch (error) {
      console.error('Submit error:', error)
      alert('Something went wrong, please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted || alreadyApplied) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#faf8f4',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'inherit',
          color: '#1a1a2e',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>
          {alreadyApplied ? 'You’ve already applied' : 'Application received'}
        </h1>
        <p style={{ color: '#6b6b6b', maxWidth: '480px', lineHeight: 1.6 }}>
          {alreadyApplied
            ? `We already have a ${form.role} application under this email for ${cohortName} — you're all set. The board will reach out by email once decisions are made.`
            : `Thanks for applying to ${cohortName}. Every application is reviewed by the program board, and you'll hear back by email once decisions are made.`}
        </p>
        <Link
          href="/"
          style={{ marginTop: '2rem', color: '#c8a96e', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          ← Back to home
        </Link>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#faf8f4',
        color: '#1a1a2e',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <p
          style={{
            color: '#c8a96e',
            fontSize: '0.75rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
          }}
        >
          Ascenso · LMSA-NE
        </p>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Apply to {cohortName}
        </h1>
        <p style={{ color: '#6b6b6b', marginBottom: '2.5rem', lineHeight: 1.6 }}>
          Ascenso is a structured, board-reviewed mentorship cohort run by LMSA-NE on AP MED.
          Pairs are matched across four tracks — premed through resident — and meet regularly
          throughout the program year. Applications take about 5 minutes.
        </p>

        <hr style={{ border: 'none', borderTop: '1px solid #e8e4dc', marginBottom: '2.5rem' }} />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
          I&apos;m applying as a…
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            marginBottom: '2.5rem',
          }}
        >
          {(['mentee', 'mentor'] as Role[]).map(role => (
            <label key={role} style={radioCardStyle(form.role === role)}>
              <input
                type="radio"
                name="role"
                value={role}
                checked={form.role === role}
                onChange={() => setRole(role)}
                style={{ accentColor: '#c8a96e' }}
              />
              {role === 'mentee' ? 'Mentee' : 'Mentor'}
            </label>
          ))}
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Your track *
        </h2>
        <p style={{ color: '#6b6b6b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          {isMentor
            ? 'Pick the pairing that matches where you are and who you want to mentor.'
            : 'Pick the pairing that matches where you are and the mentor you’re looking for.'}
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            marginBottom: '2.5rem',
          }}
        >
          {TRACKS.map(track => (
            <label key={track.value} style={radioCardStyle(form.track === track.value)}>
              <input
                type="radio"
                name="track"
                value={track.value}
                checked={form.track === track.value}
                onChange={() => setForm(prev => ({ ...prev, track: track.value }))}
                style={{ accentColor: '#c8a96e' }}
              />
              {isMentor ? track.mentor : track.mentee}
            </label>
          ))}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #e8e4dc', marginBottom: '2.5rem' }} />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Basic info</h2>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Full name *</label>
          <input
            style={inputStyle}
            placeholder="John Doe"
            value={form.full_name}
            onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Email address *</label>
          <input
            style={inputStyle}
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>School / Institution *</label>
          <input
            style={inputStyle}
            placeholder={isMentor ? 'Boston Medical Center' : 'Rutgers University'}
            value={form.institution}
            onChange={e => setForm(prev => ({ ...prev, institution: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>
            {isMentor ? 'Current role' : 'Current stage / year'}{' '}
            <span style={{ color: '#9a948a' }}>(optional)</span>
          </label>
          <input
            style={inputStyle}
            placeholder={isMentor ? 'PGY-2, Internal Medicine' : 'MS2 / Junior, Biology'}
            value={form.current_position}
            onChange={e => setForm(prev => ({ ...prev, current_position: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: '2.5rem' }}>
          <label style={labelStyle}>
            LinkedIn URL <span style={{ color: '#9a948a' }}>(optional)</span>
          </label>
          <input
            style={inputStyle}
            placeholder="https://linkedin.com/in/yourname"
            value={form.linkedin_url}
            onChange={e => setForm(prev => ({ ...prev, linkedin_url: e.target.value }))}
          />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #e8e4dc', marginBottom: '2.5rem' }} />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          {isMentor ? 'Why do you want to mentor in Ascenso? *' : 'Why do you want to join Ascenso? *'}
        </h2>
        <p style={{ color: '#6b6b6b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          A few sentences is plenty — the board reads every application.
        </p>

        <textarea
          style={{ ...inputStyle, height: '140px', resize: 'vertical', fontFamily: 'inherit' }}
          placeholder={
            isMentor
              ? 'I want to give students the guidance I wish I’d had…'
              : 'I’m looking for structured guidance as I work toward…'
          }
          value={form.motivation}
          onChange={e => setForm(prev => ({ ...prev, motivation: e.target.value }))}
        />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '2.5rem 0 0.5rem' }}>
          {isMentor ? 'Mentorship or teaching experience' : 'What do you hope to get out of the program?'}{' '}
          <span style={{ color: '#9a948a', fontWeight: 400, fontSize: '0.9rem' }}>(optional)</span>
        </h2>

        <textarea
          style={{ ...inputStyle, height: '110px', resize: 'vertical', fontFamily: 'inherit' }}
          placeholder={
            isMentor
              ? 'Previous mentoring, tutoring, teaching, or advising…'
              : 'Specific goals, questions, or milestones for this year…'
          }
          value={form.experience_goals}
          onChange={e => setForm(prev => ({ ...prev, experience_goals: e.target.value }))}
        />

        <hr style={{ border: 'none', borderTop: '1px solid #e8e4dc', margin: '2.5rem 0' }} />

        <label style={{ ...checkCardStyle(form.can_commit), marginBottom: '1.5rem' }}>
          <input
            type="checkbox"
            checked={form.can_commit}
            onChange={e => setForm(prev => ({ ...prev, can_commit: e.target.checked }))}
            style={{ accentColor: '#c8a96e' }}
          />
          I can commit to regular monthly meetings with my {isMentor ? 'mentee' : 'mentor'} for
          the full program year. *
        </label>

        <div style={{ marginBottom: '1.5rem' }}>
          <Turnstile
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
            onSuccess={token => {
              turnstileToken.current = token
            }}
            onExpire={() => {
              turnstileToken.current = null
            }}
            options={{ theme: 'light' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              background: loading ? '#e8e4dc' : '#c8a96e',
              color: loading ? '#9a948a' : '#1a1a2e',
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Submitting...' : 'Submit application →'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.875rem',
  color: '#4a4a5a',
  marginBottom: '0.4rem',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '8px',
  padding: '0.75rem 1rem',
  color: '#1a1a2e',
  fontSize: '0.95rem',
  outline: 'none',
  boxSizing: 'border-box',
}

const radioCardStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem 1rem',
  background: selected ? '#f5efe2' : '#ffffff',
  border: `1px solid ${selected ? '#c8a96e' : '#e8e4dc'}`,
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.95rem',
  color: selected ? '#8a6a2f' : '#4a4a5a',
  transition: 'all 0.15s',
})

const checkCardStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem 1rem',
  background: selected ? '#f5efe2' : '#ffffff',
  border: `1px solid ${selected ? '#c8a96e' : '#e8e4dc'}`,
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.875rem',
  color: selected ? '#8a6a2f' : '#4a4a5a',
  transition: 'all 0.15s',
})
