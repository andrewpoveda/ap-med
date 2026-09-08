import { completeQuery } from '@/lib/complete-query'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import MemberEditor from './MemberEditor'
import SupportEditor from './SupportEditor'
import { readCohortSupport } from '@/lib/cohort-support'
export const dynamic = 'force-dynamic'
export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { adminUser } = await requireAdminSession()
  const { id } = await params
  if (!canAccessCohort(adminUser, id)) notFound()
  const admin = getSupabaseAdmin()
  const [cohort, mentors, mentees, events] = await Promise.all([
    admin.from('cohorts').select('name, config').eq('id', id).maybeSingle(),
    completeQuery(admin.from('mentor').select('id, first_name, last_name, institution, current_role, bio, membership_status').eq('cohort_id', id).order('first_name')),
    completeQuery(admin.from('mentees').select('id, full_name, school, membership_status').eq('cohort_id', id).order('full_name')),
    admin.from('cohort_operation_events').select('id, target_id, action, reason, created_at').eq('cohort_id', id).order('created_at', { ascending: false }).limit(30),
  ])
  if (!cohort.data) notFound()
  if (mentors.error || mentees.error || events.error) throw new Error('Could not load member management')
  const rows = [...(mentors.data ?? []).map(m => ({ role: 'mentor' as const, id: m.id, name: `${m.first_name} ${m.last_name}`, fields: { first_name: m.first_name, last_name: m.last_name, institution: m.institution, current_role: m.current_role, bio: m.bio, membership_status: m.membership_status } })),
    ...(mentees.data ?? []).map(m => ({ role: 'mentee' as const, id: m.id, name: m.full_name, fields: { full_name: m.full_name, school: m.school, membership_status: m.membership_status } }))]
  return <div className="space-y-4">
    <Link href={`/admin/cohorts/${id}/matching`}>← Matching</Link>
    <h1 className="text-3xl">Members · {cohort.data.name}</h1>
    <SupportEditor cohortId={id} initial={readCohortSupport(cohort.data.config)} />
    <p>End active matches and remove selections before withdrawal or offboarding. Both statuses block participant access, matching and future routine cohort mail; records and auth ownership are retained. Restoring Active restores access.</p>
    <p>Coordinate or cancel existing calendar bookings before offboarding. This changes program access; it does not cancel calendar events or revoke the participant’s Google account.</p>
    <p>This editor corrects names and profile details. Email ownership, application answers, matching tags and track changes require deliberate operator review; public resubmission cannot overwrite them.</p>
    {rows.map(m => <details key={`${m.role}:${m.id}`} className="border rounded p-4">
      <summary>{m.name} · {m.role} · {m.fields.membership_status}</summary>
      <MemberEditor id={m.id} cohortId={id} role={m.role} fields={Object.fromEntries(Object.entries(m.fields).map(([k,v]) => [k, v ?? '']))} />
    </details>)}
    <h2 className="text-xl">Recent administrative actions (latest 30)</h2>
    {(events.data ?? []).map(e => <p key={e.id}>{new Date(e.created_at).toLocaleString('en-US')} · {e.action.replaceAll('_', ' ')} · {e.reason} · record {e.target_id}</p>)}
  </div>
}
