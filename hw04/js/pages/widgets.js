/* widgets.js — the fixed visual encoding of the hw04 plots (simulation, exact,
   limit) and their legend; the legend keys, evidence labels, figures and SVG
   export are the shared assets/js/ui/figure.js, re-exported here. */

import { legend } from '../../../assets/js/ui/figure.js';

export { legend, evidence, figure, svgButton } from '../../../assets/js/ui/figure.js';

/** The fixed visual encoding of every distribution plot (note 01 §4). */
export const SIM = 'var(--s1)', EXACT = 'var(--s2)', LIMIT = 'var(--ink)';

/** The three layers, in the order of every plot: simulation, exact, limit. */
export const layersLegend = ({ sim = 'simulation (m attackers)', exact = 'exact law at this n', limit = 'limit as n → ∞' } = {}) =>
  legend([['bar', SIM, sim], ['dot', EXACT, exact], ['dash', LIMIT, limit]].filter((x) => x[2]));
