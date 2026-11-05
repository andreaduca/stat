/* format.js — numbers as a reader sees them: thousands with a thin space,
   superscript exponents, percentages, durations, byte counts. Plain strings,
   no DOM, so the core files and the workers may use it too. */

/** Digits and minus signs as superscripts: sup(-12) → "⁻¹²". */
export const sup = (n) => String(n).replace(/[-\d]/g, (d) => (d === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]));

/** A Number with a narrow no-break space every three digits: 10 000.
 *  (dom.js `fmt` does the same for BigInts, with a plain space.) */
export const nice = (n) => n.toLocaleString('en-US').replace(/,/g, ' ');

/** A probability or a ratio that may be tiny: 0 → "0", 3.2e-5 → "3.20e-5",
 *  otherwise `digits` significant digits. */
export const sci = (x, digits = 4) => (x === 0 ? '0'
  : Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6 ? x.toExponential(2) : x.toPrecision(digits));

/** A fraction as a percentage with `d` decimals: pct(0.1234) → "12.3 %". */
export const pct = (x, d = 1) => `${(100 * x).toFixed(d)} %`;

/** A fraction as a percentage with `digits` significant digits: "0.00153 %". */
export const pctSig = (x, digits = 3) => `${(100 * x).toPrecision(digits)} %`;

/** 2^k as text: "2²⁰". */
export const pow2 = (k) => `2${sup(k)}`;

/** "3.2 µs", "41 s", "70 days", "1.1·10²⁵ years": a duration a person can read. */
export function humanTime(seconds) {
  const num = (x) => (x < 10 ? x.toPrecision(2) : String(Math.round(x)));
  if (seconds < 1e-3) return `${num(seconds * 1e6)} µs`;
  if (seconds < 1) return `${num(seconds * 1000)} ms`;
  if (seconds < 120) return `${num(seconds)} s`;
  if (seconds < 7200) return `${num(seconds / 60)} min`;
  if (seconds < 172800) return `${num(seconds / 3600)} h`;
  if (seconds < 6.3e7) return `${num(seconds / 86400)} days`;
  const years = seconds / 3.156e7;
  if (years < 1e4) return `${num(years)} years`;
  const exp = Math.floor(Math.log10(years));
  return `${(years / 10 ** exp).toFixed(1)}·10${sup(exp)} years`;
}

/** "2.0 MB", "64 GB", "3.7·10³⁰ TB". */
export function humanBytes(bytes) {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1000 && i < units.length - 1) { bytes /= 1000; i++; }
  if (bytes < 1e4) return `${bytes < 10 ? bytes.toPrecision(2) : Math.round(bytes)} ${units[i]}`;
  const exp = Math.floor(Math.log10(bytes));
  return `${(bytes / 10 ** exp).toFixed(1)}·10${sup(exp)} ${units[i]}`;
}

/** Text made safe to splice into an `html:` string. */
export const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
