import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import DeliveryStatus from '../DeliveryStatus'
export const dynamic = 'force-dynamic'

export default async function DeliveryPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }>
}) {
  const { adminUser } = await requireAdminSession()
  const { id } = await params
  if (!canAccessCohort(adminUser, id)) notFound()
  const page = Math.max(0, Math.min(100000, Number.parseInt((await searchParams).page ?? '0', 10) || 0))
  const { data, error, count } = await getSupabaseAdmin().from('cohort_delivery')
    .select('id,kind,variant,recipient_email,state,detail,created_at', { count: 'exact' }).eq('cohort_id', id)
    .order('created_at', { ascending: false }).order('id').range(page * 50, page * 50 + 49)
  if (error) throw new Error('Could not load email status')
  return <section className="space-y-4">
    <h1>Email status</h1>
    <p>Pending mail waits for daily capacity or another queue run. Failed or uncertain mail needs attention. Acceptance does not confirm inbox delivery; check the provider for bounces.</p>
    <Link href={`/admin/cohorts/${id}/announcements`}>Announcements</Link>
    <DeliveryStatus deliveries={(data ?? []).map(d => ({ ...d, variant: `${d.kind} · ${d.recipient_email} · ${d.variant}` }))} />
    <nav aria-label="Email status pages" className="flex gap-4">
      {page > 0 && <Link href={`?page=${page - 1}`}>Previous</Link>}
      {(page + 1) * 50 < (count ?? 0) && <Link href={`?page=${page + 1}`}>Next</Link>}
    </nav>
  </section>
}
