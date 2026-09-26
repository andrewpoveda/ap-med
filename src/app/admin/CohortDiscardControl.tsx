'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CohortDiscardControl({ cohortId, cohortName, discarded, expectedVersion }: {
  cohortId: string
  cohortName: string
  discarded: boolean
  expectedVersion: number
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!discarded && confirmation !== cohortName) {
      setMessage('Type the cohort name exactly to confirm.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/admin/cohorts/${cohortId}/discard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: discarded ? 'restore' : 'discard', reason, expectedVersion }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(result.error ?? 'Could not update the cohort.')
        return
      }
      router.push('/admin')
      router.refresh()
    } catch {
      setMessage('Could not reach the server. Refresh the cohort list before trying again.')
    } finally {
      setBusy(false)
    }
  }

  return <form onSubmit={submit} className="space-y-3">
    <h2>{discarded ? 'Restore cohort' : 'Discard unused cohort'}</h2>
    <p className="text-sm">
      {discarded
        ? 'Restoring returns this cohort to setup. Its organization owner and audit history are retained.'
        : 'Only an unused setup cohort can be discarded. It disappears from the active list and can be restored later. Its organization owner and audit history are retained.'}
    </p>
    <label className="block">Reason
      <input className="block border rounded p-2 w-full" required minLength={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} />
    </label>
    {!discarded && <label className="block">Type “{cohortName}” to confirm
      <input className="block border rounded p-2 w-full" required value={confirmation} onChange={event => setConfirmation(event.target.value)} />
    </label>}
    <button className="border rounded px-4 py-2" disabled={busy}>{busy ? 'Saving…' : discarded ? 'Restore cohort' : 'Discard cohort'}</button>
    <p role="status">{message}</p>
  </form>
}
