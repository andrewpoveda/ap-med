'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type DeliverySummary = { id: string; variant: string; state: string; detail: string | null }
export default function DeliveryStatus({ deliveries }: { deliveries: DeliverySummary[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function act(id: string, action: string) {
    let reason = ''
    if (action !== 'retry') {
      reason = window.prompt(action === 'confirm_accepted'
        ? 'After checking the email provider, describe the evidence that this email was accepted (include the provider ID).'
        : 'Only proceed after the provider confirms this email was NOT accepted. Describe your evidence. This permits a new send.') ?? ''
      if (reason.trim().length < 10) return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/cohort-delivery/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }) })
      const data = await res.json()
      setMessage(data.error ?? data.warning ?? 'Delivery status updated.')
      router.refresh()
    } catch { setMessage('Could not reach the server. Refresh before retrying.') }
    finally { setBusy(false) }
  }
  return <div className="mt-3 space-y-2 text-sm">
    <p>Email status records provider acceptance, not inbox delivery.</p>
    {deliveries.length === 0 && <p>No tracked email intent. Historical sends are not inferred or resent.</p>}
    {deliveries.map(d => <div key={d.id}>
      <strong>{d.variant}: {d.state.replaceAll('_', ' ')}</strong>{d.detail && <p>{d.detail}</p>}
      {!['accepted', 'superseded'].includes(d.state) && <button className="underline mr-3" disabled={busy} onClick={() => act(d.id, 'retry')}>Retry unresolved emails</button>}
      {['failed', 'needs_review', 'sending'].includes(d.state) && <>
        <button className="underline mr-3" disabled={busy} onClick={() => act(d.id, 'confirm_accepted')}>Record provider-confirmed acceptance</button>
        <button className="underline" disabled={busy} onClick={() => act(d.id, 'confirm_not_sent')}>Record provider-confirmed non-send</button>
      </>}
    </div>)}
    {message && <p role="status">{message}</p>}
  </div>
}
