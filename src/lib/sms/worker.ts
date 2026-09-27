import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { completeInQuery } from '@/lib/complete-query'

// These windows deliberately exclude historical meetings when SMS is first
// enabled. A scheduler must run at least every 12 hours to cover reminders.
const HOUR_MS = 60 * 60 * 1000
export const SMS_REMINDER_MIN_HOURS_BEFORE = 18
export const SMS_REMINDER_MAX_HOURS_BEFORE = 30
export const SMS_CHECKIN_MIN_HOURS_AFTER = 1
export const SMS_CHECKIN_MAX_HOURS_AFTER = 25
const MAX_DUE_SESSIONS_PER_KIND = 500
const MAX_SMS_COHORT_CONTACTS = 500
const MAX_SENDS_PER_RUN = 40
const WORKER_TIME_BUDGET_MS = 45_000
const STALE_ATTEMPT_MINUTES = 15

type SmsKind = 'reminder' | 'checkin'
type MemberType = 'mentor' | 'mentee'
type Session = {
  id: string
  cohort_id: string
  match_id: string
  mentor_id: string
  mentee_id: string
  scheduled_at: string
  status: string
}
type Contact = {
  id: string
  cohort_id: string
  person_id: string
  phone_e164: string
  consented_at: string
}
type Member = { id: string; person_id: string | null; membership_status: string }
type Match = { id: string; cohort_id: string; mentor_id: string; mentee_id: string; status: string }
type Checkin = { id: string; session_id: string; member_type: MemberType; member_id: string; responded_at: string | null }
type Outbox = { id: string; session_id: string; contact_id: string; kind: SmsKind; state: string }
type Candidate = {
  kind: SmsKind
  session: Session
  contact: Contact
  memberType: MemberType
  memberId: string
}

/** A provider must report uncertainty separately from a definite rejection.
 * The database claim captures its fixed sender before any network request. */
export type WorkerSmsProvider = {
  name: string
  senderPhoneE164: string
  send(input: { toPhoneE164: string; body: string }): Promise<
    | { kind: 'accepted'; externalMessageId: string; fromPhoneE164: string }
    | { kind: 'rejected'; providerCode: string | null }
    | { kind: 'unknown'; externalMessageId?: string }
  >
}

export type SmsWorkerSummary = {
  enabled: boolean
  dueSessions: number
  queued: number
  accepted: number
  rejected: number
  needsReview: number
  reconciledStale: number
  skippedChanged: number
  pending: number
  complete: boolean
}

function emptySummary(enabled: boolean): SmsWorkerSummary {
  return { enabled, dueSessions: 0, queued: 0, accepted: 0,
    rejected: 0, needsReview: 0, reconciledStale: 0,
    skippedChanged: 0, pending: 0, complete: true }
}

export function smsDueWindows(now: Date) {
  const timestamp = now.getTime()
  if (!Number.isFinite(timestamp)) throw new Error('Invalid SMS worker time')
  return {
    reminderFrom: new Date(timestamp + SMS_REMINDER_MIN_HOURS_BEFORE * HOUR_MS).toISOString(),
    reminderThrough: new Date(timestamp + SMS_REMINDER_MAX_HOURS_BEFORE * HOUR_MS).toISOString(),
    checkinFrom: new Date(timestamp - SMS_CHECKIN_MAX_HOURS_AFTER * HOUR_MS).toISOString(),
    checkinThrough: new Date(timestamp - SMS_CHECKIN_MIN_HOURS_AFTER * HOUR_MS).toISOString(),
  }
}

export function buildReminderSms(): string {
  return 'AP MED: Your mentorship meeting is coming up in about a day. Check your calendar invite for the time. Reply STOP to unsubscribe.'
}

export function buildCheckinSms(replyCode: string): string {
  if (!/^[A-F0-9]{12}$/.test(replyCode)) throw new Error('Invalid SMS reply code')
  return `AP MED: How did your meeting go? Reply ${replyCode} then your answer (example: ${replyCode} Went well). No patient information. Reply STOP to unsubscribe.`
}

