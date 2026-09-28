'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SmsHandoffState } from '@/lib/cohort-application-sms'

const descriptions: Record<SmsHandoffState, string> = {
  pending: 'The application decision was saved, but phone enrollment has not been confirmed.',
  complete: 'The application phone preference was checked against the member record.',
  needs_review: 'Phone enrollment could not be confirmed. Retry after checking the member record.',
  conflict: 'The application phone or consent differs from the member preference or phone opt-out. Ask the member to review their SMS settings; an opted-out number must text START first.',
}

export default function SmsHandoffRecovery({
  applicationId,
  state,
}: {
  applicationId: string
  state: SmsHandoffState | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function retry() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/cohort-applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_sms_handoff' }),
      })
      const result = await response.json().catch(() => ({}))
      setMessage(response.ok
        ? result.warning ?? 'Phone enrollment checked.'
        : result.error ?? 'Could not retry phone enrollment.')
      if (response.ok) router.refresh()
    } catch {
      setMessage('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p style={{ margin: 0 }}>{state ? descriptions[state] : 'Phone enrollment has not been verified for this earlier approval.'}</p>
      {state !== 'complete' && (
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          style={{
            borderRadius: '8px',
            border: '1px solid #8a6a2f',
            background: '#ffffff',
            color: '#8a6a2f',
            padding: '0.5rem 0.8rem',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Checking…' : 'Retry phone enrollment'}
        </button>
      )}
      {message && <p role="status" style={{ margin: 0, fontSize: '0.85rem' }}>{message}</p>}
    </div>
  )
}
