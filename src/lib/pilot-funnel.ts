import type { SupabaseClient } from '@supabase/supabase-js'
import { completeQuery } from '@/lib/complete-query'
import type { CohortExport } from '@/lib/cohort-export'

const earliest = (values: (string | null | undefined)[]) => values.filter((v): v is string => Boolean(v)).sort()[0] ?? ''

/** One application/role row; pair activity never implies individual engagement. */
export async function buildPilotFunnel(admin: SupabaseClient, cohortId: string, now = new Date()): Promise<CohortExport> {
  const [apps, matches, logs, goals, surveys, access, events] = await Promise.all([
    completeQuery(admin.from('cohort_applications').select('id,role,member_id,status,created_at,reviewed_at').eq('cohort_id', cohortId)),
    completeQuery(admin.from('cohort_matches').select('id,mentor_id,mentee_id,approved_at,activated_at,status').eq('cohort_id', cohortId)),
    completeQuery(admin.from('meeting_logs').select('id,match_id,met_at').eq('cohort_id', cohortId).lte('met_at', now.toISOString().slice(0, 10))),
    completeQuery(admin.from('goals').select('id,match_id,status').eq('cohort_id', cohortId)),
    completeQuery(admin.from('survey_responses').select('id,member_type,member_id').eq('cohort_id', cohortId)),
    completeQuery(admin.from('cohort_first_access').select('member_type,member_id,first_seen_at').eq('cohort_id', cohortId)),
    completeQuery(admin.from('cohort_operation_events').select('action,changes,created_at').eq('cohort_id', cohortId).eq('action', 'match_selected')),
  ])
  const failure = [apps, matches, logs, goals, surveys, access, events].find(result => result.error)
  if (failure) return { headers: [], rows: [], error: failure.error!.message }
  return {
    headers: ['Application ID', 'Role', 'Participation ID', 'Applied (UTC)', 'Current decision', 'Approved (UTC)',
      'First observed authenticated dashboard access (UTC; blank unknown)', 'First selection (UTC)', 'First activation (UTC; blank unknown)',
      'First logged meeting date', 'Distinct logged meeting dates (pair activity)', 'Repeated pair activity on separate dates',
      'Shared goals', 'Completed shared goals', 'Named survey responses'],
    rows: (apps.data ?? []).map(app => {
      const memberKey = app.role === 'mentor' ? 'mentor_id' : 'mentee_id'
      const ownedMatches = app.member_id ? (matches.data ?? []).filter(m => m[memberKey] === app.member_id) : []
      const ids = new Set(ownedMatches.map(m => m.id))
      const dates = [...new Set((logs.data ?? []).filter(l => ids.has(l.match_id)).map(l => l.met_at as string))].sort()
      const sharedGoals = (goals.data ?? []).filter(g => ids.has(g.match_id))
      const observed = (access.data ?? []).find(a => a.member_type === app.role && a.member_id === app.member_id)
      const selections = app.member_id ? (events.data ?? []).filter(e => e.changes?.[memberKey] === app.member_id) : []
      return [app.id, app.role, app.member_id ?? '', app.created_at, app.status, app.status === 'approved' ? app.reviewed_at ?? '' : '',
        observed?.first_seen_at ?? '', earliest([...ownedMatches.map(m => m.approved_at), ...selections.map(e => e.created_at)]),
        earliest(ownedMatches.map(m => m.activated_at)), dates[0] ?? '', dates.length, dates.length >= 2 ? 'yes' : 'no',
        sharedGoals.length, sharedGoals.filter(g => g.status === 'done').length,
        (surveys.data ?? []).filter(s => s.member_type === app.role && s.member_id === app.member_id).length]
    }),
    error: null,
  }
}
