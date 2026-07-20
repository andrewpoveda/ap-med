import type { SupabaseClient } from '@supabase/supabase-js'
import { MILESTONE_CATALOG, type CohortMemberType } from '@/lib/cohort-dashboard'
import { isValidEmail } from '@/lib/validate'

/**
 * Daily digest computation (ascenso-prm.md §5.9 / §7.12).
 *
 * Once a day the cron route asks: who has pending items? Five kinds —
 * an unlogged meeting this month, an incomplete milestone past the cohort's
 * orientation date, an active goal past its target date, an open survey they
 * haven't answered, and a session in the next 24 hours. ALL of a person's items
 * batch into ONE email (the route sends; this module only computes).
 *
 * Scope: cohorts with status 'active' only. Members shouldn't be nagged about
 * meetings/milestones while a cohort is still in setup/applications/matching,
 * and nothing here fires after 'closed'.
 *
 * Cooldown (§5.9): anyone who already received a digest within the cooldown
 * window (default 7 days) is skipped — EXCEPT session-in-24h items, which are
 * time-critical and exempt. Anyone already digested TODAY is skipped entirely,
 * which is what makes a same-day re-invocation of the cron a no-op (idempotent
 * per day).
 */

export const DIGEST_KIND = 'digest'
const DEFAULT_COOLDOWN_DAYS = 7

export type DigestItemKind =
  | 'unlogged_meeting'
  | 'milestone'
  | 'overdue_goal'
  | 'open_survey'
  | 'session_24h'

export type DigestItem = { kind: DigestItemKind; text: string }

export type DigestRecipient = {
  email: string
  firstName: string
  memberType: CohortMemberType
  memberId: string
  cohortId: string
  cohortName: string
  items: DigestItem[]
}

/** Cooldown window in days; DIGEST_COOLDOWN_DAYS overrides the default 7. */
export function getCooldownDays(): number {
  const raw = Number.parseInt(process.env.DIGEST_COOLDOWN_DAYS ?? '', 10)
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_COOLDOWN_DAYS
}

/** Query failures throw: a cron that silently computes "nobody pending" on a
 *  broken query would mask breakage forever — better a failed run in the Vercel
 *  cron log. */
