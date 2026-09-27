import assert from 'node:assert/strict'
import test from 'node:test'
import twilio from 'twilio'

import { resolveInboundSms } from '../../src/lib/sms/domain.ts'
import {
  createTwilioInboundSmsParserFromEnv,
  createTwilioSmsProviderFromEnv,
  getTwilioInboundReadiness,
  getTwilioSmsReadiness,
} from '../../src/lib/sms/twilio.ts'

const webhookUrl = 'https://ap-med.org/api/webhooks/twilio/sms'
const env = {
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
  TWILIO_API_KEY_SID: `SK${'b'.repeat(32)}`,
  TWILIO_API_KEY_SECRET: 'test-api-secret',
  TWILIO_AUTH_TOKEN: 'test-auth-token',
  TWILIO_MESSAGING_SERVICE_SID: `MG${'c'.repeat(32)}`,
  TWILIO_FROM_PHONE_E164: '+12025550999',
  TWILIO_INBOUND_WEBHOOK_URL: webhookUrl,
}
const messageSid = `SM${'d'.repeat(32)}`

function makeProvider(create) {
  const client = { messages: { create } }
  const provider = createTwilioSmsProviderFromEnv(env, client)
  assert.ok(provider)
  return provider
}

const inboundParams = {
  AccountSid: env.TWILIO_ACCOUNT_SID,
  MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
  MessageSid: messageSid,
  From: '+12025550101',
  To: env.TWILIO_FROM_PHONE_E164,
  Body: 'A1B2C3D4E5F6 It went well.',
}

function signedRequest(params = inboundParams, options = {}) {
  const body = new URLSearchParams(params).toString()
  const signature = twilio.getExpectedTwilioSignature(
    env.TWILIO_AUTH_TOKEN, webhookUrl, params,
  )
  return new Request(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
      ...options.headers,
    },
    body: options.body ?? body,
  })
}

test('Twilio configuration is checked lazily and requires the exact HTTPS callback URL', () => {
  assert.deepEqual(getTwilioSmsReadiness(env), { ready: true, missing: [] })
  assert.equal(createTwilioSmsProviderFromEnv(env)?.senderPhoneE164, env.TWILIO_FROM_PHONE_E164)
  assert.equal(createTwilioSmsProviderFromEnv({}), null)
  assert.deepEqual(getTwilioSmsReadiness({ ...env, TWILIO_INBOUND_WEBHOOK_URL: 'http://ap-med.org/sms' }), {
    ready: false, missing: ['TWILIO_INBOUND_WEBHOOK_URL'],
  })
})

test('inbound STOP remains available without outbound API keys or an enabled send switch', async () => {
  const inboundOnlyEnv = { ...env, TWILIO_API_KEY_SID: '', TWILIO_API_KEY_SECRET: '',
    SMS_FEATURE_ENABLED: 'false' }
  assert.deepEqual(getTwilioInboundReadiness(inboundOnlyEnv), { ready: true, missing: [] })
  assert.equal(getTwilioSmsReadiness(inboundOnlyEnv).ready, false)
  assert.equal(createTwilioSmsProviderFromEnv(inboundOnlyEnv), null)
  const parser = createTwilioInboundSmsParserFromEnv(inboundOnlyEnv)
  assert.ok(parser)
  const parsed = await parser.parseInbound(signedRequest({
    ...inboundParams, Body: 'STOP', OptOutType: 'STOP',
  }))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.event.optOutType, 'STOP')
  assert.equal(parsed.providerHandledKeyword, true)
})

test('outbound send pins both MessagingServiceSid and fixed From', async () => {
  const calls = []
  const provider = makeProvider(async input => {
    calls.push(input)
    return { sid: messageSid, from: env.TWILIO_FROM_PHONE_E164, status: 'queued' }
  })
  assert.equal(provider.name, 'twilio')
  assert.equal(provider.senderPhoneE164, env.TWILIO_FROM_PHONE_E164)
  assert.deepEqual(await provider.send({ toPhoneE164: '+12025550101', body: 'AP MED reminder' }), {
    kind: 'accepted', externalMessageId: messageSid,
    fromPhoneE164: env.TWILIO_FROM_PHONE_E164, providerStatus: 'queued',
  })
  assert.deepEqual(calls, [{
    to: '+12025550101', from: env.TWILIO_FROM_PHONE_E164,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID, body: 'AP MED reminder',
  }])
})

test('outbound validation and definite Twilio rejections send no duplicate attempt', async () => {
  let calls = 0
  const provider = makeProvider(async () => {
    calls += 1
    throw Object.assign(new Error('do not log me'), { status: 400, code: 21610 })
  })
  assert.deepEqual(await provider.send({ toPhoneE164: 'not-a-number', body: 'hello' }), {
    kind: 'rejected', providerCode: null,
  })
  assert.equal(calls, 0)
  assert.deepEqual(await provider.send({ toPhoneE164: '+12025550101', body: 'hello' }), {
    kind: 'rejected', providerCode: '21610',
  })
  assert.equal(calls, 1)
})

