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
