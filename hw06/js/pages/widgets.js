/* widgets.js — the visual language of the hw06 plots, the runner around this
   homework's worker, and the shared figure helpers re-exported, so a page
   imports its drawing kit from one place.
   Riemann = vertical rectangles in --s1; Lebesgue = horizontal slabs with their
   preimages in --s2; reference values = a solid ink line; errors on log axes.
   The Φ methods use the six-colour --m1…--m6 palette plus labels and dashes. */

import { runner } from '../../../assets/js/ui/run.js';
import { el } from '../../../assets/js/ui/dom.js';

export { legend, evidence, evidenceHtml, figure, svgButton } from '../../../assets/js/ui/figure.js';
export { densityBars, curve, histogram } from '../../../assets/js/ui/plot.js';
export { compareRow, COMPARE_HEAD } from '../../../assets/js/ui/lab.js';
export { sig } from '../../../assets/js/ui/format.js';

export const RIEMANN = 'var(--s1)', LEBESGUE = 'var(--s2)', REF = 'var(--ink)', MUTED = 'var(--muted)';

/** hw06's experiments, run in its worker with a per-page cache (shared runner). */
export const { getRun, forget, pending, updatingFlag } = runner(new URL('../workers/sim.js', import.meta.url));


/**
 * The abstract that opens every hw06 page (user's request, 11 Nov 2026): the question
 * the page answers, what it finds (with the key numbers), and its sections as links.
 * @param {{question: string, findings: string[], sections: [string, string][], scope?: string}} o  html strings; sections are [id, title]; scope 'homework' on the home page
 */
export function abstract({ question, findings, sections = [], scope = 'page' }) {
  return el('section', { class: 'card abstract', 'aria-label': 'abstract' }, [
    el('h2', { text: 'Abstract' }),
    el('p', { class: 'abstract-q', html: question }),
    el('div', { class: 'label', text: `What this ${scope} finds` }),
    el('ul', {}, findings.map((f) => el('li', { html: f }))),
    sections.length ? el('div', { class: 'label', text: 'On this page' }) : null,
    sections.length ? el('ol', { class: 'abstract-toc' }, sections.map(([id, t]) => el('li', {}, [el('a', { href: `#${id}`, text: t })]))) : null,
  ]);
}

/** Give a panel an id, so the abstract can link to it. */
export const anchor = (id, node) => { node.id = id; return node; };
