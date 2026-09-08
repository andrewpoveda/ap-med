import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { claimPerson, listParticipations, participationKey } from '@/lib/participation'
import ParticipationChoices from './ParticipationChoices'
export const dynamic = 'force-dynamic'

export default async function Programs() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser()
  if (!user) redirect('/login')
  const admin = getSupabaseAdmin()
  if (user.email) await claimPerson(admin, user.id, user.email)
  const available = await listParticipations(admin, user.id)
  const ids = [...new Set(available.flatMap(p => p.cohortId ? [p.cohortId] : []))]
  const { data: cohorts, error } = ids.length ? await admin.from('cohorts').select('id,name,status').in('id', ids) : { data: [], error: null }
  if (error) throw new Error('Could not load your programs')
  return <main className="max-w-2xl mx-auto px-5 py-12 space-y-5">
    <h1 className="text-3xl">Choose your program and role</h1>
    <p>Each program keeps its own matches, meetings and goals. Choose the role you want to use now. Refresh other open tabs after switching programs.</p>
    <ParticipationChoices choices={available.map(p => ({ key: participationKey(p), label: `${p.cohortId ? cohorts?.find(c => c.id === p.cohortId)?.name ?? 'Program' : 'AP MED public mentorship'} · ${p.type} · ${p.name}` }))} />
    {!available.length && <p>No active participation is available for this account. Contact your program team to check enrollment or reinstatement.</p>}
  </main>
}
