import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import SignOutButton from '@/app/dashboard/SignOutButton'
import LoginButton from './LoginButton'

/**
 * The one sign-in page for AP MED — mentors and Ascenso cohort mentees alike.
 *
 * Nobody picks a role here: /auth/callback resolves it from whichever member
 * table holds the Google-verified email and routes to that dashboard
 * (src/lib/account-role.ts). Two consequences shape this page:
 *
 *   - The copy has to speak to both audiences without asking which one you are.
 *   - "No account for this email" is a state this page owns, because a sign-in
 *     that resolves to no member row lands back here rather than on a dashboard
 *     that would have nothing to show.
 *
 * That state names the address Google returned, read from the (still valid)
 * session — never from a query parameter. An email in the URL would end up in
 * server logs, referrers, and the user's history for no benefit.
 */

export const metadata: Metadata = {
  title: 'Sign In | AP MED Mentors',
  description: 'Sign in to your AP MED mentor or Ascenso cohort dashboard.',
  robots: { index: false, follow: false },
}

const ERRORS: Record<string, string> = {
  auth: 'Something went wrong signing you in. Please try again.',
  missing_code: 'That sign-in link was incomplete. Please try again.',
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e8e4dc',
  borderRadius: '12px',
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(26,26,46,0.04)',
  textAlign: 'left',
  maxWidth: '34rem',
  margin: '0 auto',
}

const eyebrowStyle: CSSProperties = {
  fontSize: '0.7rem',
  color: '#9a948a',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: '0 0 0.5rem',
}

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.95rem',
  lineHeight: 1.65,
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  // These two are the outcomes of a *successful* Google sign-in that found no
  // usable member row, so the session is still live and we can name the address.
  const isAccountState = error === 'no_account' || error === 'account_conflict'
  const bannerMessage =
    error && !isAccountState ? (ERRORS[error] ?? ERRORS.auth) : null

  let signedInEmail: string | null = null
  if (isAccountState) {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    signedInEmail = user?.email ?? null
  }

  return (
    <section className="text-center py-16">
      <p
        style={{
          color: '#c8a96e',
          fontSize: '0.75rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: '1.5rem',
        }}
      >
        AP MED Mentors
      </p>
      <h1
        className="text-[#1a1a2e]"
        style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontWeight: 400 }}
      >
        Sign in
      </h1>
      <p className="mt-4 text-[#4a4a5a] max-w-md mx-auto leading-relaxed">
        Mentors and Ascenso cohort members use the same sign-in. Continue with the
        Google account for the email address on your profile or application, and
        we&apos;ll take you to the right dashboard.
      </p>

      {bannerMessage && (
        <p
          className="mt-6 max-w-md mx-auto"
          style={{
            background: '#fdf6e3',
            border: '1px solid #e0c060',
            color: '#8a6d1f',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            fontSize: '0.9rem',
          }}
        >
          {bannerMessage}
        </p>
      )}

      {error === 'no_account' && (
        <div className="mt-8" style={cardStyle}>
          <p style={eyebrowStyle}>No account found</p>
          <p className="text-[#4a4a5a]" style={bodyStyle}>
            Google signed you in{signedInEmail ? ' as ' : ''}
            {signedInEmail && <strong>{signedInEmail}</strong>}, but we
            couldn&apos;t find an AP MED mentor profile or an Ascenso cohort member
            with that email address.
          </p>
          <ul
            className="text-[#4a4a5a]"
            style={{
              margin: '1rem 0 0',
              paddingLeft: '1.15rem',
              fontSize: '0.95rem',
              lineHeight: 1.7,
              // Tailwind's preflight strips list markers; without this the three
              // reasons run together as one block of prose.
              listStyleType: 'disc',
            }}
          >
            <li>
              Applied with a different address? Switch accounts below and try that
              one.
            </li>
            <li>
              Ascenso dashboards open once the board approves your application and
              activates your match — you&apos;ll get an email when that happens.
            </li>
            <li>
              Everything else, we can fix by hand: email{' '}
              <a href="mailto:apmedpodcast@gmail.com" style={{ color: '#8a6a2f' }}>
                apmedpodcast@gmail.com
              </a>{' '}
              and we&apos;ll get you linked.
            </li>
          </ul>
          <div className="mt-5">
            <SignOutButton redirectTo="/login" label="Try a different Google account" />
          </div>
        </div>
      )}

      {error === 'account_conflict' && (
        <div className="mt-8" style={cardStyle}>
          <p style={eyebrowStyle}>Account already linked</p>
          <p className="text-[#4a4a5a]" style={bodyStyle}>
            There is an AP MED profile for{' '}
            {signedInEmail ? <strong>{signedInEmail}</strong> : 'that email address'},
            but it&apos;s already linked to a different sign-in — so we won&apos;t
            attach it to this one automatically. Email{' '}
            <a href="mailto:apmedpodcast@gmail.com" style={{ color: '#8a6a2f' }}>
              apmedpodcast@gmail.com
            </a>{' '}
            and we&apos;ll sort out which account should own it.
          </p>
          <div className="mt-5">
            <SignOutButton redirectTo="/login" label="Try a different Google account" />
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <LoginButton />
      </div>

      <p
        className="mt-6 text-[#6b6b6b] max-w-md mx-auto"
        style={{ fontSize: '0.85rem', lineHeight: 1.65 }}
      >
        We use Google only to confirm your email address — that&apos;s what matches
        you to your profile. AP MED never sees your password and asks for no access
        to Gmail, Drive, Calendar, or anything else in your Google account. Mentors
        who want automatic invites can connect Google Calendar later from the
        dashboard; that&apos;s a separate step you approve on its own.
      </p>

      <p className="mt-8 text-[#6b6b6b]" style={{ fontSize: '0.9rem' }}>
        Not a mentor yet?{' '}
        <Link href="/mentor-onboarding" style={{ color: '#8a6a2f' }}>
          Apply to become one →
        </Link>
      </p>
      <p className="mt-2 text-[#6b6b6b]" style={{ fontSize: '0.9rem' }}>
        Curious about the Ascenso cohort?{' '}
        <Link href="/ascenso" style={{ color: '#8a6a2f' }}>
          Read about the program →
        </Link>
      </p>
    </section>
  )
}
