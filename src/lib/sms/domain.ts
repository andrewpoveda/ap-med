import { randomBytes } from 'node:crypto'

/** Twelve hexadecimal characters carry 48 bits of randomness. Storage must
 * enforce unique references and regenerate on the rare collision. */
export const SMS_REPLY_REFERENCE_LENGTH = 12
export const MAX_SMS_CHECKIN_ANSWER_CHARS = 2000

const REPLY_REFERENCE_PATTERN = /^[A-F0-9]{12}$/
const E164_PATTERN = /^\+[1-9]\d{1,14}$/
const OPT_OUT_WORDS = new Set([
  'STOP', 'STOPALL', 'UNSUBSCRIBE', 'END', 'QUIT', 'REVOKE', 'OPTOUT', 'CANCEL',
])
const OPT_IN_WORDS = new Set(['START', 'UNSTOP'])
const HELP_WORDS = new Set(['HELP', 'INFO'])

export type SmsIntentKind = 'reminder' | 'checkin'
export type SmsIntentMemberType = 'mentor' | 'mentee'

/** A joined view of sms_outbox, its contact and the shared meeting_checkins
 * record. It carries resolved member/match context and the actual sender,
 * which may be supplied by the delivery provider. */
export type SmsSendIntent = {
  id: string
  kind: SmsIntentKind
  cohortId: string
  matchId: string
  sessionId: string
  memberType: SmsIntentMemberType
  memberId: string
  recipientPhoneE164: string
  /** Actual sending number, captured once a provider chooses it. */
  senderPhoneE164: string | null
  body: string
  replyReference: string | null
  replyExpiresAt: string | null
  replyStatus: 'none' | 'open' | 'answered' | 'closed'
}

/** A provider adapter authenticates its webhook and maps its fields into this
 * shape before calling the policy. A provider message ID must be durable. */
export type SmsInboundEvent = {
  externalMessageId: string
  fromPhoneE164: string
  toPhoneE164: string
  body: string
  /** Verified provider keyword signal, when its opt-out service recognized one. */
  optOutType?: 'STOP' | 'START' | 'HELP'
}

export type SmsInboundDecision =
  | { kind: 'opt_out' | 'opt_in' | 'help' }
  | { kind: 'check_in_reply'; intent: SmsSendIntent; answer: string }
  | { kind: 'unmatched'; reason: 'duplicate_message' | 'invalid_message' | 'missing_reference' | 'no_match' | 'ambiguous_match' }

export function createSmsReplyReference(): string {
  return randomBytes(SMS_REPLY_REFERENCE_LENGTH / 2).toString('hex').toUpperCase()
}

/** Keywords are whole-message commands. START is only a signal; an adapter
 * must not treat it as renewed AP MED consent. */
export function classifySmsKeyword(body: string): 'opt_out' | 'opt_in' | 'help' | null {
  const word = body.trim().toUpperCase()
  if (OPT_OUT_WORDS.has(word)) return 'opt_out'
  if (OPT_IN_WORDS.has(word)) return 'opt_in'
  if (HELP_WORDS.has(word)) return 'help'
  return null
}

/** A reply must begin with the exact reference followed by 1–2,000 characters
 * of text, matching meeting_checkins.response_text. */
export function parseSmsCheckInReply(body: string): { reference: string; answer: string } | null {
  const match = /^([A-F0-9]{12})\s+([\s\S]+)$/i.exec(body.trim())
  if (!match) return null
  const reference = match[1].toUpperCase()
  const answer = match[2].trim()
  if (!REPLY_REFERENCE_PATTERN.test(reference) || !answer ||
      Array.from(answer).length > MAX_SMS_CHECKIN_ANSWER_CHARS) return null
  return { reference, answer }
}

/** Resolve only a unique, live prompt for the exact handset and sending
 * number. The caller must enforce unique inbound IDs and one response per
 * intent in the database as well: this pure check cannot serialize workers. */
export function resolveInboundSms(
  event: SmsInboundEvent,
  intents: readonly SmsSendIntent[],
  processedMessageIds: ReadonlySet<string>,
  now: Date,
): SmsInboundDecision {
  if (typeof event.externalMessageId !== 'string' || !event.externalMessageId ||
      typeof event.fromPhoneE164 !== 'string' || !E164_PATTERN.test(event.fromPhoneE164) ||
      typeof event.toPhoneE164 !== 'string' || !E164_PATTERN.test(event.toPhoneE164) ||
      typeof event.body !== 'string' ||
      !Number.isFinite(now.getTime())) {
    return { kind: 'unmatched', reason: 'invalid_message' }
  }
  if (processedMessageIds.has(event.externalMessageId)) {
    return { kind: 'unmatched', reason: 'duplicate_message' }
  }

  if (event.optOutType) {
    if (event.optOutType === 'STOP') return { kind: 'opt_out' }
    if (event.optOutType === 'START') return { kind: 'opt_in' }
    if (event.optOutType === 'HELP') return { kind: 'help' }
    return { kind: 'unmatched', reason: 'invalid_message' }
  }
  const keyword = classifySmsKeyword(event.body)
  if (keyword) return { kind: keyword }

  const reply = parseSmsCheckInReply(event.body)
  if (!reply) return { kind: 'unmatched', reason: 'missing_reference' }

  const matches = intents.filter(intent =>
    intent.kind === 'checkin' &&
    intent.replyStatus === 'open' &&
    intent.replyReference === reply.reference &&
    intent.recipientPhoneE164 === event.fromPhoneE164 &&
    intent.senderPhoneE164 === event.toPhoneE164 &&
    intent.replyExpiresAt !== null &&
    Number.isFinite(Date.parse(intent.replyExpiresAt)) &&
    Date.parse(intent.replyExpiresAt) > now.getTime(),
  )

  if (matches.length === 0) return { kind: 'unmatched', reason: 'no_match' }
  if (matches.length !== 1) return { kind: 'unmatched', reason: 'ambiguous_match' }
  return { kind: 'check_in_reply', intent: matches[0], answer: reply.answer }
}
