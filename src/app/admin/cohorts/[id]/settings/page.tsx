import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import CohortConfiguration from '../../../CohortConfiguration'
import GrantEditor from './GrantEditor'
export const dynamic = 'force-dynamic'

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { adminUser } = await requireAdminSession()
  const { id } = await params
  if (!canAccessCohort(adminUser, id)) notFound()
  const admin = getSupabaseAdmin()
  const { data: cohort, error } = await admin.from('cohorts').select('id,name,org,status,config').eq('id', id).maybeSingle()
  if (error || !cohort) notFound()
  const grants: { email: string; revoked: boolean }[] = []
  if (adminUser.role === 'super') {
    const { data, error: grantError } = await admin.from('admin_cohort_grants').select('admin_id,revoked_at').eq('cohort_id', id)
    if (grantError) throw new Error('Could not load grants')
    if (data?.length) {
      const { data: identities, error: identityError } = await admin.from('admin_users').select('id,email').in('id', data.map(g => g.admin_id))
      if (identityError) throw new Error('Could not load administrators')
      for (const grant of data) {
        const identity = identities?.find(a => a.id === grant.admin_id)
        if (identity) grants.push({ email: identity.email, revoked: Boolean(grant.revoked_at) })
      }
    }
  }
  return <div className="space-y-8">
    <Link href="/admin">← Cohorts</Link>
    <CohortConfiguration key={`${cohort.id}:${cohort.status}`} cohort={{ ...cohort, orientation: typeof cohort.config?.orientation_date === 'string' ? cohort.config.orientation_date : '' }} />
    <Link href={`/admin/cohorts/${id}/members`}>Member management and support inbox</Link>
    {adminUser.role === 'super' && <GrantEditor cohortId={id} grants={grants} />}
  </div>
}
