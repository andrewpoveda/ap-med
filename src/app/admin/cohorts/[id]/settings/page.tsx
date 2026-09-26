import { notFound } from 'next/navigation'
import { completeQuery, completeInQuery } from '@/lib/complete-query'
import Link from 'next/link'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAscensoCohortId } from '@/lib/site'
import CohortConfiguration from '../../../CohortConfiguration'
import CohortDiscardControl from '../../../CohortDiscardControl'
import GrantEditor from './GrantEditor'
export const dynamic = 'force-dynamic'

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { adminUser } = await requireAdminSession()
  const { id } = await params
  if (!canAccessCohort(adminUser, id)) notFound()
  const admin = getSupabaseAdmin()
  const { data: cohort, error } = await admin.from('cohorts').select('id,name,org,status,config,config_version').eq('id', id).maybeSingle()
  if (error || !cohort) notFound()
  if (cohort.status === 'discarded' && adminUser.role !== 'super') notFound()
  const grants: { email: string; revoked: boolean }[] = []
  if (adminUser.role === 'super' && cohort.status !== 'discarded') {
    const { data, error: grantError } = await completeQuery(admin.from('admin_cohort_grants').select('admin_id,revoked_at').eq('cohort_id', id), 100_000, 'admin_id')
    if (grantError) throw new Error('Could not load grants')
    if (data?.length) {
      const { data: identities, error: identityError } = await completeInQuery(data.map(g => g.admin_id), batch => admin.from('admin_users').select('id,email').in('id', batch))
      if (identityError) throw new Error('Could not load administrators')
      for (const grant of data) {
        const identity = identities?.find(a => a.id === grant.admin_id)
        if (identity) grants.push({ email: identity.email, revoked: Boolean(grant.revoked_at) })
      }
    }
  }
  return <div className="space-y-8">
    <Link href="/admin">← Cohorts</Link>
    {cohort.status === 'discarded' ? (
      <CohortDiscardControl cohortId={id} cohortName={cohort.name} discarded expectedVersion={cohort.config_version} />
    ) : <>
      <CohortConfiguration key={`${cohort.id}:${cohort.config_version}`} cohort={{ ...cohort, orientation: typeof cohort.config?.orientation_date === 'string' ? cohort.config.orientation_date : '' }} />
      <Link href={`/admin/cohorts/${id}/members`}>Member management and support inbox</Link>
      {adminUser.role === 'super' && <GrantEditor cohortId={id} grants={grants} />}
      {adminUser.role === 'super' && cohort.status === 'setup' && (
        getAscensoCohortId() === id.toLowerCase()
          ? <p className="text-sm">This cohort is the configured public application destination. Change that configuration before discarding it.</p>
          : <CohortDiscardControl cohortId={id} cohortName={cohort.name} discarded={false} expectedVersion={cohort.config_version} />
      )}
    </>}
  </div>
}
