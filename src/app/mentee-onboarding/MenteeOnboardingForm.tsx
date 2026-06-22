'use client'
import { SPECIALTIES } from "@/data/specialties"
import { useState, useEffect, useRef } from 'react'
import { Turnstile } from "@marsidev/react-turnstile"
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type MenteeOnboardingFormData = {
  full_name: string
  email: string
  school: string
  current_stage: string
  requested_mentor: string
  identity: string[]
  interests: string[]
  help_with: string[]
  other_interest: string
  availability: string
  linkedin_url: string
  notes: string
}

const STAGES = [
  'Pre-med / Undergrad',
  'Post-bacc',
  'Gap year',
  'MD / DO Student',
  'Other',
]

const IDENTITIES = [
  'First-generation', 'Latino / Hispanic', 'Black / African American',
  'Asian / Pacific Islander', 'Native American', 'Low-income background',
  'LGBTQ+', 'International / IMG', 'Non-traditional student', 'Prefer not to say',
]

const HELP_WITH = [
  'General guidance', 'Personal statement review', 'Application advice',
  'Mock interviews', 'MCAT advice', 'Research guidance',
  'Clinical / shadowing advice', 'Specialty exploration',
  'Identity mentorship', 'Residency application',
]

const AVAILABILITY = [
  'Weekday mornings', 'Weekday afternoons', 'Weekday evenings',
  'Weekend mornings', 'Weekend afternoons', 'Weekend evenings', 'Flexible',
]

const OTHER_SPECIALTY = 'Other'
const INTEREST_OPTIONS = [...SPECIALTIES, OTHER_SPECIALTY].filter((item, index, self) => self.indexOf(item) === index)

export default function MenteeOnboardingForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mentorFromUrl = searchParams.get('mentor') || ''
  const testMode = searchParams.get('test') === '1'
  const [form, setForm] = useState<MenteeOnboardingFormData>({
  full_name: '',
  email: '',
  school: '',
  current_stage: '',
  requested_mentor: mentorFromUrl,
  identity: [],           // the mentee's OWN background (drives identity match + email resonance)
  interests: [],          // specialties they're interested in
  help_with: [],          // help needed
  other_interest: '',
  availability: '',
  linkedin_url: '',
  notes: '',
})


  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const turnstileToken = useRef<string | null>(null)

  useEffect(() => {
    if (mentorFromUrl) {
      setForm(prev => ({ ...prev, requested_mentor: mentorFromUrl }))
    }
  }, [mentorFromUrl])

