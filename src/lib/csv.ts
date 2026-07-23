/**
 * Minimal RFC-4180 CSV serialization for the annual-report exports
 * (ascenso-prm.md §5.14). Board members open these in Excel / Google Sheets, so
 * two things matter beyond correctness:
 *
 *  - **Formula-injection guard.** A cell whose text starts with `=`, `+`, `-`,
 *    `@`, tab, or CR is interpreted by Excel/Sheets as an executable formula.
 *    Names, notes, and goal titles are user-supplied free text, so a leading
 *    such character is neutralized with a `'` prefix — the same escape-at-the-
 *    boundary discipline the write routes use with escapeHtml().
 *  - **UTF-8 legibility.** A leading BOM makes Excel read accented names
 *    (e.g. "José") as UTF-8 rather than mojibake.
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
