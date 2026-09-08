import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs, database } from './test-support.mjs'
const { completeQuery, completeInQuery } = loadTs('src/lib/complete-query.ts')

test('large filters are deduplicated and partitioned without losing scoped records', async () => {
  const rows = Array.from({ length: 203 }, (_, n) => ({ id: String(n) }))
  const db = database({ rows }, { responseCap: 17 })
  const sizes = []
  const result = await completeInQuery([...rows.map(r => r.id), '1'], batch => {
    sizes.push(batch.length)
    return db.from('rows').select('id').in('id', batch)
  })
  assert.equal(result.error, null)
  assert.equal(result.data.length, 203)
  assert.ok(sizes.every(size => size <= 50))
})

test('actual member export includes every scoped row beyond the backend response cap', async () => {
  const members = Array.from({ length: 1103 }, (_, n) => ({ id: `m${String(n).padStart(4, '0')}`, cohort_id: 'c', first_name: 'Member', last_name: String(n), created_at: '2026-01-01' }))
  const db = database({ mentor: [...members, { id: 'foreign', cohort_id: 'other' }] }, { responseCap: 113 })
  const { buildCohortExport } = loadTs('src/lib/cohort-export.ts')
  const result = await buildCohortExport(db, 'c', 'members')
  assert.equal(result.error, null)
  assert.equal(result.rows.length, 1103)
  assert.equal(new Set(result.rows.map(row => row[0])).size, 1103)
  assert.ok(!result.rows.some(row => row[0] === 'foreign'))
})

test('complete reads handle a server cap smaller than the requested page', async () => {
  const rows = Array.from({ length: 1003 }, (_, id) => ({ id }))
  let start = 0
  const query = {
    order(column) { assert.equal(column, 'id'); return this },
    range(from) { start = from; return this },
    then(resolve) { return Promise.resolve({ data: rows.slice(start, start + 127), error: null }).then(resolve) },
  }
  assert.deepEqual((await completeQuery(query)).data, rows)
})

test('later failures and explicit size limits never return partial exports', async () => {
  let start = 0
  const query = {
    order() { return this }, range(from) { start = from; return this },
    then(resolve) { return Promise.resolve(start ? { data: null, error: { message: 'Failed page' } } : { data: [{ id: 1 }], error: null }).then(resolve) },
  }
  assert.deepEqual(await completeQuery(query), { data: null, error: { message: 'Failed page' } })
  assert.equal((await completeQuery(query, 0)).data, null)
})
