'use client'
import { SPECIALTIES } from "@/data/specialties"
import { IDENTITY_OPTIONS, HELP_WITH_OPTIONS } from "@/data/tags"
import { MENTEE_STAGE_OPTIONS } from '@/data/mentee-onboarding'
import { useState, useEffect, useRef } from 'react'
import {
  ReliableTurnstile,
  type ReliableTurnstileHandle,
  type TurnstileStatus,
} from '@/components/ReliableTurnstile'
import { usePostHog } from 'posthog-js/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { fetchWithTimeout, isRequestTimeout } from '@/lib/fetch-with-timeout'
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
  first_name: string
  last_name: string
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

// Identity + help-with options come from the shared canonical lists
// (src/data/tags.ts) so this form, the mentor form, and the Ascenso cohort
// application all emit identical strings — see IDENTITY_OPTIONS import.
const IDENTITIES = IDENTITY_OPTIONS
const HELP_WITH = HELP_WITH_OPTIONS

const OTHER_SPECIALTY = 'Other'
const INTEREST_OPTIONS = [...SPECIALTIES, OTHER_SPECIALTY].filter((item, index, self) => self.indexOf(item) === index)

export default function MenteeOnboardingForm() {
  const posthog = usePostHog()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mentorFromUrl = searchParams.get('mentor') || ''
  const testMode = searchParams.get('test') === '1'
  const [form, setForm] = useState<MenteeOnboardingFormData>({
  first_name: '',
  last_name: '',
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
  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus>('loading')
  const turnstileToken = useRef<string | null>(null)
  const turnstileRef = useRef<ReliableTurnstileHandle | null>(null)
  const submittingRef = useRef(false)
  const submissionId = useRef<string | null>(null)
  const formTopRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (mentorFromUrl) {
      setForm(prev => ({ ...prev, requested_mentor: mentorFromUrl }))
    }
  }, [mentorFromUrl])

  const moveToStep = (step: number) => {
    if (currentStep === STEPS.length - 1 && step < currentStep) {
      turnstileToken.current = null
      setTurnstileStatus('loading')
    }
    setStepError(null)
    setCurrentStep(step)
    window.requestAnimationFrame(() => {
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const validateStep = (step: number): string | null => {
    if (step === 0) {
      if (!form.first_name.trim() || !form.last_name.trim()) {
        return 'Enter your first and last name to continue.'
      }
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
    if (step === 5 && (!turnstileToken.current || turnstileStatus !== 'ready')) {
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
    if (submittingRef.current) return
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email || !form.school || !form.current_stage) {
      setStepError('Please fill out all required fields.')
      return
    }

    if (form.help_with.length === 0) {
      setStepError('Please select at least one area where you want support.')
      return
    }

    if (form.interests.length === 0) {
      setStepError('Please select at least one medical interest.')
      return
    }

    if (form.interests.includes(OTHER_SPECIALTY) && !form.other_interest.trim()) {
      setStepError('Please enter your other specialty or deselect Other.')
      return
    }

    if (form.identity.length === 0) {
      setStepError('Please select at least one identity or background option.')
      return
    }

    const widgetExpired = turnstileRef.current?.isExpired() === true
    if (!turnstileToken.current || turnstileStatus !== 'ready' || widgetExpired) {
      turnstileToken.current = null
      setTurnstileStatus('loading')
      setStepError('The security check is refreshing. Please wait a moment, then submit again.')
      turnstileRef.current?.reset()
      posthog?.capture('mentee_submission_blocked', { reason: 'captcha_not_ready' })
      return
    }

    submittingRef.current = true
    setLoading(true)
    setStepError(null)
    const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`

    try {
      submissionId.current ??= createSubmissionId()
      // 1. Save mentee + run matching in one Turnstile-verified request.
      //    No email fires on submit — mentors are only notified when the mentee
      //    clicks "Request" on the results page.
      const saveRes = await fetchWithTimeout('/api/mentees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          full_name: fullName,
          submission_id: submissionId.current,
          turnstile_token: turnstileToken.current,
        }),
      })

      const saveData = await saveRes.json().catch(() => null)

      if (!saveRes.ok) {
        console.error('Supabase API error:', saveData?.error || saveData)
        const isCaptchaFailure = saveData?.code === 'captcha_failed'
        turnstileToken.current = null
        setTurnstileStatus('loading')
        turnstileRef.current?.reset()
        setStepError(isCaptchaFailure
          ? 'The security check expired before your submission reached us. Your answers are still here—when the check says complete, submit again.'
          : `${saveData?.error || "We couldn't save your request"}. Your answers are still here—when the fresh security check says complete, try again.`)
        posthog?.capture('mentee_submission_failed', {
          reason: isCaptchaFailure ? 'captcha_failed' : (saveData?.code || `http_${saveRes.status}`),
        })
        return
      }

      if (!saveData.mentors) {
        console.error('Matching failed (mentee saved) — showing browse-all results')
        // Preserve the saved submission context instead of sending the results
        // page there empty (which would bounce back to a blank form).
        sessionStorage.setItem('matchResults', JSON.stringify([]))
        sessionStorage.setItem('menteeName', fullName)
        sessionStorage.setItem('menteeId', saveData.menteeId || '')
        sessionStorage.setItem('matchTestMode', testMode ? '1' : '')
        router.push('/mentors/results')
        return
      }

      // 2. Store results in sessionStorage and redirect. The menteeId is the
      //    request capability the results page sends to /api/notify — the
      //    endpoint resolves all mentee data from the DB row by this id.
      sessionStorage.setItem('matchResults', JSON.stringify(saveData.mentors))
      sessionStorage.setItem('menteeName', fullName)
      sessionStorage.setItem('menteeId', saveData.menteeId || '')
      // Carry dry-run mode to the results page so the "Request" button also skips email
      sessionStorage.setItem('matchTestMode', testMode ? '1' : '')
      posthog?.capture('mentee_submission_succeeded')
      router.push('/mentors/results')
    } catch (error) {
      console.error('Submit error:', error)
      const timedOut = isRequestTimeout(error)
      turnstileToken.current = null
      setTurnstileStatus('loading')
      turnstileRef.current?.reset()
      setStepError(timedOut
        ? "The server took too long to respond. Your answers are still here—when the fresh security check says complete, try again."
        : "We couldn't reach the server. Your answers are still here—check your connection, then try again when the fresh security check says complete.")
      posthog?.capture('mentee_submission_failed', {
        reason: timedOut ? 'request_timeout' : 'network_error',
      })
    } finally {
      submittingRef.current = false
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
                    <label htmlFor="mentee-first-name" style={labelStyle}>First name *</label>
                    <input
                      id="mentee-first-name"
                      name="first_name"
                      style={inputStyle}
                      autoComplete="given-name"
                      placeholder="John"
                      value={form.first_name}
                      onChange={e => setForm(prev => ({ ...prev, first_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="mentee-last-name" style={labelStyle}>Last name *</label>
                    <input
                      id="mentee-last-name"
                      name="last_name"
                      style={inputStyle}
                      autoComplete="family-name"
                      placeholder="Doe"
                      value={form.last_name}
                      onChange={e => setForm(prev => ({ ...prev, last_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="mentee-email" style={labelStyle}>Email address *</label>
                    <input
                      id="mentee-email"
                      name="email"
                      style={inputStyle}
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="mentee-school" style={labelStyle}>School / Institution *</label>
                    <input
                      id="mentee-school"
                      name="school"
                      style={inputStyle}
                      autoComplete="organization"
                      placeholder="Rutgers University"
                      value={form.school}
                      onChange={e => setForm(prev => ({ ...prev, school: e.target.value }))}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="mentee-linkedin" style={labelStyle}>
                    LinkedIn URL <span style={{ color: '#9a948a' }}>(optional)</span>
                  </label>
                  <input
                    id="mentee-linkedin"
                    name="linkedin_url"
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
                  {MENTEE_STAGE_OPTIONS.map(stage => (
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
                    <label htmlFor="mentee-other-specialty" style={labelStyle}>Your other specialty</label>
                    <input
                      id="mentee-other-specialty"
                      name="other_interest"
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
                <h3 id="mentee-notes-label">
                  Anything else? <span className="ascenso-optional">(optional)</span>
                </h3>
                <p className="ascenso-helper">
                  Why do you want to connect with a mentor? Any specific goals or questions?
                </p>
                <textarea
                  name="notes"
                  aria-labelledby="mentee-notes-label"
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
              <div style={securityPanelStyle} aria-live="polite">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: '#1a1a2e' }}>Security check</strong>
                    <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.8rem', color: turnstileStatus === 'error' ? '#b91c1c' : '#6b6b6b' }}>
                      {turnstileStatus === 'ready' && 'Complete — your request is ready to submit.'}
                      {turnstileStatus === 'loading' && 'Checking your browser. This usually takes a moment.'}
                      {turnstileStatus === 'error' && "The security check couldn't load. A content blocker or network issue may be interfering."}
                    </span>
                  </div>
                  {turnstileStatus === 'error' && (
                    <button
                      type="button"
                      onClick={() => {
                        turnstileToken.current = null
                        setStepError(null)
                        setTurnstileStatus('loading')
                        turnstileRef.current?.retry()
                      }}
                      style={retryButtonStyle}
                    >
                      Retry
                    </button>
                  )}
                </div>
                <ReliableTurnstile
                  ref={turnstileRef}
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                  onTokenChange={token => {
                    turnstileToken.current = token
                  }}
                  onStatusChange={setTurnstileStatus}
                />
              </div>
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
                disabled={loading || turnstileStatus !== 'ready'}
              >
                {loading
                  ? 'Finding your matches…'
                  : turnstileStatus !== 'ready'
                    ? 'Finishing security check…'
                    : 'See my matches →'}
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

const securityPanelStyle: React.CSSProperties = {
  padding: '1rem',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  background: '#f7f3ec',
}

const retryButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  border: 0,
  background: 'transparent',
  color: '#8a6a2f',
  fontSize: '0.8rem',
  fontWeight: 600,
  textDecoration: 'underline',
  cursor: 'pointer',
}

function createSubmissionId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  // Older WebKit builds expose getRandomValues but not randomUUID. Keep the
  // idempotency protection working there instead of leaving Submit stuck.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
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