function bail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`)
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Session times are rendered in ET — the cohort org (LMSA-NE) is Northeast-based
 *  and member timezones aren't stored. */
function formatSessionTime(iso: string): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
  return `${formatted} ET`
}

type MemberInfo = {
  type: CohortMemberType
  id: string
  name: string
  email: string
}

/**
 * Pending items for every member of one active cohort. All lookups are
 * cohort-scoped and computed from the pair's own rows; item text only ever
 * names the member's OWN partner (§6.3 — nothing cross-pair leaves here).
 */
async function computeCohortRecipients(
  admin: SupabaseClient,
  cohort: { id: string; name: string; config: Record<string, unknown> | null },
  now: Date,
): Promise<DigestRecipient[]> {
  const todayStr = utcDateString(now)
  const monthStart = `${todayStr.slice(0, 7)}-01`
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const [mentorsRes, menteesRes, matchesRes, milestonesRes, surveysRes] = await Promise.all([
    // Cohort member rows are scoped by cohort_id ONLY — no `approved` filter
    // (cohort mentors keep approved=false as defense in depth).
    admin.from('mentor').select('id, first_name, last_name, email').eq('cohort_id', cohort.id),
    admin.from('mentees').select('id, full_name, email').eq('cohort_id', cohort.id),
    admin
      .from('cohort_matches')
      .select('id, mentor_id, mentee_id')
      .eq('cohort_id', cohort.id)
      .eq('status', 'active'),
    admin
      .from('member_milestones')
      .select('member_type, member_id, milestone')
      .eq('cohort_id', cohort.id),
    admin.from('surveys').select('id, title').eq('cohort_id', cohort.id).eq('status', 'open'),
  ])
  if (mentorsRes.error) bail('digest mentor fetch', mentorsRes.error.message)
  if (menteesRes.error) bail('digest mentee fetch', menteesRes.error.message)
  if (matchesRes.error) bail('digest match fetch', matchesRes.error.message)
  if (milestonesRes.error) bail('digest milestone fetch', milestonesRes.error.message)
  if (surveysRes.error) bail('digest survey fetch', surveysRes.error.message)

  const members = new Map<string, MemberInfo>()
  for (const m of mentorsRes.data ?? []) {
    members.set(`mentor:${m.id}`, {
      type: 'mentor',
      id: m.id as string,
      name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Your mentor',
      email: String(m.email ?? ''),
    })
  }
  for (const m of menteesRes.data ?? []) {
    members.set(`mentee:${m.id}`, {
      type: 'mentee',
      id: m.id as string,
      name: (m.full_name as string) || 'Your mentee',
      email: String(m.email ?? ''),
    })
  }

  const matches = matchesRes.data ?? []
  const matchIds = matches.map((m) => m.id as string)
  const surveys = surveysRes.data ?? []
  const surveyIds = surveys.map((s) => s.id as string)
  const mentorIds = [...new Set(matches.map((m) => m.mentor_id as string))]

  const [logsRes, goalsRes, responsesRes, sessionsRes] = await Promise.all([
    matchIds.length > 0
      ? admin
          .from('meeting_logs')
          .select('match_id')
          .eq('cohort_id', cohort.id)
          .in('match_id', matchIds)
          .gte('met_at', monthStart)
      : Promise.resolve({ data: [], error: null }),
    matchIds.length > 0
      ? admin
          .from('goals')
          .select('match_id, title, target_date')
          .eq('cohort_id', cohort.id)
          .in('match_id', matchIds)
          .eq('status', 'active')
          .not('target_date', 'is', null)
          .lt('target_date', todayStr)
      : Promise.resolve({ data: [], error: null }),
    surveyIds.length > 0
      ? admin
          .from('survey_responses')
          .select('survey_id, member_id')
          .eq('cohort_id', cohort.id)
          .in('survey_id', surveyIds)
      : Promise.resolve({ data: [], error: null }),
    // Sessions carry no cohort/match id — they're joined to matches below by
    // the pair's own (mentor_id, mentee_id), so only this cohort's active pairs
    // can pick one up.
    mentorIds.length > 0
      ? admin
          .from('sessions')
          .select('mentor_id, mentee_id, scheduled_at')
          .in('mentor_id', mentorIds)
          .eq('status', 'scheduled')
          .gte('scheduled_at', now.toISOString())
          .lt('scheduled_at', in24h.toISOString())
      : Promise.resolve({ data: [], error: null }),
  ])
  if (logsRes.error) bail('digest meeting-log fetch', logsRes.error.message)
  if (goalsRes.error) bail('digest goal fetch', goalsRes.error.message)
  if (responsesRes.error) bail('digest survey-response fetch', responsesRes.error.message)
  if (sessionsRes.error) bail('digest session fetch', sessionsRes.error.message)

  const loggedThisMonth = new Set((logsRes.data ?? []).map((r) => r.match_id as string))
  const goalsByMatch = new Map<string, { title: string; target_date: string }[]>()
  for (const g of goalsRes.data ?? []) {
    const list = goalsByMatch.get(g.match_id as string) ?? []
    list.push({ title: g.title as string, target_date: g.target_date as string })
    goalsByMatch.set(g.match_id as string, list)
  }
  const answered = new Set(
    (responsesRes.data ?? []).map((r) => `${r.survey_id}:${r.member_id}`),
  )
  const sessionByPair = new Map<string, string>()
  for (const s of sessionsRes.data ?? []) {
    const key = `${s.mentor_id}:${s.mentee_id}`
    const existing = sessionByPair.get(key)
    const at = s.scheduled_at as string
    if (!existing || at < existing) sessionByPair.set(key, at)
  }
  const doneMilestones = new Set(
    (milestonesRes.data ?? []).map((r) => `${r.member_type}:${r.member_id}:${r.milestone}`),
  )

  // Milestone nags only start once the cohort's orientation has happened —
  // cohorts.config.orientation_date ('YYYY-MM-DD', set by the admin). Without
  // it, or before it, nobody is nagged about milestones.
  const rawOrientation = cohort.config?.orientation_date
  const orientationDate =
    typeof rawOrientation === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawOrientation)
      ? rawOrientation
      : null
  const pastOrientation = orientationDate !== null && todayStr > orientationDate

  const itemsByMember = new Map<string, DigestItem[]>()
  const push = (memberKey: string, item: DigestItem) => {
    const list = itemsByMember.get(memberKey) ?? []
    list.push(item)
    itemsByMember.set(memberKey, list)
  }

  // Per-pair items — a meeting log belongs to the match, so one log from either
  // side clears the nag for both. Session reminders likewise go to both.
  for (const match of matches) {
    const mentorKey = `mentor:${match.mentor_id}`
    const menteeKey = `mentee:${match.mentee_id}`
    const mentor = members.get(mentorKey)
    const mentee = members.get(menteeKey)
    if (!mentor || !mentee) continue

    if (!loggedThisMonth.has(match.id as string)) {
      push(mentorKey, {
        kind: 'unlogged_meeting',
        text: `No meeting with ${mentee.name} has been logged yet this month — book one or log an off-platform catch-up from your dashboard.`,
      })
      push(menteeKey, {
        kind: 'unlogged_meeting',
        text: `No meeting with ${mentor.name} has been logged yet this month — book one or log an off-platform catch-up from your dashboard.`,
      })
    }

    for (const goal of goalsByMatch.get(match.id as string) ?? []) {
      const item = (partner: string): DigestItem => ({
        kind: 'overdue_goal',
        text: `Your goal with ${partner}, "${goal.title}", passed its target date (${goal.target_date}) — mark it done or set a new date.`,
      })
      push(mentorKey, item(mentee.name))
      push(menteeKey, item(mentor.name))
    }

    const sessionAt = sessionByPair.get(`${match.mentor_id}:${match.mentee_id}`)
    if (sessionAt) {
      push(mentorKey, {
        kind: 'session_24h',
        text: `You have a session with ${mentee.name} coming up: ${formatSessionTime(sessionAt)}. The Meet link is on your dashboard.`,
      })
      push(menteeKey, {
        kind: 'session_24h',
        text: `You have a session with ${mentor.name} coming up: ${formatSessionTime(sessionAt)}. The Meet link is on your dashboard.`,
      })
    }
  }

  // Per-member items.
  for (const [memberKey, member] of members) {
    if (pastOrientation) {
      for (const milestone of MILESTONE_CATALOG[member.type]) {
        if (!doneMilestones.has(`${memberKey}:${milestone.key}`)) {
          push(memberKey, {
            kind: 'milestone',
            text: `"${milestone.label}" is still outstanding for you — reach out to the ${cohort.name} team if you think that's a mistake.`,
          })
        }
      }
    }
    for (const survey of surveys) {
      if (!answered.has(`${survey.id}:${member.id}`)) {
        push(memberKey, {
          kind: 'open_survey',
          text: `The "${survey.title}" survey is open and waiting for your response.`,
        })
      }
    }
  }

  const recipients: DigestRecipient[] = []
  for (const [memberKey, items] of itemsByMember) {
    const member = members.get(memberKey)
    if (!member || items.length === 0) continue
    if (!isValidEmail(member.email)) continue
    recipients.push({
      email: member.email.trim(),
      firstName: member.name.trim().split(/\s+/)[0],
      memberType: member.type,
      memberId: member.id,
      cohortId: cohort.id,
      cohortName: cohort.name,
      items,
    })
  }
  return recipients
}

