import twilio from 'twilio'
import type { SmsInboundParser, SmsInboundParseResult, SmsProvider, SmsSendRequest, SmsSendResult } from './provider'

const E164_PATTERN = /^\+[1-9]\d{1,14}$/
const ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/
const API_KEY_SID_PATTERN = /^SK[0-9a-fA-F]{32}$/
const SERVICE_SID_PATTERN = /^MG[0-9a-fA-F]{32}$/
const MESSAGE_SID_PATTERN = /^(SM|MM)[0-9a-fA-F]{32}$/
const ACCEPTED_MESSAGE_STATUSES = new Set(['accepted', 'queued', 'sending', 'sent', 'delivered'])
const MAX_WEBHOOK_BODY_BYTES = 16_384
const MAX_OUTBOUND_BODY_LENGTH = 1600
const PROVIDER_REQUEST_TIMEOUT_MS = 8_000

export type TwilioInboundSmsConfig = {
  accountSid: string
  authToken: string
  messagingServiceSid: string
  senderPhoneE164: string
  inboundWebhookUrl: string
}

export type TwilioSmsConfig = TwilioInboundSmsConfig & {
  apiKeySid: string
  apiKeySecret: string
}

/** Narrow enough to inject in tests without a Twilio account. */
export type TwilioMessageClient = {
  messages: {
    create(input: { to: string; from: string; messagingServiceSid: string; body: string }): Promise<{
      sid: string
      from: string | null
      status: string
    }>
  }
}

const INBOUND_ENV_FIELDS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_MESSAGING_SERVICE_SID',
  'TWILIO_FROM_PHONE_E164',
  'TWILIO_INBOUND_WEBHOOK_URL',
] as const
const OUTBOUND_ENV_FIELDS = ['TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET'] as const

function isHttpsWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.hash &&
      !url.username && !url.password
  } catch {
    return false
  }
}

/** STOP and other inbound messages need only webhook verification settings. */
export function getTwilioInboundReadiness(env: NodeJS.ProcessEnv = process.env): {
  ready: boolean
  missing: string[]
} {
  const missing = INBOUND_ENV_FIELDS.filter(key => !env[key]?.trim()) as string[]
  if (env.TWILIO_ACCOUNT_SID && !ACCOUNT_SID_PATTERN.test(env.TWILIO_ACCOUNT_SID)) missing.push('TWILIO_ACCOUNT_SID')
  if (env.TWILIO_MESSAGING_SERVICE_SID && !SERVICE_SID_PATTERN.test(env.TWILIO_MESSAGING_SERVICE_SID)) missing.push('TWILIO_MESSAGING_SERVICE_SID')
  if (env.TWILIO_FROM_PHONE_E164 && !E164_PATTERN.test(env.TWILIO_FROM_PHONE_E164)) missing.push('TWILIO_FROM_PHONE_E164')
  if (env.TWILIO_INBOUND_WEBHOOK_URL && !isHttpsWebhookUrl(env.TWILIO_INBOUND_WEBHOOK_URL)) missing.push('TWILIO_INBOUND_WEBHOOK_URL')
  const uniqueMissing = [...new Set(missing)]
  return { ready: uniqueMissing.length === 0, missing: uniqueMissing }
}

/** Checks outbound configuration without constructing a client or contacting Twilio. */
export function getTwilioSmsReadiness(env: NodeJS.ProcessEnv = process.env): {
  ready: boolean
  missing: string[]
} {
  const missing = [...getTwilioInboundReadiness(env).missing,
    ...OUTBOUND_ENV_FIELDS.filter(key => !env[key]?.trim())]
  if (env.TWILIO_API_KEY_SID && !API_KEY_SID_PATTERN.test(env.TWILIO_API_KEY_SID)) missing.push('TWILIO_API_KEY_SID')
  const uniqueMissing = [...new Set(missing)]
  return { ready: uniqueMissing.length === 0, missing: uniqueMissing }
}

export function createTwilioInboundSmsParserFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TwilioInboundSmsParser | null {
  if (!getTwilioInboundReadiness(env).ready) return null
  return new TwilioInboundSmsParser({
    accountSid: env.TWILIO_ACCOUNT_SID!,
    authToken: env.TWILIO_AUTH_TOKEN!,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID!,
    senderPhoneE164: env.TWILIO_FROM_PHONE_E164!,
    inboundWebhookUrl: env.TWILIO_INBOUND_WEBHOOK_URL!,
  })
}

/** Lazy factory: importing this module has no need for configured credentials. */
export function createTwilioSmsProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  client?: TwilioMessageClient,
): TwilioSmsProvider | null {
  if (!getTwilioSmsReadiness(env).ready) return null
  const config: TwilioSmsConfig = {
    accountSid: env.TWILIO_ACCOUNT_SID!,
    apiKeySid: env.TWILIO_API_KEY_SID!,
    apiKeySecret: env.TWILIO_API_KEY_SECRET!,
    authToken: env.TWILIO_AUTH_TOKEN!,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID!,
    senderPhoneE164: env.TWILIO_FROM_PHONE_E164!,
    inboundWebhookUrl: env.TWILIO_INBOUND_WEBHOOK_URL!,
  }
  const messageClient = client ?? twilio(config.apiKeySid, config.apiKeySecret, {
    accountSid: config.accountSid,
    timeout: PROVIDER_REQUEST_TIMEOUT_MS,
    autoRetry: false,
  })
  return new TwilioSmsProvider(config, messageClient)
}

function providerCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = error.code
  return (typeof code === 'number' || typeof code === 'string') &&
    String(code).length <= 20 ? String(code) : null
}

function definitiveRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false
  const status = error.status
  return typeof status === 'number' && status >= 400 && status < 500 &&
    status !== 408 && status !== 409 && status !== 429
}

export class TwilioInboundSmsParser implements SmsInboundParser {
  private readonly config: TwilioInboundSmsConfig

  constructor(config: TwilioInboundSmsConfig) {
    this.config = config
  }

  parseInbound(request: Request): Promise<SmsInboundParseResult> {
    return parseTwilioInbound(this.config, request)
  }
}

async function parseTwilioInbound(
  config: TwilioInboundSmsConfig,
  request: Request,
): Promise<SmsInboundParseResult> {
  if (request.method !== 'POST') {
    return { ok: false, status: 400, reason: 'invalid_method' }
  }
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
      'application/x-www-form-urlencoded') {
    return { ok: false, status: 400, reason: 'invalid_content_type' }
  }
  const signature = request.headers.get('x-twilio-signature')
  if (!signature) return { ok: false, status: 401, reason: 'missing_signature' }
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, reason: 'body_too_large' }
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return { ok: false, status: 400, reason: 'invalid_body' }
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, reason: 'body_too_large' }
  }
  const form = new URLSearchParams(rawBody)
  const params: Record<string, string> = Object.create(null)
  for (const [key, value] of form) {
    if (Object.hasOwn(params, key)) {
      return { ok: false, status: 400, reason: 'duplicate_parameter' }
    }
    params[key] = value
  }
  let validSignature = false
  try {
    validSignature = twilio.validateRequest(
      config.authToken,
      signature,
      config.inboundWebhookUrl,
      params,
    )
  } catch {
    return { ok: false, status: 401, reason: 'invalid_signature' }
  }
  if (!validSignature) return { ok: false, status: 401, reason: 'invalid_signature' }

  // The service must use its own inbound POST webhook, rather than the
  // default "defer to sender" setting, so its SID is present and guarded.
  if (params.AccountSid !== config.accountSid ||
      params.MessagingServiceSid !== config.messagingServiceSid ||
      params.To !== config.senderPhoneE164) {
    return { ok: false, status: 403, reason: 'wrong_destination' }
  }
  if (!MESSAGE_SID_PATTERN.test(params.MessageSid ?? '') ||
      !E164_PATTERN.test(params.From ?? '') ||
      typeof params.Body !== 'string') {
    return { ok: false, status: 400, reason: 'invalid_message' }
  }
  const optOutType = params.OptOutType
  if (optOutType !== undefined && !['STOP', 'START', 'HELP'].includes(optOutType)) {
    return { ok: false, status: 400, reason: 'invalid_opt_out_type' }
  }
  return {
    ok: true,
    event: {
      externalMessageId: params.MessageSid,
      fromPhoneE164: params.From,
      toPhoneE164: params.To,
      body: params.Body,
      ...(optOutType ? { optOutType: optOutType as 'STOP' | 'START' | 'HELP' } : {}),
    },
    providerHandledKeyword: Boolean(optOutType),
  }
}

/** Twilio-specific transport and webhook verification stay behind SmsProvider. */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio'
  readonly senderPhoneE164: string
  private readonly config: TwilioSmsConfig
  private readonly client: TwilioMessageClient

  constructor(
    config: TwilioSmsConfig,
    client: TwilioMessageClient,
  ) {
    this.config = config
    this.client = client
    this.senderPhoneE164 = config.senderPhoneE164
  }

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    if (!E164_PATTERN.test(request.toPhoneE164) ||
        !request.body.trim() || request.body.length > MAX_OUTBOUND_BODY_LENGTH) {
      return { kind: 'rejected', providerCode: null }
    }
    try {
      // Both values pin the one two-way sender while retaining Messaging
      // Service opt-out and campaign features. The number must be in its pool.
      const message = await this.client.messages.create({
        to: request.toPhoneE164,
        from: this.senderPhoneE164,
        messagingServiceSid: this.config.messagingServiceSid,
        body: request.body,
      })
      if (!MESSAGE_SID_PATTERN.test(message.sid)) return { kind: 'unknown' }
      if (message.from && message.from !== this.senderPhoneE164) {
        return { kind: 'unknown', externalMessageId: message.sid }
      }
      if (!ACCEPTED_MESSAGE_STATUSES.has(message.status)) {
        return { kind: 'unknown', externalMessageId: message.sid }
      }
      return {
        kind: 'accepted',
        externalMessageId: message.sid,
        fromPhoneE164: this.senderPhoneE164,
        providerStatus: message.status,
      }
    } catch (error) {
      if (definitiveRejection(error)) {
        return { kind: 'rejected', providerCode: providerCode(error) }
      }
      return { kind: 'unknown' }
    }
  }

  parseInbound(request: Request): Promise<SmsInboundParseResult> {
    return parseTwilioInbound(this.config, request)
  }
}
