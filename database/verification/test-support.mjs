import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// Execute the real TS helpers/routes, replacing only framework/provider edges.
// No provider credentials, network, generated JS files, or new dependencies.
export function loadTs(relative, stubs = {}, cache = new Map()) {
  const filename = resolve(root, relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const loaded = { exports: {} }
  cache.set(filename, loaded)
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const require = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name]
    if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) }
    assert.ok(name.startsWith('@/'), `Unexpected provider import: ${name}`)
    return loadTs(`src/${name.slice(2)}.ts`, stubs, cache)
  }
  runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename })(require, loaded, loaded.exports)
  return loaded.exports
}
const normalize = (email) => email.trim().toLowerCase()
// Equality-only PostgREST test double. SQL behavior and column generation are
// separately checked in verify_phase1.sh against disposable PostgreSQL 17.
export function database(seed = {}, options = {}) {
  const tables = structuredClone(seed)
  const calls = []
  let serial = 0
  return { tables, calls, from(table) {
    const filters = []
    let action = 'read', payload, single = false, sort
    tables[table] ??= []
    const query = {
      select() { return query },
      eq(key, value) { filters.push((r) => r[key] === value); return query },
      neq(key, value) { filters.push((r) => r[key] !== value); return query },
      in(key, values) { filters.push((r) => values.includes(r[key])); return query },
      is(key, value) { filters.push((r) => r[key] === value); return query },
      not(key, operator, value) { assert.equal(operator, 'is'); filters.push((r) => r[key] !== value); return query },
      gte() { return query },
      lt(key, value) { filters.push(r => r[key] < value); return query },
      lte(key, value) { filters.push(r => r[key] <= value); return query },
      order(key, { ascending = true } = {}) { sort = { key, ascending }; return query },
      maybeSingle() { single = true; return query },
      single() { single = true; return query },
      update(value) { action = 'update'; payload = value; return query },
      insert(value) { action = 'insert'; payload = value; return query },
      then(onFulfilled, onRejected) {
        const execute = () => {
          calls.push({ table, action })
          if (options.failRead && action === 'read') return { data: null, error: { message: 'offline' } }
          if (action === 'update') options.beforeUpdate?.(tables, table)
          let rows = tables[table].filter((r) => filters.every((f) => f(r)))
          if (sort) rows.sort((a, b) => String(a[sort.key]).localeCompare(String(b[sort.key])) * (sort.ascending ? 1 : -1))
          if (action === 'insert') {
            const input = Array.isArray(payload) ? payload : [payload]
            if (table === 'cohort_applications' && input.some((n) => tables[table].some((r) =>
              r.cohort_id === n.cohort_id && r.role === n.role && normalize(r.email) === normalize(n.email)))) {
              return { data: null, error: { code: '23505', message: 'duplicate' } }
            }
            rows = input.map((r) => ({ id: `new-${++serial}`, ...r, ...(r.email ? { normalized_email: normalize(r.email) } : {}) }))
            tables[table].push(...rows)
          } else if (action === 'update') {
            for (const row of rows) Object.assign(row, payload)
          }
          if (single && rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'ambiguous' } }
          return { data: structuredClone(single ? rows[0] ?? null : rows), count: rows.length, error: null }
        }
        return Promise.resolve().then(execute).then(onFulfilled, onRejected)
      },
    }
    return query
  } }
}
