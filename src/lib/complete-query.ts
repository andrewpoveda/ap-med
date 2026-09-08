type QueryResult<T> = { data: T[] | null; error: { message: string } | null }
type PagedQuery<T> = PromiseLike<QueryResult<T>> & {
  order(column: string, options?: { ascending?: boolean }): PagedQuery<T>
  range(from: number, to: number): PagedQuery<T>
}

/**
 * Stable ID tie-breaker, bounded memory, and no short-page assumption: hosted
 * response caps can be smaller than our requested page. An empty page ends
 * the read. Errors discard the accumulated partial result.
 * Call only for tables with an id column, after applying authorization scope.
 */
export async function completeQuery<T>(query: PagedQuery<T>, maximum = 100_000, uniqueOrder = 'id'): Promise<QueryResult<T>> {
  const rows: T[] = []
  const ordered = query.order(uniqueOrder, { ascending: true })
  while (rows.length <= maximum) {
    const { data, error } = await ordered.range(rows.length, rows.length + 499)
    if (error) return { data: null, error }
    if (!data) return { data: null, error: { message: 'Missing query result' } }
    if (data.length === 0) return { data: rows, error: null }
    rows.push(...data)
  }
  return { data: null, error: { message: `Result exceeds the supported ${maximum}-row limit; use an operator-assisted export` } }
}

/** Partition a single IN filter so large UUID/email lists cannot exceed URL limits. */
export async function completeInQuery<T>(values: string[], build: (batch: string[]) => PagedQuery<T>): Promise<QueryResult<T>> {
  const unique = [...new Set(values)]
  const data: T[] = []
  for (let offset = 0; offset < unique.length; offset += 50) {
    const result = await completeQuery(build(unique.slice(offset, offset + 50)), 100_000 - data.length)
    if (result.error) return { data: null, error: result.error }
    data.push(...(result.data ?? []))
  }
  return { data, error: null }
}
