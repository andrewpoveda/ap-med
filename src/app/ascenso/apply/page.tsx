import type { Metadata } from 'next'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import AscensoApplyForm from './AscensoApplyForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Apply to Ascenso | AP MED',
  description:
    'Apply to Ascenso, the LMSA-NE mentorship cohort on AP MED — as a mentor or a mentee, across premed, med-student, and resident tracks.',
}

// Server component: resolves the currently-open Ascenso cohort with the
// service-role client (cohorts is RLS-locked) and hands its id to the client
// form. No open cohort → applications-closed state.
export default async function Page() {
  let cohort: { id: string; name: string } | null = null

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('cohorts')
      .select('id, name')
      .ilike('name', 'ascenso%')
      .eq('status', 'applications_open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('Ascenso cohort lookup failed:', error.message)
    }
    cohort = data ?? null
  } catch (err) {
    console.error('Ascenso cohort lookup crashed:', err)
  }

  if (!cohort) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#faf8f4',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#1a1a2e',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <p
          style={{
            color: '#c8a96e',
            fontSize: '0.75rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '0.75rem',
          }}
        >
          Ascenso · LMSA-NE
        </p>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>
          Applications aren&apos;t open right now
        </h1>
        <p style={{ color: '#6b6b6b', maxWidth: '480px', lineHeight: 1.6 }}>
          The Ascenso cohort isn&apos;t accepting applications at the moment. Check back
          soon, or explore AP MED&apos;s open mentor directory in the meantime.
        </p>
        <Link
          href="/mentors"
          style={{ marginTop: '2rem', color: '#c8a96e', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          Browse mentors →
        </Link>
      </div>
    )
  }

  return <AscensoApplyForm cohortId={cohort.id} cohortName={cohort.name} />
}
