'use client'
import { SPECIALTIES } from "@/data/specialties"
import { IDENTITY_OPTIONS, HELP_WITH_OPTIONS } from "@/data/tags"
import { useState, useEffect, useRef } from 'react'
import { Turnstile } from "@marsidev/react-turnstile"
import { useSearchParams, useRouter } from 'next/navigation'
import { isValidEmail } from '@/lib/validate'
import { isHttpUrl } from '@/lib/url'

const STEPS = [
  { eyebrow: 'Start here', title: 'The basics' },
  { eyebrow: 'Match preferences', title: 'Support' },
  { eyebrow: 'Match preferences', title: 'Specialty' },
  { eyebrow: 'Match preferences', title: 'Identity' },
  { eyebrow: 'Your request', title: 'Your goals' },
  { eyebrow: 'Final step', title: 'Review & submit' },
] as const

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

// Identity + help-with options come from the shared canonical lists
// (src/data/tags.ts) so this form, the mentor form, and the Ascenso cohort
// application all emit identical strings — see IDENTITY_OPTIONS import.
const IDENTITIES = IDENTITY_OPTIONS
const HELP_WITH = HELP_WITH_OPTIONS

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
  linkedin_url: '',
  notes: '',
})
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [stepError, setStepError] = useState<string | null>(null)
  const turnstileToken = useRef<string | null>(null)
  const formTopRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (mentorFromUrl) {
      setForm(prev => ({ ...prev, requested_mentor: mentorFromUrl }))
    }
  }, [mentorFromUrl])

  const moveToStep = (step: number) => {
    setStepError(null)
    setCurrentStep(step)
    window.requestAnimationFrame(() => {
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const validateStep = (step: number): string | null => {
    const nameParts = form.full_name.trim().split(/\s+/)
    if (step === 0) {
      if (!nameParts[0] || !nameParts[1]) return 'Enter your first and last name to continue.'
      if (!isValidEmail(form.email)) return 'Enter a valid email address to continue.'
      if (!form.school.trim()) return 'Enter your school or institution to continue.'
      if (!form.current_stage) return 'Choose your current stage to continue.'
      if (form.linkedin_url.trim() && !isHttpUrl(form.linkedin_url)) {
        return 'LinkedIn URLs need to start with http:// or https://.'
      }
    }
    if (step === 1 && form.help_with.length === 0) {
      return 'Select at least one area where you want support.'
    }
    if (step === 2) {
      if (form.interests.length === 0) {
        return 'Select at least one medical interest to continue.'
      }
      if (form.interests.includes(OTHER_SPECIALTY) && !form.other_interest.trim()) {
        return 'Enter your other specialty, or deselect Other.'
      }
    }
    if (step === 3 && form.identity.length === 0) {
      return 'Select at least one identity or background option to continue.'
    }
    if (step === 5 && !turnstileToken.current) {
      return 'Complete the CAPTCHA check before submitting.'
    }
    return null
  }

  const handleNext = () => {
    const error = validateStep(currentStep)
    if (error) {
      setStepError(error)
      return
    }
    moveToStep(Math.min(currentStep + 1, STEPS.length - 1))
  }

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

    if (form.help_with.length === 0) {
      alert('Please select at least one area where you want support.')
      return
    }

    if (form.interests.length === 0) {
      alert('Please select at least one medical interest.')
      return
    }

    if (form.interests.includes(OTHER_SPECIALTY) && !form.other_interest.trim()) {
      alert('Please enter your other specialty or deselect Other.')
      return
    }

    if (form.identity.length === 0) {
      alert('Please select at least one identity or background option.')
      return
    }

    if (!turnstileToken.current) {
      alert('Please complete the CAPTCHA check first.')
      return
    }

    setLoading(true)

    try {
      // 1. Save mentee + run matching in one Turnstile-verified request.
      //    No email fires on submit — mentors are only notified when the mentee
      //    clicks "Request" on the results page.
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

      if (!saveData.mentors) {
        console.error('Matching failed (mentee saved) — showing browse-all results')
        // Still show results even if match fails — just redirect to browse all
        router.push('/mentors/results')
        return
      }

      // 2. Store results in sessionStorage and redirect. The menteeId is the
      //    request capability the results page sends to /api/notify — the
      //    endpoint resolves all mentee data from the DB row by this id.
      sessionStorage.setItem('matchResults', JSON.stringify(saveData.mentors))
      sessionStorage.setItem('menteeName', form.full_name)
      sessionStorage.setItem('menteeId', saveData.menteeId || '')
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

  const handleFinalSubmit = () => {
    const error = validateStep(STEPS.length - 1)
    if (error) {
      setStepError(error)
      return
    }
    setStepError(null)
    void handleSubmit()
  }

  return (
    <div className="ascenso-apply-page">
      <div className="ascenso-apply-shell" ref={formTopRef}>
        <header className="ascenso-apply-header">
          <p className="ascenso-apply-kicker">AP MED Mentors</p>
          <h1>Request a mentor</h1>
          <p>
            Tell us a little about yourself and we&apos;ll show you mentors matched on identity,
            specialty, and mentorship needs. It takes about 3–5 minutes.
          </p>
        </header>

        {testMode && (
          <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#fdf6e3', border: '1px solid #e0c060', borderRadius: '8px', color: '#8a6d1f', fontSize: '0.85rem', lineHeight: 1.5 }}>
            🧪 <strong>Test mode</strong> — your submission will still be saved, and clicking
            Request on your results will <strong>not send any email</strong>.
          </div>
        )}

        <div className="ascenso-step-meta">
          <span>Step {currentStep + 1} of {STEPS.length}</span>
          <span>{STEPS[currentStep].title}</span>
        </div>
        <div
          className="ascenso-progress"
          aria-label={`Step ${currentStep + 1} of ${STEPS.length}`}
          style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}
        >
          {STEPS.map((step, index) => (
            <button
              key={step.title}
              type="button"
              className={index <= currentStep ? 'is-active' : ''}
              aria-label={`${step.title}${index === currentStep ? ', current step' : ''}`}
              aria-current={index === currentStep ? 'step' : undefined}
              disabled={index >= currentStep}
              onClick={() => {
                if (index < currentStep) moveToStep(index)
              }}
            />
          ))}
        </div>

        <section className="ascenso-step-card" aria-live="polite">
          <div className="ascenso-step-heading">
            <p>{STEPS[currentStep].eyebrow}</p>
            <h2>{STEPS[currentStep].title}</h2>
          </div>

          {currentStep === 0 && (
            <div className="ascenso-step-content">
              {mentorFromUrl && (
                <div
                  style={{
                    padding: '0.9rem 1rem',
                    border: '1px solid #e8e4dc',
                    borderRadius: '10px',
                    background: '#faf8f4',
                  }}
                >
                  <span style={{ display: 'block', marginBottom: '0.2rem', color: '#817b72', fontSize: '0.74rem' }}>
                    Requesting mentorship from
                  </span>
                  <strong style={{ display: 'block', color: '#4a4a5a', fontSize: '0.95rem' }}>
                    {mentorFromUrl}
                  </strong>
                </div>
              )}

              <div>
                <h3>Basic information</h3>
                <div className="ascenso-fields-grid">
                  <div>
                    <label style={labelStyle}>First name *</label>
                    <input
                      style={inputStyle}
                      autoComplete="given-name"
                      placeholder="John"
                      value={form.full_name.split(' ')[0] || ''}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        full_name: e.target.value + ' ' + (prev.full_name.split(' ')[1] || ''),
                      }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Last name *</label>
                    <input
                      style={inputStyle}
                      autoComplete="family-name"
                      placeholder="Doe"
                      value={form.full_name.split(' ')[1] || ''}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        full_name: (prev.full_name.split(' ')[0] || '') + ' ' + e.target.value,
                      }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Email address *</label>
                    <input
                      style={inputStyle}
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>School / Institution *</label>
                    <input
                      style={inputStyle}
                      autoComplete="organization"
                      placeholder="Rutgers University"
                      value={form.school}
                      onChange={e => setForm(prev => ({ ...prev, school: e.target.value }))}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={labelStyle}>
                    LinkedIn URL <span style={{ color: '#9a948a' }}>(optional)</span>
                  </label>
                  <input
                    style={inputStyle}
                    type="url"
                    placeholder="https://linkedin.com/in/yourname"
                    value={form.linkedin_url}
                    onChange={e => setForm(prev => ({ ...prev, linkedin_url: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <h3>Your current stage *</h3>
                <p className="ascenso-helper">Where are you in your pre-med journey?</p>
                <div className="ascenso-choice-list">
                  {STAGES.map(stage => (
                    <label key={stage} style={radioCardStyle(form.current_stage === stage)}>
                      <input
                        type="radio"
                        name="stage"
                        value={stage}
                        checked={form.current_stage === stage}
                        onChange={() => setForm(prev => ({ ...prev, current_stage: stage }))}
                        style={{ accentColor: '#c8a96e' }}
                      />
                      {stage}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="ascenso-step-content">
              <div>
                <h3>What do you need help with? *</h3>
                <p className="ascenso-helper">Select at least one. Choose all that apply.</p>
                <div className="ascenso-check-grid">
                  {HELP_WITH.map(item => (
                    <label key={item} style={checkCardStyle(form.help_with.includes(item))}>
                      <input
                        type="checkbox"
                        checked={form.help_with.includes(item)}
                        onChange={() => toggleArrayField('help_with', item)}
                        style={{ accentColor: '#c8a96e' }}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="ascenso-step-content">
              <div>
                <h3>Your medical interests *</h3>
                <p className="ascenso-helper">
                  Select at least one specialty you&apos;re interested in.
                </p>
                <div className="ascenso-check-grid">
                  {INTEREST_OPTIONS.map(spec => (
                    <label key={spec} style={checkCardStyle(form.interests.includes(spec))}>
                      <input
                        type="checkbox"
                        checked={form.interests.includes(spec)}
                        onChange={() => handleInterestToggle(spec)}
                        style={{ accentColor: '#c8a96e' }}
                      />
                      {spec}
                    </label>
                  ))}
                </div>
                {form.interests.includes(OTHER_SPECIALTY) && (
                  <div className="ascenso-other-field">
                    <label style={labelStyle}>Your other specialty</label>
                    <input
                      list="other-specialty-options"
                      style={inputStyle}
                      placeholder="Type your other specialty"
                      value={form.other_interest}
                      onChange={e =>
                        setForm(prev => ({ ...prev, other_interest: e.target.value }))
                      }
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
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="ascenso-step-content">
              <div>
                <h3>Identity / background *</h3>
                <p className="ascenso-helper">
                  Helps us match you with someone who shares your background. Select at least one.
                </p>
                <div className="ascenso-check-grid">
                  {IDENTITIES.map(item => (
                    <label key={item} style={checkCardStyle(form.identity.includes(item))}>
                      <input
                        type="checkbox"
                        checked={form.identity.includes(item)}
                        onChange={() => toggleArrayField('identity', item)}
                        style={{ accentColor: '#c8a96e' }}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="ascenso-step-content">
              <div>
                <h3>
                  Anything else? <span className="ascenso-optional">(optional)</span>
                </h3>
                <p className="ascenso-helper">
                  Why do you want to connect with a mentor? Any specific goals or questions?
                </p>
                <textarea
                  style={{ ...inputStyle, height: '150px', resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="I’m a first-gen pre-med student interested in…"
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="ascenso-step-content">
              <div className="ascenso-review-summary">
                <div>
                  <span>Current stage</span>
                  <strong>{form.current_stage}</strong>
                </div>
                <div>
                  <span>Support areas</span>
                  <strong>{form.help_with.length} selected</strong>
                </div>
                <div>
                  <span>Specialties</span>
                  <strong>{form.interests.length} selected</strong>
                </div>
              </div>
              <p className="ascenso-helper">
                Use Back or the completed progress bars to edit your answers before submitting.
              </p>
              <div className="ascenso-privacy-note">
                <strong>Community expectations</strong>
                <p>
                  AP MED Mentors connects students with volunteer mentors in good faith. By
                  submitting this form, you agree to engage respectfully and professionally. AP
                  MED reserves the right to remove any user from the platform for inappropriate
                  conduct. AP MED is not liable for the outcomes of mentorship relationships.
                </p>
              </div>
              <p
                style={{
                  margin: '-0.65rem 0 0',
                  color: '#6b6b6b',
                  fontSize: '0.875rem',
                  lineHeight: 1.55,
                }}
              >
                We&apos;re so glad you&apos;re here, and we look forward to supporting you on your path
                to medicine.
              </p>
              <Turnstile
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                onSuccess={token => { turnstileToken.current = token }}
                onExpire={() => { turnstileToken.current = null }}
                options={{ theme: 'light' }}
              />
            </div>
          )}

          {stepError && (
            <p className="ascenso-step-error" role="alert">{stepError}</p>
          )}

          <div className="ascenso-step-actions">
            <button
              type="button"
              className="ascenso-back-button"
              onClick={() => moveToStep(currentStep - 1)}
              disabled={currentStep === 0 || loading}
            >
              ← Back
            </button>
            {currentStep < STEPS.length - 1 ? (
              <button type="button" className="ascenso-next-button" onClick={handleNext}>
                Next →
              </button>
            ) : (
              <button
                type="button"
                className="ascenso-next-button"
                onClick={handleFinalSubmit}
                disabled={loading}
              >
                {loading ? 'Finding your matches…' : 'See my matches →'}
              </button>
            )}
          </div>
        </section>

        <p className="ascenso-save-note">Your answers stay here while this page remains open.</p>
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
