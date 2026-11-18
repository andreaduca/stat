/* widgets.js — the visual language of the hw06 plots, the runner around this
   homework's worker, and the shared figure helpers re-exported, so a page
   imports its drawing kit from one place.
   Riemann = vertical rectangles in --s1; Lebesgue = horizontal slabs with their
   preimages in --s2; reference values = a solid ink line; errors on log axes.
   The Φ methods use the six-colour --m1…--m6 palette plus labels and dashes. */

import { runner } from '../../../assets/js/ui/run.js';

export { legend, evidence, evidenceHtml, figure, svgButton } from '../../../assets/js/ui/figure.js';
export { densityBars, curve, histogram } from '../../../assets/js/ui/plot.js';
export { compareRow, COMPARE_HEAD } from '../../../assets/js/ui/lab.js';
export { sig } from '../../../assets/js/ui/format.js';

export const RIEMANN = 'var(--s1)', LEBESGUE = 'var(--s2)', REF = 'var(--ink)', MUTED = 'var(--muted)';

/** hw06's experiments, run in its worker with a per-page cache (shared runner). */
export const { getRun, forget, pending, updatingFlag } = runner(new URL('../workers/sim.js', import.meta.url));

/* the abstract that opens every page, and an id for its links: shared since hw07 (assets/js/ui/dom.js) */
export { abstract, anchor } from '../../../assets/js/ui/dom.js';
