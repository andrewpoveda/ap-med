import type { SupabaseClient } from '@supabase/supabase-js'
import { cap, LIMITS } from '@/lib/validate'
import type { CohortMemberRef, CohortMemberType } from '@/lib/cohort-dashboard'

/**
 * Native mid-year / end-of-year surveys (ascenso-prm.md §5.12 / §7.15) — the
 * final Ascenso feature.
 *
 * Members submit one response each from their authed /dashboard: identity comes
 * from the session (no email matching, no Turnstile — every cohort member has an
 * account), and the DB's unique(survey_id, member_id) enforces one response per
 * member. Admins create a survey per wave and open/close it; who has responded
 * is DERIVED from survey_responses (no manual marking — §5.12). Three earlier
 * items already read these tables and light up automatically: the digest cron
 * (§5.9) nags open-survey non-responders, analytics (§5.13) counts a response as
 * activity, and the milestone grid (§5.5–5.7) excludes survey keys by
 * construction, so item 15 only adds survey CRUD + submission.
 *
 * SECURITY (P0, §6.3): the member read model and the submission route both scope
 * every query to the caller's OWN cohort + member id, resolved server-side. A
 * member must never read or write another member's response.
 */

export const SURVEY_WAVES = ['mid_year', 'end_year'] as const
export type SurveyWave = (typeof SURVEY_WAVES)[number]
export function isSurveyWave(value: unknown): value is SurveyWave {
  return typeof value === 'string' && (SURVEY_WAVES as readonly string[]).includes(value)
}
export const WAVE_LABELS: Record<SurveyWave, string> = {
  mid_year: 'Mid-year',
  end_year: 'End-of-year',
}
export function waveLabel(wave: string): string {
  return isSurveyWave(wave) ? WAVE_LABELS[wave] : wave
}

export const SURVEY_STATUSES = ['draft', 'open', 'closed'] as const
export type SurveyStatus = (typeof SURVEY_STATUSES)[number]
export function isSurveyStatus(value: unknown): value is SurveyStatus {
  return typeof value === 'string' && (SURVEY_STATUSES as readonly string[]).includes(value)
}

export const QUESTION_TYPES = ['text', 'scale', 'select'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]
export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value)
}

// A scale question is a fixed 1–5 rating (admins phrase the anchors in the
// prompt). Caps below keep a single create request from stuffing the row.
export const SCALE_MIN = 1
export const SCALE_MAX = 5
export const MAX_QUESTIONS = 30
export const MAX_OPTIONS = 12

/** A question as stored in surveys.questions (ids assigned server-side). */
export type SurveyQuestion = {
  id: string
  prompt: string
  type: QuestionType
  options?: string[]
}

/**
 * Validate the admin-supplied questions for a new survey. The client sends only
 * `{ prompt, type, options? }` per question; ids are assigned here (`q1`..`qN`,
 * stable for the life of the survey because questions are immutable once
 * created) so a member's answer keys can never collide or drift. Every string is
 * capped and trimmed — names/prompts are free text, same escape-at-the-boundary
 * discipline as the other write routes.
 */