test('timeouts and provider/server uncertainty are never classified as accepted', async () => {
  for (const error of [new Error('timeout'), Object.assign(new Error('server error'), { status: 503 }),
    Object.assign(new Error('rate limit'), { status: 429 })]) {
    const provider = makeProvider(async () => { throw error })
    assert.deepEqual(await provider.send({ toPhoneE164: '+12025550101', body: 'hello' }), {
      kind: 'unknown',
    })
  }
  const wrongSender = makeProvider(async () => ({
    sid: messageSid, from: '+12025550123', status: 'queued',
  }))
  assert.deepEqual(await wrongSender.send({ toPhoneE164: '+12025550101', body: 'hello' }), {
    kind: 'unknown', externalMessageId: messageSid,
  })
  const immediateFailure = makeProvider(async () => ({
    sid: messageSid, from: env.TWILIO_FROM_PHONE_E164, status: 'failed',
  }))
  assert.deepEqual(await immediateFailure.send({ toPhoneE164: '+12025550101', body: 'hello' }), {
    kind: 'unknown', externalMessageId: messageSid,
  })
})

test('signed inbound SMS maps all fields and verified Advanced Opt-Out keyword', async () => {
  const provider = makeProvider(async () => { throw Error('unused') })
  const params = { ...inboundParams, Body: 'custom opt-out keyword', OptOutType: 'STOP' }
  const parsed = await provider.parseInbound(signedRequest(params))
  assert.deepEqual(parsed, {
    ok: true,
    event: {
      externalMessageId: messageSid, fromPhoneE164: '+12025550101',
      toPhoneE164: env.TWILIO_FROM_PHONE_E164, body: 'custom opt-out keyword',
      optOutType: 'STOP',
    },
    providerHandledKeyword: true,
  })
  assert.deepEqual(resolveInboundSms(parsed.event, [], new Set(), new Date()), { kind: 'opt_out' })
  const ordinary = await provider.parseInbound(signedRequest())
  assert.equal(ordinary.ok, true)
  assert.equal(ordinary.providerHandledKeyword, false)
  assert.equal(ordinary.event.optOutType, undefined)
  const evolving = await provider.parseInbound(signedRequest({ ...inboundParams, FutureField: 'kept in signature' }))
  assert.equal(evolving.ok, true)
})

test('signature, account, service and fixed destination are mandatory', async () => {
  const provider = makeProvider(async () => { throw Error('unused') })
  const tampered = signedRequest(inboundParams, { body: 'Body=forged' })
  assert.deepEqual(await provider.parseInbound(tampered), {
    ok: false, status: 401, reason: 'invalid_signature',
  })
  const wrongUrlSignature = twilio.getExpectedTwilioSignature(
    env.TWILIO_AUTH_TOKEN, 'https://elsewhere.example/api/webhooks/twilio/sms', inboundParams,
  )
  const wrongUrlRequest = signedRequest(inboundParams, {
    headers: { 'x-twilio-signature': wrongUrlSignature },
  })
  assert.deepEqual(await provider.parseInbound(wrongUrlRequest), {
    ok: false, status: 401, reason: 'invalid_signature',
  })
  for (const [changed, reason] of [
    [{ AccountSid: `AC${'e'.repeat(32)}` }, 'wrong_destination'],
    [{ MessagingServiceSid: `MG${'e'.repeat(32)}` }, 'wrong_destination'],
    [{ To: '+12025550123' }, 'wrong_destination'],
  ]) {
    const parsed = await provider.parseInbound(signedRequest({ ...inboundParams, ...changed }))
    assert.deepEqual(parsed, { ok: false, status: 403, reason })
  }
})

test('malformed form, unknown OptOutType and excessive body are rejected', async () => {
  const provider = makeProvider(async () => { throw Error('unused') })
  assert.deepEqual(await provider.parseInbound(new Request(webhookUrl)), {
    ok: false, status: 400, reason: 'invalid_method',
  })
  const unknownKeyword = await provider.parseInbound(signedRequest({
    ...inboundParams, OptOutType: 'OTHER',
  }))
  assert.deepEqual(unknownKeyword, {
    ok: false, status: 400, reason: 'invalid_opt_out_type',
  })
  const duplicate = await provider.parseInbound(signedRequest(inboundParams, {
    body: `${new URLSearchParams(inboundParams)}&Body=second`,
  }))
  assert.deepEqual(duplicate, { ok: false, status: 400, reason: 'duplicate_parameter' })
  const tooLarge = await provider.parseInbound(signedRequest(inboundParams, {
    headers: { 'content-length': '20000' },
  }))
  assert.deepEqual(tooLarge, { ok: false, status: 413, reason: 'body_too_large' })
})
