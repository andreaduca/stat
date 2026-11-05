/* widgets.js — the visual language of the hw05 plots, fixed across the site:
   simulation = bars and points (--s1); theory = a solid line (--s2); ±2 SE =
   a shaded band; a biased estimator = dashed. Plus a density histogram, the
   "measured vs theory" table row, and the hw05 runner around its worker.
   The legend keys, evidence labels, figures and SVG export are the shared
   assets/js/ui/figure.js. */

import { el } from '../../../assets/js/ui/dom.js';
import { runner } from '../../../assets/js/ui/run.js';
import { verdict } from '../../../assets/js/ui/lab.js';
import { sci } from '../../../assets/js/ui/format.js';
import { plot } from '../../../assets/js/ui/plot.js';

export { legend, evidence, evidenceHtml, figure, svgButton } from '../../../assets/js/ui/figure.js';

export const SIM = 'var(--s1)', THEORY = 'var(--s2)', INK = 'var(--ink)', MUTED = 'var(--muted)';

/** hw05's experiments, run in its worker with a per-page cache (shared runner). */
export const { getRun, forget, pending, updatingFlag } = runner(new URL('../workers/sim.js', import.meta.url));

/** A density histogram of values on [lo, hi] in `bins` equal bins, as plot.js
 *  bars [x0, x1, height] with height = count/(total·width), so that it sits
 *  on the same scale as a density curve. Values outside [lo, hi] are counted in
 *  the total but not drawn (the caption says how many). */
export function densityBars(values, lo, hi, bins = 40) {
  const w = (hi - lo) / bins, counts = new Array(bins).fill(0);
  let outside = 0;
  for (const v of values) {
    const k = Math.floor((v - lo) / w);
    if (k >= 0 && k < bins) counts[k]++;
    else if (v === hi) counts[bins - 1]++;
    else outside++;
  }
  const total = values.length;
  return { bars: counts.map((c, k) => [lo + k * w, lo + (k + 1) * w, c / (total * w)]), outside };
}

/** Points of a density curve f on [lo, hi]. */
export const curve = (f, lo, hi, steps = 200) => Array.from({ length: steps + 1 }, (_, i) => {
  const x = lo + ((hi - lo) * i) / steps;
  return [x, f(x)];
});

/** A number to d significant digits; scientific notation outside [10⁻⁴, 10⁶). */
export const sig = (v, d = 4) => {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return sci(v, d);
  return Number(v.toPrecision(d)).toString();
};

/** One row of a "measured vs theory" table: measured, theory, difference, SE,
 *  z = difference/SE, and the verdict (consistent if |z| ≤ 3, else "check" — never hidden). */
export const compareRow = (name, c) => [
  el('span', { html: name }), sig(c.measured), sig(c.theory), sig(c.diff, 3), sig(c.se, 3),
  Number.isFinite(c.z) ? c.z.toFixed(2) : '—',
  verdict(c.ok, 'consistent', 'check'),
];
export const COMPARE_HEAD = ['', 'measured', 'theory', 'difference', 'SE', 'z', ''];

/**
 * A density histogram of `values` on [lo, hi], with optional theory curves and reference lines.
 * @param {object} o
 * @param {ArrayLike<number>} o.values
 * @param {number} o.lo  @param {number} o.hi  @param {number} [o.bins]
 * @param {{f: (x: number) => number, label: string, dash?: boolean|string, color?: string}[]} [o.curves]
 * @param {{at: number, text?: string, color?: string, dash?: boolean|string}[]} [o.refs]  vertical lines
 * @param {string} o.xTitle  @param {string} o.label  accessible description
 * @param {number} [o.width] @param {number} [o.height] @param {number} [o.yMax]
 */
export function histogram({ values, lo, hi, bins = 40, curves = [], refs = [], xTitle, label, width = 520, height = 240, yMax, color = SIM, barLabel = 'simulation' }) {
  const { bars, outside } = densityBars(values, lo, hi, bins);
  const node = plot({
    x: { min: lo, max: hi, title: xTitle },
    y: { min: 0, max: yMax, title: 'density' },
    width, height,
    layers: [
      { type: 'bars', bars, color, label: barLabel },
      ...curves.map((c) => ({ type: 'line', points: curve(c.f, lo, hi), color: c.color ?? THEORY, dash: c.dash ?? false, label: c.label })),
      ...refs.map((r) => ({ type: 'vline', at: r.at, color: r.color ?? THEORY, dash: r.dash ?? false, text: r.text })),
    ],
    label,
  });
  node.dataset.outside = String(outside);
  return node;
}

/** Points [k, value] at about `count` log-spaced indices 1…n (all of them up to 100), for running averages. */
export function logIndices(n, count = 220) {
  const out = [];
  let k = 1;
  while (k <= n) { out.push(k); k = k < 100 ? k + 1 : Math.max(k + 1, Math.round(k * 10 ** (Math.log10(n) / count))); }
  if (out.at(-1) !== n) out.push(n);
  return out;
}

/** Running averages of an array at the given 1-based indices. */
export function runningAverages(values, at) {
  const out = [];
  let s = 0, j = 0;
  for (let i = 0; i < values.length && j < at.length; i++) {
    s += values[i];
    if (i + 1 === at[j]) { out.push([at[j], s / at[j]]); j++; }
  }
  return out;
}

/** Pearson correlation of two equal-length arrays. */
export function correlation(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb);
}

/** A quantile of an array (sorted copy). */
export function quantile(values, q) {
  const v = Float64Array.from(values).sort();
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
}