/** A START message alone does not renew AP MED consent after STOP. */
export function isSmsPhoneSuppressed(
  suppression: { opted_out_at: string; resumed_at: string | null } | null,
  consentedAt: string,
): boolean {
  if (!suppression) return false
  const optedOutAt = Date.parse(suppression.opted_out_at)
  const resumedAt = suppression.resumed_at ? Date.parse(suppression.resumed_at) : NaN
  const consentTime = Date.parse(consentedAt)
  return !Number.isFinite(optedOutAt) || !Number.isFinite(consentTime) ||
    !Number.isFinite(resumedAt) || resumedAt <= optedOutAt || consentTime <= optedOutAt
}

function key(...parts: string[]) { return parts.join(':') }

function unique(values: readonly string[]) { return [...new Set(values)] }

async function dueSessions(admin: SupabaseClient, cohortIds: string[], now: Date) {
  const windows = smsDueWindows(now)
  const [reminders, checkins] = await Promise.all([
    admin.from('sessions').select('id,cohort_id,match_id,mentor_id,mentee_id,scheduled_at,status')
      .in('cohort_id', cohortIds).eq('status', 'scheduled').not('match_id', 'is', null)
      .gte('scheduled_at', windows.reminderFrom).lte('scheduled_at', windows.reminderThrough)
      .order('scheduled_at').limit(MAX_DUE_SESSIONS_PER_KIND + 1),
    admin.from('sessions').select('id,cohort_id,match_id,mentor_id,mentee_id,scheduled_at,status')
      .in('cohort_id', cohortIds).in('status', ['scheduled', 'completed', 'no_show']).not('match_id', 'is', null)
      .gte('scheduled_at', windows.checkinFrom).lte('scheduled_at', windows.checkinThrough)
      .order('scheduled_at', { ascending: false }).limit(MAX_DUE_SESSIONS_PER_KIND + 1),
  ])
  if (reminders.error || checkins.error) throw new Error('Could not load SMS due sessions')
  if ((reminders.data?.length ?? 0) > MAX_DUE_SESSIONS_PER_KIND ||
      (checkins.data?.length ?? 0) > MAX_DUE_SESSIONS_PER_KIND) {
    throw new Error('SMS due session volume exceeds worker capacity')
  }
  return {
    reminders: (reminders.data ?? []) as Session[],
    checkins: (checkins.data ?? []) as Session[],
  }
}

async function eligibleContacts(admin: SupabaseClient, cohortIds: string[]): Promise<Contact[]> {
  const { data, error } = await admin.from('cohort_sms_contacts')
    .select('id,cohort_id,person_id,phone_e164,consented_at')
    .in('cohort_id', cohortIds).not('phone_e164', 'is', null)
    .not('consented_at', 'is', null).is('opted_out_at', null)
    .limit(MAX_SMS_COHORT_CONTACTS + 1)
  if (error) throw new Error('Could not load SMS contacts')
  if ((data?.length ?? 0) > MAX_SMS_COHORT_CONTACTS) {
    throw new Error('SMS contact volume exceeds worker capacity')
  }
  if (!data?.length) return []

  const contacts = data as Contact[]
  // phone_e164 is the suppression table's primary key, so each 50-phone
  // request returns at most 50 rows and cannot be truncated by the usual cap.
  const phones = unique(contacts.map(contact => contact.phone_e164))
  const suppressions: Array<{ phone_e164: string; opted_out_at: string; resumed_at: string | null }> = []
  for (let offset = 0; offset < phones.length; offset += 50) {
    const { data, error } = await admin.from('sms_phone_suppressions')
      .select('phone_e164,opted_out_at,resumed_at')
      .in('phone_e164', phones.slice(offset, offset + 50))
    if (error || !data) throw new Error('Could not load SMS opt-outs')
    suppressions.push(...data)
  }
  const byPhone = new Map(suppressions.map(row => [row.phone_e164, row]))
  return contacts.filter(contact => !isSmsPhoneSuppressed(
    byPhone.get(contact.phone_e164) ?? null, contact.consented_at,
  ))
}

