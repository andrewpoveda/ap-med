import type { SmsInboundEvent } from './domain'

export type SmsSendRequest = {
  toPhoneE164: string
  body: string
}

/** Accepted means the provider created a message, not handset delivery. An
 * unknown outcome must be reconciled before retrying to avoid duplicate SMS. */
export type SmsSendResult =
  | { kind: 'accepted'; externalMessageId: string; fromPhoneE164: string; providerStatus: string }
  | { kind: 'rejected'; providerCode: string | null }
  | { kind: 'unknown'; externalMessageId?: string }

export type SmsInboundParseResult =
  | { ok: true; event: SmsInboundEvent; providerHandledKeyword: boolean }
  | { ok: false; status: 400 | 401 | 403 | 413; reason: string }

export interface SmsInboundParser {
  parseInbound(request: Request): Promise<SmsInboundParseResult>
}

export interface SmsProvider extends SmsInboundParser {
  readonly name: string
  readonly senderPhoneE164: string
  send(request: SmsSendRequest): Promise<SmsSendResult>
}
