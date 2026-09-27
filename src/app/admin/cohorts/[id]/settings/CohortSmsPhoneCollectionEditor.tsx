'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CohortSmsCollectionMode } from '@/lib/cohort-sms-collection'

export default function CohortSmsPhoneCollectionEditor({ cohortId, initialMode, expectedVersion }: {
  cohortId: string
  initialMode: CohortSmsCollectionMode
  expectedVersion: number
}) {
  const router = useRouter()
  const [mode, setMode] = useState(initialMode)
  const [savedMode, setSavedMode] = useState(initialMode)
  const [version, setVersion] = useState(expectedVersion)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (mode === savedMode) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/admin/cohorts/${cohortId}/sms-phone-collection`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, reason, expectedVersion: version }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(result.error ?? 'Could not save phone collection settings.')
        return
      }
      setSavedMode(mode)
      setVersion(result.version)
      setReason('')
      setMessage('Phone collection setting saved.')
      router.refresh()
    } catch {
      setMessage('Could not reach the server. Refresh before trying again.')
    } finally {
      setBusy(false)
    }
  }

  return <form onSubmit={save} className="border rounded p-4 space-y-3">
    <h2 className="text-xl">Phone collection during applications</h2>
    <p className="text-sm">This setting controls phone collection in application forms that use AP MED&apos;s shared cohort onboarding fields. It does not create a public application page or enable SMS sending.</p>
    <label className="block">Collection mode
      <select className="block border rounded p-2 w-full" value={mode} onChange={event => setMode(event.target.value as CohortSmsCollectionMode)}>
        <option value="off">Off — do not ask for phone or SMS consent</option>
        <option value="optional">Optional — ask for phone and consent</option>
        <option value="required">Required phone — consent stays optional</option>
      </select>
    </label>
    <p className="text-sm">Consent is always a separate, unchecked choice. Requiring a phone number never requires agreement to receive texts.</p>
    <label className="block">Reason for changing this setting
      <input className="block border rounded p-2 w-full" required minLength={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} />
    </label>
    <button className="border rounded px-4 py-2" disabled={busy || mode === savedMode}>{busy ? 'Saving…' : 'Save phone collection'}</button>
    <p role="status">{message}</p>
  </form>
}