async function loadContext(admin: SupabaseClient, sessions: Session[]) {
  const mentorIds = unique(sessions.map(session => session.mentor_id))
  const menteeIds = unique(sessions.map(session => session.mentee_id))
  const matchIds = unique(sessions.map(session => session.match_id))
  const sessionIds = unique(sessions.map(session => session.id))
  const [mentors, mentees, matches, checkins, outbox] = await Promise.all([
    completeInQuery(mentorIds, batch => admin.from('mentor')
      .select('id,person_id,membership_status').in('id', batch)),
    completeInQuery(menteeIds, batch => admin.from('mentees')
      .select('id,person_id,membership_status').in('id', batch)),
    completeInQuery(matchIds, batch => admin.from('cohort_matches')
      .select('id,cohort_id,mentor_id,mentee_id,status').in('id', batch)),
    completeInQuery(sessionIds, batch => admin.from('meeting_checkins')
      .select('id,session_id,member_type,member_id,responded_at').in('session_id', batch)),
    completeInQuery(sessionIds, batch => admin.from('sms_outbox')
      .select('id,session_id,contact_id,kind,state').in('session_id', batch)),
  ])
  if (mentors.error || mentees.error || matches.error || checkins.error || outbox.error) {
    throw new Error('Could not load SMS meeting context')
  }
  // Refuse to enqueue when the accumulated context exceeds the worker's
  // capacity. completeInQuery pages every 50-ID batch across hosted caps.
  if ((checkins.data?.length ?? 0) >= 1000 || (outbox.data?.length ?? 0) >= 1000) {
    throw new Error('SMS meeting context exceeds worker capacity')
  }
  return {
    mentors: new Map(((mentors.data ?? []) as Member[]).map(row => [row.id, row])),
    mentees: new Map(((mentees.data ?? []) as Member[]).map(row => [row.id, row])),
    matches: new Map(((matches.data ?? []) as Match[]).map(row => [row.id, row])),
    checkins: new Map(((checkins.data ?? []) as Checkin[])
      .map(row => [key(row.session_id, row.member_type, row.member_id), row])),
    outbox: new Map(((outbox.data ?? []) as Outbox[])
      .map(row => [key(row.kind, row.session_id, row.contact_id), row])),
  }
}

function candidates(
  reminders: Session[], checkins: Session[], contacts: Contact[],
  context: Awaited<ReturnType<typeof loadContext>>,
): Candidate[] {
  const byMember = new Map(contacts.map(contact => [key(contact.cohort_id, contact.person_id), contact]))
  const result: Candidate[] = []
  for (const [kind, sessions] of [['reminder', reminders], ['checkin', checkins]] as const) {
    for (const session of sessions) {
      const match = context.matches.get(session.match_id)
      const mentor = context.mentors.get(session.mentor_id)
      const mentee = context.mentees.get(session.mentee_id)
      if (!match || match.cohort_id !== session.cohort_id ||
          match.mentor_id !== session.mentor_id || match.mentee_id !== session.mentee_id ||
          (kind === 'reminder' ? match.status !== 'active' :
            !['active', 'ended'].includes(match.status)) ||
          !mentor?.person_id || !mentee?.person_id ||
          mentor.person_id === mentee.person_id) continue
      for (const [memberType, member] of [['mentor', mentor], ['mentee', mentee]] as const) {
        if (member.membership_status !== 'active' || !member.person_id) continue
        const contact = byMember.get(key(session.cohort_id, member.person_id))
        if (contact) result.push({ kind, session, contact, memberType, memberId: member.id })
      }
    }
  }
  return result
}

async function ensureCheckin(
  admin: SupabaseClient,
  candidate: Candidate,
  existing: Map<string, Checkin>,
): Promise<Checkin | null> {
  const lookup = key(candidate.session.id, candidate.memberType, candidate.memberId)
  const found = existing.get(lookup)
  if (found) return found.responded_at ? null : found
  const { data, error } = await admin.from('meeting_checkins').insert({
    cohort_id: candidate.session.cohort_id,
    match_id: candidate.session.match_id,
    session_id: candidate.session.id,
    member_type: candidate.memberType,
    member_id: candidate.memberId,
  }).select('id,session_id,member_type,member_id,responded_at').maybeSingle()
  if (!error && data) {
    const checkin = data as Checkin
    existing.set(lookup, checkin)
    return checkin
  }
  if (error?.code !== '23505') return null
  // A web reply or another worker may have won the insert race.
  const raced = await admin.from('meeting_checkins')
    .select('id,session_id,member_type,member_id,responded_at')
    .eq('session_id', candidate.session.id).eq('member_type', candidate.memberType)
    .eq('member_id', candidate.memberId).maybeSingle()
  if (raced.error || !raced.data?.id || raced.data.responded_at) return null
  const checkin = raced.data as Checkin
  existing.set(lookup, checkin)
  return checkin
}

