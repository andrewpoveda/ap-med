'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CohortConfiguration({ cohort, organizations = [] }: { cohort?: { id: string; name: string; org: string; status: string; orientation: string }; organizations?: { id: string; name: string }[] }) {
  const router = useRouter()
  const [name, setName] = useState(cohort?.name ?? '')
  const [org, setOrg] = useState(cohort?.org ?? '')
  const [organizationId, setOrganizationId] = useState('')
  const [status, setStatus] = useState(cohort?.status ?? 'setup')
  const [orientation, setOrientation] = useState(cohort?.orientation ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const transitions: Record<string, string[]> = { setup: ['setup', 'applications_open'], applications_open: ['applications_open', 'matching'], matching: ['matching', 'applications_open', 'active'], active: ['active', 'closed'], closed: ['closed'] }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/admin/cohorts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cohort?.id, name, org, organizationId: organizationId || null, status, orientation, reason, expected: cohort?.status }) })
      const result = await res.json()
      if (!res.ok) setMessage(result.error ?? 'Could not save')
      else { setMessage('Saved.'); router.push(`/admin/cohorts/${result.id}/settings`); router.refresh() }
    } catch { setMessage('Could not reach the server. Check the cohort list before creating again.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={save} className="space-y-3">
    <h2>{cohort ? 'Program settings' : 'Create cohort'}</h2>
    {!cohort && <label className="block">Organization owner<select className="block border rounded p-2 w-full" value={organizationId} onChange={e => setOrganizationId(e.target.value)}>
      <option value="">Create a new organization owner</option>
      {organizations.map(o => <option key={o.id} value={o.id}>{o.name} · {o.id.slice(0, 8)}</option>)}
    </select><span className="text-sm">Choose an existing owner for a returning program. Labels alone do not establish shared ownership; this association cannot be changed through settings later.</span></label>}
    <label className="block">Cohort name<input className="block border rounded p-2 w-full" required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className="block">Organization / program label<input className="block border rounded p-2 w-full" required maxLength={200} value={org} onChange={e => setOrg(e.target.value)} /></label>
    <label className="block">Orientation date<input className="block border rounded p-2" type="date" value={orientation} onChange={e => setOrientation(e.target.value)} /></label>
    <label className="block">Status<select className="block border rounded p-2" value={status} onChange={e => setStatus(e.target.value)}>
      {(cohort ? transitions[cohort.status] ?? [cohort.status] : ['setup']).map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
    </select></label>
    <p className="text-sm">Setup → applications open → matching → active → closed. Matching may reopen intake. Closeout preserves reports and requires resolving live matches, future sessions, calendar cleanup and uncertain email first. The public application destination still requires operator configuration.</p>
    <label className="block">Reason<input className="block border rounded p-2 w-full" required minLength={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <button className="border rounded px-4 py-2" disabled={busy}>{busy ? 'Saving…' : 'Save cohort'}</button>
    <p role="status">{message}</p>
  </form>
}
