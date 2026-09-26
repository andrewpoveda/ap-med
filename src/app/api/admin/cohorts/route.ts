import { NextResponse } from 'next/server'
import { resolveAdminSession, canAccessCohort } from '@/lib/admin'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
export const runtime = 'nodejs'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cohortConflictMessages = new Set([
  'Creation request changed; check the cohort list before starting a new one',
  'Cohort settings changed; refresh',
  'Cohort changed; refresh',
  'Unsupported lifecycle transition',
  'End active matches and remove pending selections before closeout',
  'Cancel future sessions and resolve calendar cleanup before closeout',
  'Resolve uncertain email before closeout',
])

export async function POST(request: Request) {
  const session = await resolveAdminSession()
  if (session.status === 'unauthenticated') return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (session.status !== 'admin') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : null
  if (id ? !canAccessCohort(session.adminUser, id) : session.adminUser.role !== 'super') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (body.id != null && (id === null || !uuidPattern.test(id))) return NextResponse.json({ error: 'Valid cohort ID required' }, { status: 400 })
  for (const field of ['name', 'org', 'reason']) {
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > (field === 'reason' ? 2000 : 200)) return NextResponse.json({ error: `Valid ${field} required` }, { status: 400 })
  }
  if (body.reason.trim().length < 3 || !['setup', 'applications_open', 'matching', 'active', 'closed'].includes(body.status)) return NextResponse.json({ error: 'Valid status and reason required' }, { status: 400 })
  if (!id && body.status !== 'setup') return NextResponse.json({ error: 'New cohorts begin in setup' }, { status: 400 })
  const orientation = body.orientation === '' || body.orientation == null ? null : body.orientation
  const organizationId = body.organizationId === '' || body.organizationId == null ? null : body.organizationId
  if (organizationId !== null && (id || typeof organizationId !== 'string' || !uuidPattern.test(organizationId))) return NextResponse.json({ error: 'Choose an organization for a new cohort only' }, { status: 400 })
  if (orientation !== null && (typeof orientation !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(orientation) || Number.isNaN(Date.parse(orientation)) || new Date(orientation).toISOString().slice(0, 10) !== orientation)) return NextResponse.json({ error: 'Valid orientation date required' }, { status: 400 })
  if (!id && (typeof body.createRequestId !== 'string' || !uuidPattern.test(body.createRequestId))) return NextResponse.json({ error: 'Creation request ID required' }, { status: 400 })
  if (id && !['setup', 'applications_open', 'matching', 'active', 'closed'].includes(body.expected)) return NextResponse.json({ error: 'Refresh the page before saving cohort settings' }, { status: 400 })
  if (id && (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0)) return NextResponse.json({ error: 'Refresh the page before saving cohort settings' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin().rpc('ascenso_configure_cohort_guarded', {
    p_id: id, p_actor: session.adminUser.id, p_name: body.name.trim(), p_org: body.org.trim(),
    p_orientation: orientation, p_status: body.status, p_expected: body.expected ?? null, p_reason: body.reason.trim(),
    p_organization: organizationId, p_create_request: id ? null : body.createRequestId,
    p_expected_version: id ? body.expectedVersion : null,
  })
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ((error.code === '23514' || error.code === '23505') && cohortConflictMessages.has(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    const reference = crypto.randomUUID()
    const code = typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unknown'
    console.error('Could not configure cohort', { reference, code, operation: id ? 'update' : 'create' })
    return NextResponse.json({ error: `Could not save cohort. Check the cohort list before retrying. Reference: ${reference}` }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: data })
}