async function insertIntent(
  admin: SupabaseClient,
  candidate: Candidate,
  checkinId: string | null,
  now: Date,
): Promise<{ row: Outbox; created: boolean } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const replyCode = candidate.kind === 'checkin' ? randomBytes(6).toString('hex').toUpperCase() : null
    const { data, error } = await admin.from('sms_outbox').insert({
      cohort_id: candidate.session.cohort_id,
      contact_id: candidate.contact.id,
      session_id: candidate.session.id,
      checkin_id: checkinId,
      kind: candidate.kind,
      phone_e164: candidate.contact.phone_e164,
      body: candidate.kind === 'reminder' ? buildReminderSms() : buildCheckinSms(replyCode!),
      reply_code: replyCode,
      reply_expires_at: replyCode ? new Date(now.getTime() + 7 * 24 * HOUR_MS).toISOString() : null,
    }).select('id,session_id,contact_id,kind,state').maybeSingle()
    if (!error && data) return { row: data as Outbox, created: true }
    if (error?.code !== '23505') return null
    // Either the durable one-per-session constraint won in another worker or
    // the random reply code collided. Only the latter needs a fresh code.
    const raced = await admin.from('sms_outbox').select('id,session_id,contact_id,kind,state')
      .eq('kind', candidate.kind).eq('session_id', candidate.session.id)
      .eq('contact_id', candidate.contact.id).maybeSingle()
    if (raced.error) return null
    if (raced.data) return { row: raced.data as Outbox, created: false }
  }
  return null
}

type SendCounts = Pick<SmsWorkerSummary, 'accepted' | 'rejected' | 'needsReview' | 'skippedChanged' | 'pending' | 'complete'>

/** No retry path exists for sending/needs_review. A crash after claim may have
 * sent the text; an operator must reconcile that state with the provider. */
export async function sendPendingSmsIntents(
  admin: Pick<SupabaseClient, 'rpc'>,
  provider: WorkerSmsProvider,
  intentIds: readonly string[],
  deadline: number = Date.now() + WORKER_TIME_BUDGET_MS,
): Promise<SendCounts> {
  const counts: SendCounts = { accepted: 0, rejected: 0, needsReview: 0,
    skippedChanged: 0, pending: 0, complete: true }
  if (!/^\+[1-9]\d{1,14}$/.test(provider.senderPhoneE164) || !provider.name.trim()) {
    throw new Error('SMS provider has no fixed sender or name')
  }
  const ids = unique(intentIds)
  let attempted = 0
  for (const id of ids.slice(0, MAX_SENDS_PER_RUN)) {
    if (Date.now() >= deadline) { counts.complete = false; break }
    attempted++
    const { data: claim, error: claimError } = await admin.rpc('sms_claim_outbox', {
      p_id: id, p_sender_phone_e164: provider.senderPhoneE164,
    })
    if (claimError) { counts.complete = false; continue }
    if (!claim) { counts.skippedChanged++; continue }
    let outcome: 'accepted' | 'rejected' | 'unknown' | 'skipped' = 'unknown'
    let providerId: string | null = null
    let detail = 'Provider outcome uncertain; manual review required'
    let eligibilityKnown = false
    let eligible = false
    try {
      const checked = await admin.rpc('sms_check_claim_eligible', { p_id: id })
      eligibilityKnown = !checked.error && typeof checked.data === 'boolean'
      eligible = checked.data === true
    } catch {
      // If the final eligibility check is unavailable, never call the provider.
    }
    if (!eligibilityKnown) {
      detail = 'Eligibility could not be confirmed before send; manual review required'
    } else if (!eligible) {
      outcome = 'skipped'
      detail = 'SMS eligibility changed before send'
    } else {
      try {
        const result = await provider.send({ toPhoneE164: claim.phone_e164, body: claim.body })
        if (result.kind === 'accepted' && result.externalMessageId?.trim() &&
            result.fromPhoneE164 === claim.sender_phone_e164) {
          outcome = 'accepted'
          providerId = result.externalMessageId
          detail = 'Provider accepted SMS'
        } else if (result.kind === 'rejected') {
          outcome = 'rejected'
          const providerCode = result.providerCode && /^[A-Za-z0-9_-]{1,30}$/.test(result.providerCode)
            ? result.providerCode : null
          detail = providerCode ? `Provider rejected SMS (${providerCode})` : 'Provider rejected SMS'
        } else if (result.kind === 'unknown' && result.externalMessageId?.trim()) {
          providerId = result.externalMessageId
        }
      } catch {
        // A thrown network error can occur after the provider accepted the SMS.
      }
    }
    const { data: finished, error: finishError } = await admin.rpc('sms_finish_outbox', {
      p_id: id, p_outcome: outcome, p_provider: provider.name,
      p_provider_message_id: providerId, p_detail: detail,
    })
    if (finishError || !finished) { counts.needsReview++; counts.complete = false; continue }
    if (outcome === 'accepted') counts.accepted++
    else if (outcome === 'rejected') counts.rejected++
    else if (outcome === 'skipped') counts.skippedChanged++
    else counts.needsReview++
  }
  counts.pending = Math.max(0, ids.length - attempted)
  if (counts.pending) counts.complete = false
  return counts
}

