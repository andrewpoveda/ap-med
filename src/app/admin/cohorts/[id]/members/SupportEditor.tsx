'use client'
import { useState } from 'react'
import type { CohortSupport } from '@/lib/cohort-support'

export default function SupportEditor({ cohortId, initial }: { cohortId: string; initial: CohortSupport }) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <form className="border rounded p-4 space-y-3" onSubmit={async e => {
    e.preventDefault(); setBusy(true)
    try {
      const res = await fetch(`/api/admin/cohorts/${cohortId}/support`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
      const data = await res.json()
      setMessage(res.ok ? 'Program support saved.' : data.error ?? 'Could not save.')
    } catch { setMessage('Could not reach the server.') }
    finally { setBusy(false) }
  }}>
    <h2 className="text-xl">Program support</h2>
    <p>Match-issue and reassignment requests go to this inbox. Assign someone to monitor it and follow up with participants.</p>
    <label className="block">Display name<input className="block border p-2" required maxLength={150} value={value.name} onChange={e => setValue({ ...value, name: e.target.value })} /></label>
    <label className="block">Support email<input className="block border p-2" type="email" required value={value.email} onChange={e => setValue({ ...value, email: e.target.value })} /></label>
    <label className="block">Program contact or instructions<textarea className="block border p-2 w-full" maxLength={2000} value={value.instructions} onChange={e => setValue({ ...value, instructions: e.target.value })} /></label>
    <button className="border rounded p-2" disabled={busy}>Save support contact</button>
    <p role="status">{message}</p>
  </form>
}
