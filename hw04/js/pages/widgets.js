/* widgets.js — small building blocks shared by the hw04 pages: the facts
   list, the legend of the three layers, evidence labels, a figure with its
   caption, and SVG export of a chart. */

import { el } from '../../../assets/js/ui/dom.js';
import { download } from '../../../assets/js/ui/export.js';

/** The fixed visual encoding of every distribution plot (note 01 §4). */
export const SIM = 'var(--s1)', EXACT = 'var(--s2)', LIMIT = 'var(--ink)';

/** Label → value rows (labels may hold markup, values are plain text). */
export const facts = (rows) => el('ul', { class: 'facts' }, rows.filter(Boolean).map(([k, v]) =>
  el('li', {}, [el('span', { class: 'k', html: k }), el('span', { class: 'v', text: v })])));

/** A legend whose keys show the mark, not only its colour:
 *  kind is 'bar', 'dot', 'line', 'dash' or 'path'. */
export const legend = (items) => el('div', { class: 'legend keys' }, items.map(([kind, color, label]) =>
  el('span', {}, [el('i', { class: `key ${kind}`, style: `--c:${color}` }), label])));

/** The three layers, in the order of every plot: simulation, exact, limit. */
export const layersLegend = ({ sim = 'simulation (m attackers)', exact = 'exact law at this n', limit = 'limit as n → ∞' } = {}) =>
  legend([['bar', SIM, sim], ['dot', EXACT, exact], ['dash', LIMIT, limit]].filter((x) => x[2]));

/** How strong a claim is: proved, measured here, from a source, or an opinion. */
const EVIDENCE = { T: ['theorem', 'theorem'], M: ['measurement', 'measured'], S: ['record', 'source'], O: ['opinion', 'opinion'] };
export const evidence = (kind) => el('span', { class: `evidence ${EVIDENCE[kind][0]}`, text: EVIDENCE[kind][1] });

/** A chart with a caption saying what it shows and how it was made. */
export const figure = (chart, caption) => el('figure', { class: 'fig' }, [chart, caption ? el('figcaption', { html: caption }) : null]);

/** Save the SVG inside a chart node as a file (for the essay and the blog).
 *  The colours are CSS variables, so they are resolved into the file first. */
export function svgButton(chartNode, name) {
  return el('button', { type: 'button', class: 'mini', text: 'SVG', title: 'download this chart as SVG', onclick: () => {
    const svg = chartNode.querySelector('svg');
    if (!svg) return;
    const copy = svg.cloneNode(true);
    const css = getComputedStyle(document.documentElement);
    const resolve = (s) => s.replace(/var\((--[\w-]+)\)/g, (_, v) => css.getPropertyValue(v).trim());
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const live = svg.querySelectorAll('*'), cloned = copy.querySelectorAll('*');
    live.forEach((n, i) => {
      const cs = getComputedStyle(n);
      cloned[i].setAttribute('style', resolve(`fill:${cs.fill};stroke:${cs.stroke};stroke-width:${cs.strokeWidth};stroke-dasharray:${cs.strokeDasharray};opacity:${cs.opacity};font:${cs.font}`));
    });
    download(`${name}.svg`, new XMLSerializer().serializeToString(copy), 'image/svg+xml');
  } });
}