const toggleArrayField = (field: 'identity' | 'interests' | 'help_with', value: string) => {
    setForm((prev) => {
      const arr = prev[field] || []
      return arr.includes(value)
        ? { ...prev, [field]: arr.filter((v) => v !== value) }
        : { ...prev, [field]: [...arr, value] }
    })
  }

  const handleInterestToggle = (interest: string) => {
    setForm((prev) => {
      const current = prev.interests
      const isSelected = current.includes(interest)
      return {
        ...prev,
        interests: isSelected ? current.filter((item) => item !== interest) : [...current, interest],
        other_interest: interest === OTHER_SPECIALTY && isSelected ? '' : prev.other_interest,
      }
    })
  }

  const handleSubmit = async () => {
    if (!form.full_name || !form.email || !form.school || !form.current_stage) {
      alert('Please fill out all required fields.')
      return
    }

    if (form.interests.includes(OTHER_SPECIALTY) && !form.other_interest.trim()) {
      alert('Please enter your other specialty or deselect Other.')
      return
    }

    setLoading(true)

    try {
      // 1. Save mentee to Supabase
      const saveRes = await fetch('/api/mentees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, turnstile_token: turnstileToken.current }),
      })

      const saveData = await saveRes.json()

      if (!saveRes.ok) {
        console.error('Supabase API error:', saveData?.error || saveData)
        alert('Something went wrong, please try again.')
        return
      }

      // 2. Run matching algorithm (?test=1 → dry-run: matches but skips the mentor email)
      const matchRes = await fetch(`/api/match${testMode ? '?test=1' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          school: form.school,
          current_stage: form.current_stage,
          interests: form.interests,
          identity: form.identity,
          help_with: form.help_with,
          notes: form.notes,
          linkedin_url: form.linkedin_url,
        }),
      })

      const matchData = await matchRes.json()

      if (!matchRes.ok) {
        console.error('Match API error:', matchData?.error)
        // Still show results even if match fails — just redirect to browse all
        router.push('/mentors/results')
        return
      }

      // 3. Store results in sessionStorage and redirect
      sessionStorage.setItem('matchResults', JSON.stringify(matchData.mentors))
      sessionStorage.setItem('menteeName', form.full_name)
      sessionStorage.setItem('menteeData', JSON.stringify({
        full_name: form.full_name,
        email: form.email,
        school: form.school,
        current_stage: form.current_stage,
        interests: form.interests,
        identity: form.identity,
        help_with: form.help_with,
        notes: form.notes,
        linkedin_url: form.linkedin_url,
      }))
      // Carry dry-run mode to the results page so the "Request" button also skips email
      sessionStorage.setItem('matchTestMode', testMode ? '1' : '')
      router.push('/mentors/results')
    } catch (error) {
      console.error('Submit error:', error)
      alert('Something went wrong, please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0f1117',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'inherit',
        color: 'white',
        textAlign: 'center',
        padding: '2rem',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>You're on the list</h1>
        <p style={{ color: '#94a3b8', maxWidth: '480px', lineHeight: 1.6 }}>
          Thanks for reaching out through AP MED Mentors. Andrew will review your request and connect you with your mentor — usually within a few days.
        </p>
        <Link href="/mentors" style={{
          marginTop: '2rem',
          color: '#60a5fa',
          textDecoration: 'none',
          fontSize: '0.9rem',
        }}>
          ← Back to mentors
        </Link>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      color: 'white',
      fontFamily: 'inherit',
    }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
        <p style={{ color: '#60a5fa', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          AP MED MENTORS
        </p>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Request a mentor
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '2.5rem', lineHeight: 1.6 }}>
          Fill out this short form and we'll connect you with the right mentor. Takes about 3–5 minutes.
        </p>

        {testMode && (
          <div style={{ marginBottom: '2rem', padding: '0.75rem 1rem', background: '#2a2410', border: '1px solid #a16207', borderRadius: '8px', color: '#fde68a', fontSize: '0.85rem', lineHeight: 1.5 }}>
            🧪 <strong>Test mode</strong> — your submission will still be saved, but <strong>no email will be sent</strong> to the matched mentor.
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid #1e2330', marginBottom: '2.5rem' }} />

        {mentorFromUrl && (
          <div style={{ marginBottom: '2rem', padding: '1rem 1.25rem', background: '#1a1f2e', borderRadius: '8px', border: '1px solid #2a3040' }}>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '0.25rem' }}>Requesting mentorship from</p>
            <p style={{ fontWeight: 600, fontSize: '1rem' }}>{mentorFromUrl}</p>
          </div>
        )}

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Basic info</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>First name *</label>
            <input
              style={inputStyle}
              placeholder="Andrew"
              value={form.full_name.split(' ')[0] || ''}
              onChange={e => setForm(prev => ({
                ...prev,
                full_name: e.target.value + ' ' + (prev.full_name.split(' ')[1] || '')
              }))}
            />
          </div>
          <div>
            <label style={labelStyle}>Last name *</label>
            <input
              style={inputStyle}
              placeholder="Poveda"
              value={form.full_name.split(' ')[1] || ''}
              onChange={e => setForm(prev => ({
                ...prev,
                full_name: (prev.full_name.split(' ')[0] || '') + ' ' + e.target.value
              }))}
            />
          </div>
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
            placeholder="Montclair State University"
            value={form.school}
            onChange={e => setForm(prev => ({ ...prev, school: e.target.value }))}
          />
        </div>

        <div style={{ marginBottom: '2.5rem' }}>
          <label style={labelStyle}>LinkedIn URL <span style={{ color: '#64748b' }}>(optional)</span></label>
          <input
            style={inputStyle}
            placeholder="https://linkedin.com/in/yourname"
            value={form.linkedin_url}
            onChange={e => setForm(prev => ({ ...prev, linkedin_url: e.target.value }))}
          />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #1e2330', marginBottom: '2.5rem' }} />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Your current stage *</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.25rem' }}>Where are you in your pre-med journey?</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2.5rem' }}>
          {STAGES.map(stage => (
            <label key={stage} style={radioCardStyle(form.current_stage === stage)}>
              <input
                type="radio"
                name="stage"
                value={stage}
                checked={form.current_stage === stage}
                onChange={() => setForm(prev => ({ ...prev, current_stage: stage }))}
                style={{ accentColor: '#60a5fa' }}
              />
              {stage}
            </label>
          ))}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #1e2330', marginBottom: '2.5rem' }} />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>What do you need help with?</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.25rem' }}>Select all that apply.</p>

        <div style={checkGridStyle}>
          {HELP_WITH.map(item => (
  <label key={item} style={checkCardStyle(form.help_with.includes(item))}>
    <input
      type="checkbox"
      checked={form.help_with.includes(item)}
      onChange={() => toggleArrayField('help_with', item)}
      style={{ accentColor: '#60a5fa' }}
    />
    {item}
  </label>
))}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #1e2330', marginBottom: '2.5rem' }} />
<h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
  Your medical interests
</h2>
<p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
  Select all specialties you're interested in.
</p>

<div style={checkGridStyle}>
  {INTEREST_OPTIONS.map(spec => (
    <label key={spec} style={checkCardStyle(form.interests.includes(spec))}>
      <input
        type="checkbox"
        checked={form.interests.includes(spec)}
        onChange={() => handleInterestToggle(spec)}
        style={{ accentColor: '#60a5fa' }}
      />
      {spec}
    </label>
  ))}
</div>

        {form.interests.includes(OTHER_SPECIALTY) && (
          <div style={{ marginTop: '1rem' }}>
            <label style={labelStyle}>Your other specialty</label>
            <input
              list="other-specialty-options"
              style={inputStyle}
              placeholder="Type your other specialty"
              value={form.other_interest}
              onChange={e => setForm(prev => ({ ...prev, other_interest: e.target.value }))}
            />
            <datalist id="other-specialty-options">
              <option value="Global Health" />
              <option value="Medical Education" />
              <option value="Geriatrics" />
              <option value="Transplant Surgery" />
              <option value="Sports Medicine" />
            </datalist>
          </div>
        )}

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Identity / background</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.25rem' }}>Helps us match you with someone who shares your background.</p>

<div style={checkGridStyle}>
  {IDENTITIES.map(item => (
    <label key={item} style={checkCardStyle(form.identity.includes(item))}>
      <input
        type="checkbox"
        checked={form.identity.includes(item)}
        onChange={() => toggleArrayField('identity', item)}
        style={{ accentColor: '#60a5fa' }}
      />
      {item}
    </label>
  ))}
</div>

        <hr style={{ border: 'none', borderTop: '1px solid #1e2330', marginBottom: '2.5rem' }} />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Availability <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.9rem' }}>(optional)</span></h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.25rem' }}>When are you generally free to meet?</p>

        <div style={checkGridStyle}>
          {AVAILABILITY.map(item => (
            <label key={item} style={checkCardStyle(form.availability === item)}>
              <input
                type="radio"
                name="availability"
                checked={form.availability === item}
                onChange={() => setForm(prev => ({ ...prev, availability: item }))}
                style={{ accentColor: '#60a5fa' }}
              />
              {item}
            </label>
          ))}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #1e2330', margin: '2.5rem 0' }} />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Anything else? <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.9rem' }}>(optional)</span></h2>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.25rem' }}>Why do you want to connect with this mentor? Any specific goals or questions?</p>

        <textarea
          style={{
            ...inputStyle,
            height: '140px',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
          placeholder="I'm a first-gen pre-med student interested in..."
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
        />

        <hr style={{ border: 'none', borderTop: '1px solid #1e2330', margin: '2.5rem 0' }} />

        <div style={{ marginBottom: '1.5rem' }}>
          <Turnstile
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
            onSuccess={(token) => { turnstileToken.current = token; }}
            onExpire={() => { turnstileToken.current = null; }}
            options={{ theme: "dark" }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              background: loading ? '#2a3040' : '#60a5fa',
              color: loading ? '#64748b' : '#0f1117',
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Submitting...' : 'Submit →'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.875rem',
  color: '#cbd5e1',
  marginBottom: '0.4rem',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1f2e',
  border: '1px solid #2a3040',
  borderRadius: '8px',
  padding: '0.75rem 1rem',
  color: 'white',
  fontSize: '0.95rem',
  outline: 'none',
  boxSizing: 'border-box',
}

const checkGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.5rem',
  marginBottom: '2.5rem',
}

const radioCardStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem 1rem',
  background: selected ? '#1a2744' : '#1a1f2e',
  border: `1px solid ${selected ? '#3b82f6' : '#2a3040'}`,
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.95rem',
  color: selected ? '#ffffff' : '#cbd5e1',
  transition: 'all 0.15s',
})

const checkCardStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem 1rem',
  background: selected ? '#1a2744' : '#1a1f2e',
  border: `1px solid ${selected ? '#3b82f6' : '#2a3040'}`,
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.875rem',
  color: selected ? '#ffffff' : '#cbd5e1',
  transition: 'all 0.15s',
})