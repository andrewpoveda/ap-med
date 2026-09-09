/**
 * RFC-4180 exports for Excel/Sheets. Prefix formula-like user text with an
 * apostrophe to prevent spreadsheet execution; include a UTF-8 BOM so accented
 * names remain legible in Excel.
 */

export type CsvCell = string | number | null | undefined

// UTF-8 byte-order mark (U+FEFF), spelled by code point so the source has no
// invisible character.
const BOM = String.fromCharCode(0xfeff)

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Formula-injection guard — prefix a single quote so Excel/Sheets treat the
  // cell as text. Applied before RFC-4180 quoting so the quote is inside the
  // quoted field when one is needed.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  // Quote fields containing the delimiter, a quote, or a line break; double any
  // embedded quotes.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Serializes a header row + data rows to a CSV string with CRLF line endings
 * and a UTF-8 BOM. Cells are escaped and formula-injection-guarded.
 */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','))
  return BOM + lines.join('\r\n') + '\r\n'
}
