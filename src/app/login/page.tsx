import type { Metadata } from 'next'
import Link from 'next/link'
import LoginButton from './LoginButton'

export const metadata: Metadata = {
  title: 'Mentor Sign In | AP MED Mentors',
  description: 'Sign in to manage your AP MED mentor profile and sessions.',
  robots: { index: false, follow: false },
}

const ERRORS: Record<string, string> = {
  auth: 'Something went wrong signing you in. Please try again.',
  missing_code: 'That sign-in link was incomplete. Please try again.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const errorMessage = error ? (ERRORS[error] ?? ERRORS.auth) : null

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
        Mentor sign in
      </h1>
      <p className="mt-4 text-[#4a4a5a] max-w-md mx-auto leading-relaxed">
        Sign in with the Google account tied to your mentor profile to manage
        your sessions.
      </p>

      {errorMessage && (
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
          {errorMessage}
        </p>
      )}

      <div className="mt-8 flex justify-center">
        <LoginButton />
      </div>

      <p className="mt-8 text-[#6b6b6b]" style={{ fontSize: '0.9rem' }}>
        Not a mentor yet?{' '}
        <Link href="/mentor-onboarding" style={{ color: '#8a6a2f' }}>
          Apply to become one →
        </Link>
      </p>
    </section>
  )
}
