import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NOTIFY_EMAIL_SLOTS,
  releaseEmailBudgetSlots,
  reserveNotifyEmailBudget,
} from '../../src/lib/email-budget.ts'
import { isNotifyDryRunAllowed } from '../../src/lib/notify-request.ts'
import { isUuid } from '../../src/lib/uuid.ts'

function rpcClient(handler) {
  return { rpc: handler }
}

test('strict UUID validation accepts canonical application ids only', () => {
  assert.equal(isUuid('11111111-1111-4111-8111-111111111111'), true)
  assert.equal(isUuid('not-a-uuid'), false)
  assert.equal(isUuid('11111111-1111-4111-8111-111111111111-extra'), false)
  assert.equal(isUuid('11111111-1111-0111-8111-111111111111'), false)
})

test('notify dry-run is unavailable in production but usable locally and in previews', () => {
  assert.equal(isNotifyDryRunAllowed('production', 'production'), false)
  assert.equal(isNotifyDryRunAllowed('production', undefined), false)
  assert.equal(isNotifyDryRunAllowed('development', undefined), true)
  assert.equal(isNotifyDryRunAllowed('production', 'preview'), true)
})

test('reservation requests exactly two slots and accepts a UUID result', async () => {
  const calls = []
  const client = rpcClient(async (name, args) => {
    calls.push({ name, args })
    return { data: '11111111-1111-4111-8111-111111111111', error: null }
  })

  assert.deepEqual(await reserveNotifyEmailBudget(client), {
    status: 'reserved',
    reservationId: '11111111-1111-4111-8111-111111111111',
  })
  assert.deepEqual(calls, [{
    name: 'reserve_email_budget',
    args: { p_slots: NOTIFY_EMAIL_SLOTS },
  }])
})

test('reservation distinguishes quota exhaustion from a failed closed check', async () => {
  const quotaClient = rpcClient(async () => ({ data: null, error: null }))
  assert.deepEqual(await reserveNotifyEmailBudget(quotaClient), {
    status: 'quota_reached',
  })

  const failedClient = rpcClient(async () => ({
    data: null,
    error: { message: 'database unavailable' },
  }))
  assert.deepEqual(await reserveNotifyEmailBudget(failedClient), {
    status: 'error',
    message: 'database unavailable',
  })
})

test('release calls the server-only RPC with the reservation and unused slots', async () => {
  const calls = []
  const client = rpcClient(async (name, args) => {
    calls.push({ name, args })
    return { data: 0, error: null }
  })

  assert.equal(
    await releaseEmailBudgetSlots(
      client,
      '11111111-1111-4111-8111-111111111111',
      2,
    ),
    true,
  )
  assert.deepEqual(calls, [{
    name: 'release_email_budget_slots',
    args: {
      p_reservation_id: '11111111-1111-4111-8111-111111111111',
      p_slots: 2,
    },
  }])
})
