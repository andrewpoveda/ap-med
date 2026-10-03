import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './test-support.mjs'

const routePath = 'src/app/api/webhooks/twilio/sms/route.ts'
const webhookRequest = () => new Request('https://ap-med.test/api/webhooks/twilio/sms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'Body=STOP',
})

function loadRoute(provider, rpc) {
  return loadTs(routePath, {
    '@/lib/sms/twilio': { createTwilioInboundSmsParserFromEnv: () => provider },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ rpc }) },
  })
}

test('the inbound webhook fails closed without provider configuration or valid signature', async () => {
  let databaseCalls = 0
  const rpc = async () => { databaseCalls++; return { data: { resolution: 'stop' }, error: null } }
  const absent = await loadRoute(null, rpc).POST(webhookRequest())
  assert.equal(absent.status, 503)

  const invalid = await loadRoute({ parseInbound: async () => ({
    ok: false, status: 403, reason: 'invalid_signature',
  }) }, rpc).POST(webhookRequest())
  assert.equal(invalid.status, 403)
  assert.equal(databaseCalls, 0)
})

test('a signed inbound event is passed to one atomic RPC, including Twilio STOP', async () => {
  const calls = []
  const provider = { parseInbound: async () => ({
    ok: true,
    providerHandledKeyword: true,
    event: {
      externalMessageId: 'SM123',
      fromPhoneE164: '+12015550123',
      toPhoneE164: '+12015550999',
      body: 'STOP',
      optOutType: 'STOP',
    },
  }) }
  const response = await loadRoute(provider, async (name, args) => {
    calls.push({ name, args })
    return { data: { resolution: 'stop' }, error: null }
  }).POST(webhookRequest())

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/xml/)
  assert.equal(await response.text(), '<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
  assert.deepEqual(calls, [{
    name: 'sms_process_inbound',
    args: {
      p_provider: 'twilio',
      p_message_id: 'SM123',
      p_from_phone_e164: '+12015550123',
      p_to_phone_e164: '+12015550999',
      p_body: 'STOP',
      p_opt_out_type: 'STOP',
    },
  }])
})

test('a persistence failure requests webhook retry without echoing the inbound text', async () => {
  const provider = { parseInbound: async () => ({
    ok: true,
    providerHandledKeyword: false,
    event: {
      externalMessageId: 'SM456',
      fromPhoneE164: '+12015550123',
      toPhoneE164: '+12015550999',
      body: 'ABCDEF123456 private answer',
    },
  }) }
  const response = await loadRoute(provider, async () => ({ data: null, error: { code: '08006' } }))
    .POST(webhookRequest())
  assert.equal(response.status, 503)
  assert.doesNotMatch(await response.text(), /private answer|12015550123/)
})
