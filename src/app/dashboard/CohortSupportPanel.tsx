import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveActingMember } from '@/lib/goals'
import { readCohortSupport, supportMailto } from '@/lib/cohort-support'
import { isValidEmail } from '@/lib/validate'

/** Resolve the actor again server-side so no panel caller can disclose another
 * cohort's support configuration or a proposed partner's contact details. */
export default async function CohortSupportPanel() {
  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const admin = getSupabaseAdmin()
  const actor = await resolveActingMember(admin, user.id)
  if (!actor) return null
  const { data: cohort } = await admin.from('cohorts').select('name, config').eq('id', actor.cohortId).maybeSingle()
  if (!cohort) return null
  const support = readCohortSupport(cohort.config)
  const { data: matches } = await admin.from('cohort_matches').select('mentor_id, mentee_id')
    .eq('cohort_id', actor.cohortId).eq(actor.type === 'mentor' ? 'mentor_id' : 'mentee_id', actor.id).eq('status', 'active')
  const contacts: string[] = []
  for (const match of matches ?? []) {
    const { data: partner } = await admin.from(actor.type === 'mentor' ? 'mentees' : 'mentor').select('email')
      .eq('id', actor.type === 'mentor' ? match.mentee_id : match.mentor_id).eq('cohort_id', actor.cohortId).eq('membership_status', 'active').maybeSingle()
    if (partner && isValidEmail(partner.email)) contacts.push(partner.email)
  }
  return <aside className="border rounded-xl p-5 space-y-3">
    {contacts.map(email => <p key={email}><a className="underline" href={`mailto:${email}`}>Contact your partner directly</a> to arrange a meeting or discuss a booking change.</p>)}
    <p><a className="underline" href={supportMailto(support, cohort.name, actor.id)}>Request match help or reassignment from {support.name}</a></p>
    <p className="text-sm">This opens an email to {support.email}. Describe the issue and send it to the program team. Your current match stays in place until an administrator changes it.</p>
    {support.instructions && <p className="whitespace-pre-wrap text-sm">{support.instructions}</p>}
  </aside>
}
