/* widgets.js — the visual language of the hw05 plots, fixed across the site:
   simulation = bars and points (--s1); theory = a solid line (--s2); ±2 SE =
   a shaded band; a biased estimator = dashed. Plus the hw05 runner around its
   worker and the running averages of the Sampling page. The density histogram,
   the "measured vs theory" row, sig, quantile and correlation moved to assets/
   (Nov 2026) and are re-exported here, so the pages import from one place. */

import { runner } from '../../../assets/js/ui/run.js';

export { legend, evidence, evidenceHtml, figure, svgButton } from '../../../assets/js/ui/figure.js';
export { densityBars, curve, histogram } from '../../../assets/js/ui/plot.js';
export { compareRow, COMPARE_HEAD } from '../../../assets/js/ui/lab.js';
export { sig } from '../../../assets/js/ui/format.js';
export { quantile, correlation } from '../../../assets/js/core/stats.js';

export const SIM = 'var(--s1)', THEORY = 'var(--s2)', INK = 'var(--ink)', MUTED = 'var(--muted)';

/** hw05's experiments, run in its worker with a per-page cache (shared runner). */
export const { getRun, forget, pending, updatingFlag } = runner(new URL('../workers/sim.js', import.meta.url));

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
