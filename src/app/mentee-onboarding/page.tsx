import { Suspense } from 'react'
import MenteeOnboardingForm from './MenteeOnboardingForm'

export default function Page() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0f1117' }} />}> 
      <MenteeOnboardingForm />
    </Suspense>
  )
}