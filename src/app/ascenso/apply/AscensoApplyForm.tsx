'use client'
import { useState, useRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { usePostHog } from 'posthog-js/react'
import Link from 'next/link'
import { SPECIALTIES } from '@/data/specialties'
import {
  IDENTITY_OPTIONS,
  ASCENSO_HELP_WITH_OPTIONS,
  HELP_WITH_OTHER,
  ASCENSO_PREVIOUS_MENTOR_OPTIONS,
  ASCENSO_MENTEE_CAPACITY_OPTIONS,
} from '@/data/tags'
import { isValidEmail } from '@/lib/validate'
import { isHttpUrl } from '@/lib/url'

type Role = 'mentor' | 'mentee'

const STEPS = [
  { eyebrow: 'Start here', title: 'The basics' },
  { eyebrow: 'Match preferences', title: 'Specialty' },
  { eyebrow: 'Match preferences', title: 'Support' },
  { eyebrow: 'Match preferences', title: 'Identity' },
  { eyebrow: 'Your application', title: 'Your story' },
  { eyebrow: 'Your application', title: 'Program fit' },
  { eyebrow: 'Final step', title: 'Review & agree' },
] as const

type ApplicationFormData = {
  role: Role
  track: string
  full_name: string
  email: string
  institution: string
  current_position: string
  current_location: string
  motivation: string
  experience_goals: string
  linkedin_url: string
  can_commit: boolean
  // Structured matching inputs. These are what the cohort matcher actually
  // scores (identity 40% · specialty 35% · mentorship needs 25%) — the free-text
  // answers above are for the board's review, not for matching. Held in one
  // shape here and mapped to the role-appropriate key on submit, mirroring the
  // member columns each side is promoted into: a mentor's `specialty` is what
  // they practice and their `can_help_with` is what they offer; a mentee's
  // `preferred_specialty` is what they want to explore and their `help_with` is
  // what they need. BOTH sides answer the support-needs question — that's what
  // gives the 25% weight something to compare.
  specialty: string[]
  help_with: string[]
  help_with_other: string
  identity: string[]
  // Board additions for the 2026–27 cycle. Free text and single-selects only —
  // none of these are matcher inputs; they're read by the board at review.
  //
  // Role-scoped, and asked of one side only: a mentee's goals / prior
  // mentorship, a mentor's capacity / what they're prepared to support. Like
  // `track` and the tag arrays above, they reset on a role switch so a
  // half-filled mentee answer can't ride along on a mentor submission.
  goals_milestones: string
  previous_mentor: string
  previous_mentor_notes: string
  mentee_capacity: string
  prepared_to_support: string
  // Acknowledgments. The first two read identically to both sides; the third is
  // ONE checkbox whose wording changes with the role — never two on screen.
  agrees_surveys: boolean
  agrees_conduct: boolean
  agrees_participation: boolean
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
  const posthog = usePostHog()
  const [form, setForm] = useState<ApplicationFormData>({
    role: 'mentee',
    track: '',
    full_name: '',
    email: '',
    institution: '',
    current_position: '',
    current_location: '',
    motivation: '',
    experience_goals: '',
    linkedin_url: '',
    can_commit: false,
    specialty: [],
    help_with: [],
    help_with_other: '',
    identity: [],
    goals_milestones: '',
    previous_mentor: '',
    previous_mentor_notes: '',
    mentee_capacity: '',
    prepared_to_support: '',
    agrees_surveys: false,
    agrees_conduct: false,
    agrees_participation: false,
  })

  // One terminal state instead of a boolean per outcome: applying again with an
  // address that already applied now UPDATES that application (migration 0007),
  // so "received", "updated" and "already reviewed, can't change it" are three
  // different things to say, and only one of them can be true.
  const [outcome, setOutcome] = useState<
    { kind: 'submitted' | 'updated' } | { kind: 'locked'; message: string } | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [stepError, setStepError] = useState<string | null>(null)
  const [turnstileStatus, setTurnstileStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const turnstileToken = useRef<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined)
  const submittingRef = useRef(false)
  const formTopRef = useRef<HTMLDivElement | null>(null)

  const isMentor = form.role === 'mentor'

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
      if (!form.track) return 'Choose the track that best matches where you are right now.'
      if (!form.full_name.trim()) return 'Enter your full name to continue.'
      if (!isValidEmail(form.email)) return 'Enter a valid email address to continue.'
      if (!form.institution.trim()) return 'Enter your school or institution to continue.'
      if (!form.current_position.trim()) {
        return `Enter your current ${isMentor ? 'role' : 'stage or year'} to continue.`
      }
      if (!form.current_location.trim()) return 'Enter your current city and state to continue.'
      if (form.linkedin_url.trim() && !isHttpUrl(form.linkedin_url)) {
        return 'LinkedIn URLs need to start with http:// or https://.'
      }
    }
    if (step === 1 && form.specialty.length === 0) {
      return isMentor
        ? 'Select at least one specialty you practice or trained in.'
        : 'Select at least one specialty you want to explore.'
    }
    if (step === 2) {
      if (form.help_with.length === 0) {
        return isMentor
          ? 'Select at least one area you can support your mentee in.'
          : 'Select at least one area you want support with.'
      }
      if (form.help_with.includes(HELP_WITH_OTHER) && !form.help_with_other.trim()) {
        return 'Describe your other support area, or deselect Other.'
      }
    }
    if (step === 3 && form.identity.length === 0) {
      return 'Select at least one identity or background option to continue.'
    }
    if (step === 4 && !form.motivation.trim()) {
      return isMentor
        ? 'Tell the board why you want to mentor in Ascenso.'
        : 'Tell the board why you want to join Ascenso.'
    }
    if (step === 5) {
      if (isMentor && !form.mentee_capacity) {
        return 'Choose how many mentees you would be willing to mentor.'
      }
      if (!isMentor && !form.goals_milestones.trim()) {
        return 'Share one to three goals or milestones for your first year in Ascenso.'
      }
      if (!isMentor && !form.previous_mentor) {
        return 'Tell us whether you have previously had a mentor.'
      }
    }
    if (step === 6) {
      if (!form.can_commit) {
        return 'Confirm that you can commit to regular meetings for the program year.'
      }
      if (!form.agrees_surveys || !form.agrees_conduct || !form.agrees_participation) {
        return 'Confirm each acknowledgment before submitting.'
      }
      if (!turnstileToken.current || turnstileStatus !== 'ready') {
        return 'Complete the CAPTCHA check before submitting.'
      }
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

  const setRole = (role: Role) => {
    // Track, specialty, and support needs all flip meaning with the role (your
    // own level changes, "what I practice" becomes "what I want to explore",
    // and "what I can offer" becomes "what I need"), so a stale selection would
    // silently mean the wrong thing — reset them. Identity asks the same
    // question either way, so it survives a role switch.
    //
    // The 2026–27 board questions are asked of one side only, so they clear too:
    // whichever pair is now hidden would otherwise submit answers the applicant
    // can no longer see. `agrees_participation` clears for the same reason —
    // its wording differs per role, so a box ticked as a mentee is not consent
    // to the mentor sentence. The other two acknowledgments read the same to
    // both sides and survive, like identity.
    setForm(prev =>
      prev.role === role
        ? prev
        : {
            ...prev,
            role,
            track: '',
            specialty: [],
            help_with: [],
            help_with_other: '',
            goals_milestones: '',
            previous_mentor: '',
            previous_mentor_notes: '',
            mentee_capacity: '',
            prepared_to_support: '',
            agrees_participation: false,
          },
    )
  }

  const toggleArrayField = (
    field: 'specialty' | 'help_with' | 'identity',
    value: string,
  ) => {
    setForm(prev => {
      const arr = prev[field]
      const next = arr.includes(value)
        ? arr.filter(v => v !== value)
        : [...arr, value]
      return {
        ...prev,
        [field]: next,
        // Deselecting "Other" clears the free-text box with it, so a stale
        // answer can't ride along on submit.
        ...(field === 'help_with' && value === HELP_WITH_OTHER && !next.includes(value)
          ? { help_with_other: '' }
          : {}),
      }
    })
  }

  const handleSubmit = async () => {
    if (submittingRef.current) return

    const widgetExpired = turnstileRef.current?.isExpired() === true
    if (!turnstileToken.current || turnstileStatus !== 'ready' || widgetExpired) {
      turnstileToken.current = null
      setTurnstileStatus('loading')
      setStepError('The security check is refreshing. Please wait a moment, then submit again.')
      turnstileRef.current?.reset()
      posthog?.capture('ascenso_application_blocked', {
        role: form.role,
        reason: 'captcha_not_ready',
      })
      return
    }

    submittingRef.current = true
    setLoading(true)

    try {
      // Role-appropriate wire keys, mirroring the mentor/mentees column split
      // the matcher reads: a mentor's own specialties are `specialty` and what
      // they offer is `can_help_with`; a mentee's wanted specialties are
      // `preferred_specialty` and what they need is `help_with`.
      const { specialty, help_with, ...rest } = form
      const res = await fetch('/api/cohort-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rest,
          ...(isMentor
            ? { specialty, can_help_with: help_with }
            : { preferred_specialty: specialty, help_with }),
          cohort_id: cohortId,
          turnstile_token: turnstileToken.current,
        }),
      })

      const resData = await res.json().catch(() => null)

      // 409 now means only one thing: the board already reviewed this
      // application, so it can't be rewritten. An un-reviewed one is updated in
      // place and comes back 200 with `updated`.
      if (res.status === 409) {
        setOutcome({
          kind: 'locked',
          message:
            typeof resData?.error === 'string'
              ? resData.error
              : 'Your application has already been reviewed.',
        })
        return
      }

      if (!res.ok) {
        console.error('Application API error:', resData?.error || resData)
        const isCaptchaFailure = resData?.code === 'captcha_failed'
        turnstileToken.current = null
        setTurnstileStatus('loading')
        turnstileRef.current?.reset()
        setStepError(isCaptchaFailure
          ? 'The security check expired before your application reached us. Your answers are still here—when the check says complete, submit again.'
          : `${resData?.error || "We couldn't save your application"}. Your answers are still here—when the fresh security check says complete, try again.`)
        posthog?.capture('ascenso_application_failed', {
          role: form.role,
          reason: isCaptchaFailure ? 'captcha_failed' : (resData?.code || `http_${res.status}`),
        })
        return
      }

      posthog?.capture('ascenso_application_succeeded', {
        role: form.role,
        updated: resData?.updated === true,
      })
      setOutcome({ kind: resData?.updated === true ? 'updated' : 'submitted' })
    } catch (error) {
      console.error('Submit error:', error)
      turnstileToken.current = null
      setTurnstileStatus('loading')
      turnstileRef.current?.reset()
      setStepError("We couldn't reach the server. Your answers are still here—check your connection, then try again when the fresh security check says complete.")
      posthog?.capture('ascenso_application_failed', {
        role: form.role,
        reason: 'network_error',
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

  if (outcome) {
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
          {outcome.kind === 'updated'
            ? 'Application updated'
            : outcome.kind === 'locked'
              ? 'You’ve already applied'
              : 'Application received'}
        </h1>
        <p style={{ color: '#6b6b6b', maxWidth: '480px', lineHeight: 1.6 }}>
          {outcome.kind === 'updated'
            ? `We've replaced your earlier ${form.role} application for ${cohortName} with these answers — the board reviews this version. Your previous answers are kept alongside it, so nothing you wrote is lost.`
            : outcome.kind === 'locked'
              ? `${outcome.message} We already have a ${form.role} application under this email for ${cohortName} — you're all set, and the board will reach out by email once decisions are made.`
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
    <div className="ascenso-apply-page">
      <div className="ascenso-apply-shell" ref={formTopRef}>
        <header className="ascenso-apply-header">
          <p className="ascenso-apply-kicker">Ascenso · LMSA-NE</p>
          <h1>Apply to {cohortName}</h1>
          <p>
            Ascenso is a structured, board-reviewed mentorship cohort run by LMSA-NE on AP MED.
            Pairs are matched across four tracks — premed through resident — and meet regularly
            throughout the program year. Applications take about 5 minutes.
          </p>
        </header>

        <div className="ascenso-step-meta">
          <span>
            Step {currentStep + 1} of {STEPS.length}
          </span>
          <span>{STEPS[currentStep].title}</span>
        </div>
        <div className="ascenso-progress" aria-label={`Step ${currentStep + 1} of ${STEPS.length}`}>
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
              <div>
                <h3>I&apos;m applying as a…</h3>
                <div className="ascenso-choice-grid ascenso-choice-grid--two">
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
              </div>

              <div>
                <h3>Your track *</h3>
                <p className="ascenso-helper">
                  {isMentor
                    ? 'Pick the pairing that matches where you are and who you want to mentor.'
                    : 'Pick the pairing that matches where you are and the mentor you’re looking for.'}
                </p>
                <div className="ascenso-choice-list">
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
              </div>

              <div>
                <h3>Basic information</h3>
                <div className="ascenso-fields-grid">
                  <div>
                    <label style={labelStyle}>Full name *</label>
                    <input
                      style={inputStyle}
                      autoComplete="name"
                      placeholder="John Doe"
                      value={form.full_name}
                      onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
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
                      placeholder={isMentor ? 'Boston Medical Center' : 'Rutgers University'}
                      value={form.institution}
                      onChange={e => setForm(prev => ({ ...prev, institution: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      {isMentor ? 'Current role *' : 'Current stage / year *'}
                    </label>
                    <input
                      style={inputStyle}
                      placeholder={isMentor ? 'PGY-2, Internal Medicine' : 'MS2 / Junior, Biology'}
                      value={form.current_position}
                      onChange={e =>
                        setForm(prev => ({ ...prev, current_position: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Current city and state *</label>
                    <input
                      style={inputStyle}
                      autoComplete="address-level2"
                      placeholder="Newark, NJ"
                      value={form.current_location}
                      onChange={e =>
                        setForm(prev => ({ ...prev, current_location: e.target.value }))
                      }
                    />
                  </div>
                  <div>
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
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="ascenso-step-content">
              <div>
                <h3>
                  {isMentor ? 'Your specialties *' : 'Specialties you want to explore *'}
                </h3>
                <p className="ascenso-helper">
                  {isMentor
                    ? 'Select every specialty you practice, trained in, or can speak to. Select all that apply.'
                    : 'Select every specialty you’re curious about — pick “Not yet decided” if you’re still figuring it out. Select all that apply.'}
                </p>
                <div className="ascenso-check-grid">
                  {SPECIALTIES.map(item => (
                    <label key={item} style={checkCardStyle(form.specialty.includes(item))}>
                      <input
                        type="checkbox"
                        checked={form.specialty.includes(item)}
                        onChange={() => toggleArrayField('specialty', item)}
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
                <h3>
                  {isMentor ? 'What can you help your mentee with? *' : 'What do you want support with? *'}
                </h3>
                <p className="ascenso-helper">
                  {isMentor
                    ? 'Both sides answer this, and the board pairs on the overlap — pick everything you’d genuinely be glad to help with.'
                    : 'Both sides answer this, and the board pairs on the overlap — pick everything you’d want a mentor’s help with.'}
                </p>
                <div className="ascenso-check-grid">
                  {[...ASCENSO_HELP_WITH_OPTIONS, HELP_WITH_OTHER].map(item => (
                    <label key={item} style={checkCardStyle(form.help_with.includes(item))}>
                      <input
                        type="checkbox"
                        checked={form.help_with.includes(item)}
                        onChange={() => toggleArrayField('help_with', item)}
                        aria-label={item === HELP_WITH_OTHER ? 'Other support area' : undefined}
                        style={{ accentColor: '#c8a96e' }}
                      />
                      {item}
                    </label>
                  ))}
                </div>
                {form.help_with.includes(HELP_WITH_OTHER) && (
                  <div className="ascenso-other-field">
                    <label style={labelStyle}>
                      {isMentor ? 'What else can you help with?' : 'What else do you want support with?'}
                    </label>
                    <input
                      style={inputStyle}
                      placeholder={
                        isMentor
                          ? 'e.g. Navigating a career change into medicine'
                          : 'e.g. Balancing caregiving with a post-bacc'
                      }
                      value={form.help_with_other}
                      onChange={e =>
                        setForm(prev => ({ ...prev, help_with_other: e.target.value }))
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="ascenso-step-content">
              <div>
                <h3>
                  Identity / background *
                </h3>
                <p className="ascenso-helper">
                  {isMentor
                    ? 'Helps the board pair you with a mentee who shares your background. Select all that apply.'
                    : 'Helps the board pair you with a mentor who shares your background. Select all that apply.'}
                </p>
                <div className="ascenso-check-grid">
                  {IDENTITY_OPTIONS.map(item => (
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
                  {isMentor ? 'Why do you want to mentor in Ascenso?' : 'Why do you want to join Ascenso?'} *
                </h3>
                <p className="ascenso-helper">
                  A few sentences is plenty — the board reads every application.
                </p>
                <textarea
                  style={{ ...inputStyle, height: '150px', resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder={
                    isMentor
                      ? 'I want to give students the guidance I wish I’d had…'
                      : 'I’m looking for structured guidance as I work toward…'
                  }
                  value={form.motivation}
                  onChange={e => setForm(prev => ({ ...prev, motivation: e.target.value }))}
                />
              </div>
              <div>
                <h3>
                  {isMentor
                    ? 'Mentorship or teaching experience'
                    : 'What do you hope to get out of the program?'}{' '}
                  <span className="ascenso-optional">(optional)</span>
                </h3>
                <textarea
                  style={{ ...inputStyle, height: '120px', resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder={
                    isMentor
                      ? 'Previous mentoring, tutoring, teaching, or advising…'
                      : 'Specific goals, questions, or milestones for this year…'
                  }
                  value={form.experience_goals}
                  onChange={e => setForm(prev => ({ ...prev, experience_goals: e.target.value }))}
                />
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="ascenso-step-content">
              {isMentor ? (
                <>
                  <div>
                    <h3>
                      How many mentees would you be willing to mentor during the 2026–27 program
                      year? *
                    </h3>
                    <div className="ascenso-choice-list">
                      {ASCENSO_MENTEE_CAPACITY_OPTIONS.map(option => (
                        <label key={option} style={radioCardStyle(form.mentee_capacity === option)}>
                          <input
                            type="radio"
                            name="mentee_capacity"
                            value={option}
                            checked={form.mentee_capacity === option}
                            onChange={() =>
                              setForm(prev => ({ ...prev, mentee_capacity: option }))
                            }
                            style={{ accentColor: '#c8a96e' }}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3>
                      Are there particular mentee goals, interests, or needs that you feel
                      especially prepared to support?{' '}
                      <span className="ascenso-optional">(optional)</span>
                    </h3>
                    <textarea
                      style={{ ...inputStyle, height: '120px', resize: 'vertical', fontFamily: 'inherit' }}
                      placeholder="e.g. First-generation students applying to research-heavy programs…"
                      value={form.prepared_to_support}
                      onChange={e =>
                        setForm(prev => ({ ...prev, prepared_to_support: e.target.value }))
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3>
                      What are one to three goals or milestones you hope to work toward during
                      your first year in Ascenso? *
                    </h3>
                    <p className="ascenso-helper">
                      Examples: completing a medical school application, finding a research
                      opportunity, exploring a specialty, preparing for residency applications,
                      improving professional communication, building a stronger professional
                      network.
                    </p>
                    <textarea
                      style={{ ...inputStyle, height: '120px', resize: 'vertical', fontFamily: 'inherit' }}
                      placeholder="e.g. Submit a strong medical school application, find a research mentor, and decide between two specialties…"
                      value={form.goals_milestones}
                      onChange={e =>
                        setForm(prev => ({ ...prev, goals_milestones: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <h3>Have you previously had a mentor? *</h3>
                    <div className="ascenso-choice-list">
                      {ASCENSO_PREVIOUS_MENTOR_OPTIONS.map(option => (
                        <label key={option} style={radioCardStyle(form.previous_mentor === option)}>
                          <input
                            type="radio"
                            name="previous_mentor"
                            value={option}
                            checked={form.previous_mentor === option}
                            onChange={() =>
                              setForm(prev => ({ ...prev, previous_mentor: option }))
                            }
                            style={{ accentColor: '#c8a96e' }}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>
                      Is there anything from a previous mentorship experience that you would like
                      Ascenso to consider?{' '}
                      <span style={{ color: '#9a948a' }}>(optional)</span>
                    </label>
                    <textarea
                      style={{ ...inputStyle, height: '100px', resize: 'vertical', fontFamily: 'inherit' }}
                      placeholder="What worked, what didn’t, or anything the board should know…"
                      value={form.previous_mentor_notes}
                      onChange={e =>
                        setForm(prev => ({ ...prev, previous_mentor_notes: e.target.value }))
                      }
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {currentStep === 6 && (
            <div className="ascenso-step-content">
              <div className="ascenso-review-summary">
                <div>
                  <span>Applying as</span>
                  <strong>{isMentor ? 'Mentor' : 'Mentee'}</strong>
                </div>
                <div>
                  <span>Specialties</span>
                  <strong>{form.specialty.length} selected</strong>
                </div>
                <div>
                  <span>Support areas</span>
                  <strong>{form.help_with.length} selected</strong>
                </div>
              </div>
              <p className="ascenso-helper">
                Review the commitments below. You can use Back or the completed progress bars to
                edit earlier answers.
              </p>

              <div className="ascenso-acknowledgments">
                <label style={checkCardStyle(form.can_commit)}>
                  <input
                    type="checkbox"
                    checked={form.can_commit}
                    onChange={e => setForm(prev => ({ ...prev, can_commit: e.target.checked }))}
                    style={{ accentColor: '#c8a96e' }}
                  />
                  I can commit to regular monthly meetings with my {isMentor ? 'mentee' : 'mentor'}{' '}
                  for the full program year. *
                </label>
                <label style={checkCardStyle(form.agrees_surveys)}>
                  <input
                    type="checkbox"
                    checked={form.agrees_surveys}
                    onChange={e => setForm(prev => ({ ...prev, agrees_surveys: e.target.checked }))}
                    style={{ accentColor: '#c8a96e' }}
                  />
                  I agree to complete brief midpoint and end-of-year feedback surveys to help LMSA
                  Northeast evaluate and improve Ascenso. *
                </label>
                <label style={checkCardStyle(form.agrees_conduct)}>
                  <input
                    type="checkbox"
                    checked={form.agrees_conduct}
                    onChange={e => setForm(prev => ({ ...prev, agrees_conduct: e.target.checked }))}
                    style={{ accentColor: '#c8a96e' }}
                  />
                  I agree to maintain respectful communication, appropriate professional
                  boundaries, and confidentiality throughout my participation in Ascenso. *
                </label>
                <label style={checkCardStyle(form.agrees_participation)}>
                  <input
                    type="checkbox"
                    checked={form.agrees_participation}
                    onChange={e =>
                      setForm(prev => ({ ...prev, agrees_participation: e.target.checked }))
                    }
                    style={{ accentColor: '#c8a96e' }}
                  />
                  {isMentor
                    ? 'I understand that Ascenso requires consistent and active participation throughout the program year, including regular communication with my mentee, required training, program check-ins, and agreed-upon mentorship activities. *'
                    : 'I understand that Ascenso requires consistent and active participation throughout the program year, including regular communication with my mentor, required training, program check-ins, and follow-through on agreed-upon goals. *'}
                </label>
              </div>

              <div className="ascenso-privacy-note">
                <strong>Your information stays private.</strong>
                <p>
                  Application information will be reviewed only by authorized Ascenso reviewers
                  and designated members of LMSA Northeast leadership for application review,
                  matching, communication, and evaluation. Information will not be made public
                  without the applicant&apos;s permission.
                </p>
              </div>

              <div style={securityPanelStyle} aria-live="polite">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: '#1a1a2e' }}>Security check</strong>
                    <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.8rem', color: turnstileStatus === 'error' ? '#b91c1c' : '#6b6b6b' }}>
                      {turnstileStatus === 'ready' && 'Complete — your application is ready to submit.'}
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
                        turnstileRef.current?.reset()
                      }}
                      style={retryButtonStyle}
                    >
                      Retry
                    </button>
                  )}
                </div>
                <Turnstile
                  ref={turnstileRef}
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                  onSuccess={token => {
                    turnstileToken.current = token
                    setTurnstileStatus('ready')
                  }}
                  onExpire={() => {
                    turnstileToken.current = null
                    setTurnstileStatus('loading')
                  }}
                  onTimeout={() => {
                    turnstileToken.current = null
                    setTurnstileStatus('loading')
                  }}
                  onError={() => {
                    turnstileToken.current = null
                    setTurnstileStatus('error')
                  }}
                  onUnsupported={() => {
                    turnstileToken.current = null
                    setTurnstileStatus('error')
                  }}
                  scriptOptions={{ onError: () => setTurnstileStatus('error') }}
                  options={{
                    theme: 'light',
                    appearance: 'always',
                    size: 'flexible',
                    retry: 'auto',
                    refreshExpired: 'auto',
                    refreshTimeout: 'auto',
                  }}
                />
              </div>
            </div>
          )}

          {stepError && (
            <p className="ascenso-step-error" role="alert">
              {stepError}
            </p>
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
                  ? 'Submitting…'
                  : turnstileStatus !== 'ready'
                    ? 'Finishing security check…'
                    : 'Submit application →'}
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
