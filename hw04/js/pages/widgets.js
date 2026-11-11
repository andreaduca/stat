/* widgets.js — the fixed visual encoding of the hw04 plots (simulation, exact,
   limit) and their legend, and hw04's runner around its worker (a per-page
   cache; the previous result stays on screen while a new one computes). The
   legend keys, evidence labels, figures and SVG export are the shared
   assets/js/ui/figure.js, re-exported here. */

import { legend } from '../../../assets/js/ui/figure.js';
import { runner } from '../../../assets/js/ui/run.js';

export { legend, evidence, figure, svgButton } from '../../../assets/js/ui/figure.js';

/** The fixed visual encoding of every distribution plot (note 01 §4). */
export const SIM = 'var(--s1)', EXACT = 'var(--s2)', LIMIT = 'var(--ink)';

/** The three layers, in the order of every plot: simulation, exact, limit. */
export const layersLegend = ({ sim = 'simulation (m attackers)', exact = 'exact law at this n', limit = 'limit as n → ∞' } = {}) =>
  legend([['bar', SIM, sim], ['dot', EXACT, exact], ['dash', LIMIT, limit]].filter((x) => x[2]));

/** hw04's simulations, run in its worker through the shared runner (assets/js/ui/run.js). */
export const { getRun, forget, pending, updatingFlag } = runner(new URL('../workers/sim.js', import.meta.url));