/** Materialize exact meeting/member intents, then claim each before sending.
 * Database guards recheck consent, STOP, cohort flag, and session state at
 * both insertion and claim, closing races after these read-only selections. */
export async function runSmsWorker(
  admin: SupabaseClient,
  provider: WorkerSmsProvider,
  now = new Date(),
): Promise<SmsWorkerSummary> {
  if (process.env.SMS_FEATURE_ENABLED !== 'true') return emptySummary(false)
  const summary = emptySummary(true)
  const startedAt = Date.now()
  const cutoff = new Date(now.getTime() - STALE_ATTEMPT_MINUTES * 60_000).toISOString()
  const { data: reconciled, error: reconcileError } = await admin.rpc('sms_reconcile_stale_outbox', {
    p_before: cutoff,
  })
  if (reconcileError || typeof reconciled !== 'number') {
    throw new Error('Could not reconcile uncertain SMS attempts')
  }
  summary.reconciledStale = reconciled
  const { data: cohorts, error: cohortError } = await admin.from('cohorts').select('id')
    .eq('sms_enabled', true).eq('status', 'active').limit(101)
  if (cohortError) throw new Error('Could not load SMS cohort flags')
  if ((cohorts?.length ?? 0) > 100) throw new Error('SMS cohort volume exceeds worker capacity')
  if (!cohorts?.length) return summary
  const cohortIds = cohorts.map(cohort => cohort.id as string)
  const [due, contacts] = await Promise.all([
    dueSessions(admin, cohortIds, now),
    eligibleContacts(admin, cohortIds),
  ])
  const sessions = [...due.reminders, ...due.checkins]
  summary.dueSessions = sessions.length
  if (!sessions.length) return summary
  const context = await loadContext(admin, sessions)
  const pendingIds = new Set<string>()
  for (const existing of context.outbox.values()) {
    if (existing.state === 'pending') pendingIds.add(existing.id)
  }
  for (const candidate of candidates(due.reminders, due.checkins, contacts, context)) {
    if (Date.now() - startedAt >= WORKER_TIME_BUDGET_MS) {
      summary.complete = false
      break
    }
    const lookup = key(candidate.kind, candidate.session.id, candidate.contact.id)
    if (context.outbox.has(lookup)) continue
    const checkin = candidate.kind === 'checkin'
      ? await ensureCheckin(admin, candidate, context.checkins)
      : null
    if (candidate.kind === 'checkin' && !checkin) { summary.skippedChanged++; continue }
    const inserted = await insertIntent(admin, candidate, checkin?.id ?? null, now)
    if (!inserted) { summary.skippedChanged++; continue }
    context.outbox.set(lookup, inserted.row)
    if (inserted.row.state === 'pending') pendingIds.add(inserted.row.id)
    if (inserted.created) summary.queued++
  }
  const sent = await sendPendingSmsIntents(admin, provider, [...pendingIds],
    startedAt + WORKER_TIME_BUDGET_MS)
  summary.accepted = sent.accepted
  summary.rejected = sent.rejected
  summary.needsReview = sent.needsReview
  summary.skippedChanged += sent.skippedChanged
  summary.pending = sent.pending
  summary.complete = summary.complete && sent.complete
  return summary
}