/**
 * Everyone with pending items across every ACTIVE cohort, before cooldown.
 * A shared email across cohorts (shouldn't happen, but cheap to be correct)
 * merges into one recipient so nobody is double-mailed in one run.
 */
export async function computeDigestRecipients(
  admin: SupabaseClient,
  now: Date,
): Promise<DigestRecipient[]> {
  const { data: cohorts, error } = await admin
    .from('cohorts')
    .select('id, name, config')
    .eq('status', 'active')
  if (error) bail('digest cohort fetch', error.message)

  const byEmail = new Map<string, DigestRecipient>()
  for (const cohort of cohorts ?? []) {
    const cohortRecipients = await computeCohortRecipients(
      admin,
      {
        id: cohort.id as string,
        name: (cohort.name as string) || 'Your cohort',
        config: (cohort.config as Record<string, unknown>) ?? null,
      },
      now,
    )
    for (const r of cohortRecipients) {
      const key = r.email.toLowerCase()
      const existing = byEmail.get(key)
      if (existing) existing.items.push(...r.items)
      else byEmail.set(key, r)
    }
  }
  return [...byEmail.values()]
}

export type CooldownResult = {
  toSend: DigestRecipient[]
  /** Digested earlier today — the same-day idempotency skip. */
  skippedAlreadySentToday: number
  /** Inside the cooldown window with no session-in-24h item to justify a send. */
  skippedCooldown: number
}

/**
 * Apply the §5.9 cooldown against email_log (kind 'digest'):
 *   - already digested TODAY → skipped outright (idempotent per day);
 *   - digested within the window → only session_24h items survive (they're
 *     exempt); no session item means no email;
 *   - otherwise → everything goes.
 */
export async function applyDigestCooldown(
  admin: SupabaseClient,
  recipients: DigestRecipient[],
  now: Date,
  cooldownDays: number,
): Promise<CooldownResult> {
  if (recipients.length === 0) {
    return { toSend: [], skippedAlreadySentToday: 0, skippedCooldown: 0 }
  }

  const todayUtcStart = new Date(now)
  todayUtcStart.setUTCHours(0, 0, 0, 0)
  const cooldownStart = new Date(now.getTime() - cooldownDays * 24 * 60 * 60 * 1000)

  const { data: recent, error } = await admin
    .from('email_log')
    .select('recipient_email, sent_at')
    .eq('kind', DIGEST_KIND)
    .gte('sent_at', cooldownStart.toISOString())
    .in('recipient_email', recipients.map((r) => r.email))
  if (error) bail('digest cooldown fetch', error.message)

  const lastSent = new Map<string, string>()
  for (const row of recent ?? []) {
    const key = String(row.recipient_email).toLowerCase()
    const at = row.sent_at as string
    const existing = lastSent.get(key)
    if (!existing || at > existing) lastSent.set(key, at)
  }

  const result: CooldownResult = { toSend: [], skippedAlreadySentToday: 0, skippedCooldown: 0 }
  for (const recipient of recipients) {
    const last = lastSent.get(recipient.email.toLowerCase())
    if (!last) {
      result.toSend.push(recipient)
      continue
    }
    if (new Date(last) >= todayUtcStart) {
      result.skippedAlreadySentToday += 1
      continue
    }
    const sessionItems = recipient.items.filter((i) => i.kind === 'session_24h')
    if (sessionItems.length === 0) {
      result.skippedCooldown += 1
      continue
    }
    result.toSend.push({ ...recipient, items: sessionItems })
  }
  return result
}
