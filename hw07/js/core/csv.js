/* csv.js — read a CSV file into columns, for "given any bivariate dataset" (D3).
   A minimal RFC 4180 parser: quoted fields with embedded delimiters, quotes ("")
   and newlines; CRLF or LF line ends; the delimiter guessed among , ; tab |.
   Each column is sniffed as numeric (to be binned) or categorical (kept as labels).
   Runs on the reader's device only: the page passes it the text of a file the reader
   chose, and nothing is uploaded or stored (draft §0.7). Pure, no DOM. Note 02 D3. */

const CANDIDATES = [',', ';', '\t', '|'];

/**
 * Split CSV text into records of fields. Category: parsing (RFC 4180).
 * A quote opens a quoted field only at the start of a field; inside it, "" is a literal
 * quote and the delimiter and line breaks are ordinary characters.
 * @returns {string[][]}
 */
export function parseRecords(text, delimiter) {
  const records = [];
  let field = '', record = [], quoted = false, i = 0;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;   // a UTF-8 byte-order mark
  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => { endField(); records.push(record); record = []; };
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue; }
    if (ch === delimiter) { endField(); i++; continue; }
    if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch; i++;
  }
  if (field !== '' || record.length) endRecord();
  return records.filter((r) => !(r.length === 1 && r[0].trim() === ''));   // blank lines
}

/** The delimiter that splits the first lines into the same number (> 1) of fields most often. */
export function sniffDelimiter(text) {
  const head = text.slice(0, 20000);
  let best = ',', bestScore = -1;
  for (const d of CANDIDATES) {
    const recs = parseRecords(head, d).slice(0, 20);
    if (!recs.length) continue;
    const width = recs[0].length;
    if (width < 2) continue;
    const score = recs.filter((r) => r.length === width).length * width;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

const isMissing = (v) => v === undefined || /^\s*(|na|n\/a|nan|null|-)\s*$/i.test(v);
const asNumber = (v) => (/^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(v) ? Number(v) : NaN);

/**
 * Parse a CSV file with a header row.
 * @returns {{delimiter: string, header: string[], rows: string[][], columns: {name: string, numeric: boolean, missing: number}[], ragged: number}}
 *   ragged = data rows whose number of fields differs from the header (kept, missing fields empty)
 */
export function parseCSV(text, { delimiter = null } = {}) {
  const d = delimiter ?? sniffDelimiter(text);
  const recs = parseRecords(text, d);
  if (recs.length < 2) throw new Error('the file needs a header row and at least one data row');
  const header = recs[0].map((h, j) => h.trim() || `column ${j + 1}`);
  const rows = recs.slice(1);
  const ragged = rows.filter((r) => r.length !== header.length).length;
  const columns = header.map((name, j) => {
    const vals = rows.map((r) => r[j]).filter((v) => !isMissing(v));
    return { name, numeric: vals.length > 0 && vals.every((v) => Number.isFinite(asNumber(v))), missing: rows.length - vals.length };
  });
  return { delimiter: d, header, rows, columns, ragged };
}

/**
 * The pairs (x, f) of two columns, skipping rows where either value is missing.
 * Numeric columns give numbers (to be binned), the others trimmed strings.
 * @returns {{pairs: {x: *, f: *}[], skipped: number}}
 */
export function pairsFrom(parsed, jx, jf) {
  const cx = parsed.columns[jx], cf = parsed.columns[jf];
  const pairs = [];
  let skipped = 0;
  for (const r of parsed.rows) {
    if (isMissing(r[jx]) || isMissing(r[jf])) { skipped++; continue; }
    pairs.push({ x: cx.numeric ? asNumber(r[jx]) : r[jx].trim(), f: cf.numeric ? asNumber(r[jf]) : r[jf].trim() });
  }
  return { pairs, skipped };
}

/** A table of counts written out as CSV records, one per observation (for the bundled examples). */
export function toCSV(header, rows) {
  const q = (v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [header, ...rows].map((r) => r.map(q).join(',')).join('\n');
}
