import type { Metadata } from 'next'
import { Suspense } from 'react'
import MenteeOnboardingForm from './MenteeOnboardingForm'

export const metadata: Metadata = {
  title: 'Get Matched with a Mentor | AP MED',
  description:
    'Apply for free pre-med mentorship at AP MED. Get matched with a mentor based on your identity, specialty interest, and goals.',
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#faf8f4' }} />}>
      <MenteeOnboardingForm />
    </Suspense>
  )
}