export function validateQuestions(
  raw: unknown,
): { ok: true; value: SurveyQuestion[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'Questions must be a list' }
  if (raw.length === 0) return { ok: false, error: 'Add at least one question' }
  if (raw.length > MAX_QUESTIONS) {
    return { ok: false, error: `A survey can have at most ${MAX_QUESTIONS} questions` }
  }

  const value: SurveyQuestion[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Question ${i + 1} is malformed` }
    }
    const record = item as Record<string, unknown>
    const prompt = cap(record.prompt, LIMITS.name).trim()
    if (!prompt) return { ok: false, error: `Question ${i + 1} needs a prompt` }
    if (!isQuestionType(record.type)) {
      return { ok: false, error: `Question ${i + 1} has an invalid type` }
    }

    const question: SurveyQuestion = { id: `q${i + 1}`, prompt, type: record.type }

    if (record.type === 'select') {
      if (!Array.isArray(record.options)) {
        return { ok: false, error: `Question ${i + 1} needs answer options` }
      }
      const options: string[] = []
      const seen = new Set<string>()
      for (const rawOption of record.options) {
        const option = cap(rawOption, LIMITS.name).trim()
        if (!option) continue
        const key = option.toLowerCase()
        if (seen.has(key)) {
          return { ok: false, error: `Question ${i + 1} has duplicate options` }
        }
        seen.add(key)
        options.push(option)
      }
      if (options.length < 2) {
        return { ok: false, error: `Question ${i + 1} needs at least two options` }
      }
      if (options.length > MAX_OPTIONS) {
        return { ok: false, error: `Question ${i + 1} has too many options` }
      }
      question.options = options
    }

    value.push(question)
  }
  return { ok: true, value }
}

/**
 * Coerce a stored surveys.questions jsonb value back into typed questions.
 * Server-written (via validateQuestions) so this is defensive, not a trust
 * boundary — anything malformed is dropped rather than thrown.
 */
export function coerceQuestions(raw: unknown): SurveyQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: SurveyQuestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : ''
    const prompt = typeof record.prompt === 'string' ? record.prompt : ''
    if (!id || !prompt || !isQuestionType(record.type)) continue
    const question: SurveyQuestion = { id, prompt, type: record.type }
    if (record.type === 'select' && Array.isArray(record.options)) {
      question.options = record.options.filter((o): o is string => typeof o === 'string')
    }
    out.push(question)
  }
  return out
}

/**
 * Validate a member's submitted answers against a survey's questions. Scale and
 * select answers are required and must be valid (an integer in range / one of
 * the options); text answers are optional and capped. Returns a normalized
 * answers object keyed by question id, ready to store as jsonb. Returning a 400
 * error message the member can act on ("Please answer: …") beats a silent drop.
 */
export function validateAnswers(
  questions: SurveyQuestion[],
  raw: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Answers are malformed' }
  }
  const src = raw as Record<string, unknown>
  const answers: Record<string, unknown> = {}

  for (const question of questions) {
    const answer = src[question.id]
    if (question.type === 'text') {
      answers[question.id] = answer == null ? '' : cap(answer, LIMITS.text)
    } else if (question.type === 'scale') {
      const n =
        typeof answer === 'number'
          ? answer
          : typeof answer === 'string' && answer.trim() !== ''
            ? Number(answer)
            : Number.NaN
      if (!Number.isInteger(n) || n < SCALE_MIN || n > SCALE_MAX) {
        return { ok: false, error: `Please answer: "${question.prompt}"` }
      }
      answers[question.id] = n
    } else {
      const s = typeof answer === 'string' ? answer : ''
      if (!question.options || !question.options.includes(s)) {
        return { ok: false, error: `Please answer: "${question.prompt}"` }
      }
      answers[question.id] = s
    }
  }
  return { ok: true, value: answers }
}

// ---- Read models --------------------------------------------------------

/** An open survey as the member sees it on their dashboard. */
export type MemberSurveyView = {
  id: string
  wave: string
  title: string
  questions: SurveyQuestion[]
  responded: boolean
}

/**
 * Open surveys in the member's OWN cohort, each flagged with whether this member
 * has already responded (§6.3 — scoped to the caller's cohort + member id, never
 * anything client-supplied). Draft/closed surveys never reach a member.
 */
export async function getMemberSurveys(
  admin: SupabaseClient,
  ref: CohortMemberRef,
): Promise<MemberSurveyView[]> {
  const { data: surveys, error } = await admin
    .from('surveys')
    .select('id, wave, title, questions')
    .eq('cohort_id', ref.cohortId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('getMemberSurveys failed:', error.message)
    return []
  }
  if (!surveys || surveys.length === 0) return []

  const surveyIds = surveys.map((s) => s.id as string)
  const { data: responses, error: respError } = await admin
    .from('survey_responses')
    .select('survey_id')
    .eq('cohort_id', ref.cohortId)
    .eq('member_type', ref.type)
    .eq('member_id', ref.memberId)
    .in('survey_id', surveyIds)
  if (respError) {
    console.error('getMemberSurveys response lookup failed:', respError.message)
  }
  const responded = new Set((responses ?? []).map((r) => r.survey_id as string))

  return surveys.map((s) => ({
    id: s.id as string,
    wave: s.wave as string,
    title: s.title as string,
    questions: coerceQuestions(s.questions),
    responded: responded.has(s.id as string),
  }))
}

/** One survey row for the admin index, with derived counts. */
export type AdminSurveyRow = {
  id: string
  wave: string
  title: string
  status: string
  questionCount: number
  responseCount: number
  createdAt: string
  opensAt: string | null
  closesAt: string | null
}

/** Every survey for a cohort (both waves), with response counts. */
export async function getCohortSurveys(
  admin: SupabaseClient,
  cohortId: string,
): Promise<AdminSurveyRow[]> {
  const { data: surveys, error } = await admin
    .from('surveys')
    .select('id, wave, title, questions, status, created_at, opens_at, closes_at')
    .eq('cohort_id', cohortId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('getCohortSurveys failed:', error.message)
    return []
  }
  if (!surveys || surveys.length === 0) return []

  const surveyIds = surveys.map((s) => s.id as string)
  const { data: responses, error: respError } = await admin
    .from('survey_responses')
    .select('survey_id')
    .eq('cohort_id', cohortId)
    .in('survey_id', surveyIds)
  if (respError) console.error('getCohortSurveys response count failed:', respError.message)
  const counts = new Map<string, number>()
  for (const r of responses ?? []) {
    const id = r.survey_id as string
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  return surveys.map((s) => ({
    id: s.id as string,
    wave: s.wave as string,
    title: s.title as string,
    status: s.status as string,
    questionCount: coerceQuestions(s.questions).length,
    responseCount: counts.get(s.id as string) ?? 0,
    createdAt: s.created_at as string,
    opensAt: (s.opens_at as string) ?? null,
    closesAt: (s.closes_at as string) ?? null,
  }))
}

export type ResponderView = {
  memberType: CohortMemberType
  memberId: string
  name: string
  createdAt: string
  answers: Record<string, unknown>
}

export type NonResponderView = {
  memberType: CohortMemberType
  memberId: string
  name: string
}

export type SurveyResponsesResult = {
  survey: {
    id: string
    wave: string
    title: string
    status: string
    questions: SurveyQuestion[]
  }
  responders: ResponderView[]
  nonResponders: NonResponderView[]
  memberCount: number
}

/**
 * A survey plus its responses, resolved for the admin responses view. Splits the
 * cohort roster into who has responded (with their answers) and who hasn't — the
 * derived completion picture (§5.12), never a manually-marked one. Returns null
 * when the survey isn't in this cohort (the page answers 404, non-probeable).
 */
export async function getSurveyResponses(
  admin: SupabaseClient,
  cohortId: string,
  surveyId: string,
): Promise<SurveyResponsesResult | null> {
  // Malformed uuid → lookup error → treated as a miss (null → 404 upstream).
  const { data: survey, error } = await admin
    .from('surveys')
    .select('id, cohort_id, wave, title, status, questions')
    .eq('id', surveyId)
    .maybeSingle()
  if (error || !survey || survey.cohort_id !== cohortId) return null

  const [mentorsRes, menteesRes, responsesRes] = await Promise.all([
    // Cohort members are scoped by cohort_id ONLY — no `approved` filter (cohort
    // mentors keep approved=false as defense in depth).
    admin.from('mentor').select('id, first_name, last_name').eq('cohort_id', cohortId),
    admin.from('mentees').select('id, full_name').eq('cohort_id', cohortId),
    admin
      .from('survey_responses')
      .select('member_type, member_id, answers, created_at')
      .eq('cohort_id', cohortId)
      .eq('survey_id', surveyId),
  ])
  if (mentorsRes.error) console.error('Survey mentor roster fetch failed:', mentorsRes.error.message)
  if (menteesRes.error) console.error('Survey mentee roster fetch failed:', menteesRes.error.message)
  if (responsesRes.error) console.error('Survey responses fetch failed:', responsesRes.error.message)

  const names = new Map<string, string>()
  for (const m of mentorsRes.data ?? []) {
    names.set(
      `mentor:${m.id}`,
      `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Unnamed mentor',
    )
  }
  for (const m of menteesRes.data ?? []) {
    names.set(`mentee:${m.id}`, (m.full_name as string) || 'Unnamed mentee')
  }

  const responders: ResponderView[] = []
  const respondedKeys = new Set<string>()
  for (const r of responsesRes.data ?? []) {
    const memberType = r.member_type === 'mentor' ? 'mentor' : 'mentee'
    const key = `${memberType}:${r.member_id}`
    respondedKeys.add(key)
    responders.push({
      memberType,
      memberId: r.member_id as string,
      name: names.get(key) ?? 'Former member',
      createdAt: r.created_at as string,
      answers:
        r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers)
          ? (r.answers as Record<string, unknown>)
          : {},
    })
  }
  responders.sort((a, b) => a.name.localeCompare(b.name))

  const nonResponders: NonResponderView[] = []
  for (const [key, name] of names) {
    if (respondedKeys.has(key)) continue
    const [memberType, memberId] = key.split(':') as [CohortMemberType, string]
    nonResponders.push({ memberType, memberId, name })
  }
  nonResponders.sort(
    (a, b) => a.memberType.localeCompare(b.memberType) || a.name.localeCompare(b.name),
  )

  return {
    survey: {
      id: survey.id as string,
      wave: survey.wave as string,
      title: survey.title as string,
      status: survey.status as string,
      questions: coerceQuestions(survey.questions),
    },
    responders,
    nonResponders,
    memberCount: names.size,
  }
}
