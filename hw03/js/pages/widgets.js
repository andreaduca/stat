/* widgets.js — small building blocks shared by the hw03 pages: the facts
   list, the public/secret tag, a chart with its legend. */

import { el } from '../../../assets/js/ui/dom.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { chartLegend } from '../../../assets/js/ui/linechart.js';

/** Label → value rows (labels may hold markup, values are plain text). */
export const facts = (rows) => el('ul', { class: 'facts' }, rows.filter(Boolean).map(([k, v]) =>
  el('li', {}, [el('span', { class: 'k', html: k }), el('span', { class: 'v', text: v })])));

/** public / secret tag: colour plus a word, never colour alone. */
export const tag = (kind) => el('span', { class: `tag ${kind}`, text: kind });

/** A bar chart with its legend underneath. */
export const chart = (opts) => el('div', {}, [barChart(opts), chartLegend([...opts.series, ...(opts.overlay ? [opts.overlay] : [])])]);

const SUP = (n) => String(n).replace(/[-\d]/g, (d) => (d === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]));

/** "3.2 ms", "41 s", "70 days", "1.1·10²⁵ years": a duration a person can read. */
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
  return `${(years / 10 ** exp).toFixed(1)}·10${SUP(exp)} years`;
}

/** "2.0 MB", "64 GB", "3.7·10³⁰ TB". */
export function humanBytes(bytes) {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1000 && i < units.length - 1) { bytes /= 1000; i++; }
  if (bytes < 1e4) return `${bytes < 10 ? bytes.toPrecision(2) : Math.round(bytes)} ${units[i]}`;
  const exp = Math.floor(Math.log10(bytes));
  return `${(bytes / 10 ** exp).toFixed(1)}·10${SUP(exp)} ${units[i]}`;
}

/** 2^k as text: "2²⁰ ≈ 1.0·10⁶". */
export const pow2 = (k) => `2${SUP(k)}`;
