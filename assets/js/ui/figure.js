/* figure.js — small building blocks around a chart: a legend whose keys show
   the mark (bar, dot, line, dash, path, band) and not only its colour, an
   evidence label (how strong a claim is), a figure with its caption, and a
   button that saves the chart as an SVG file for the essay or a blog post.
   Moved here from hw04/js/pages/widgets.js when hw05 needed them (Nov 2026);
   their styles are in base.css. */

import { el } from './dom.js';
import { download } from './export.js';

/** A legend whose keys show the mark, not only its colour:
 *  each item is [kind, colour, label], kind one of 'bar', 'dot', 'line', 'dash', 'path', 'band'. */
export const legend = (items) => el('div', { class: 'legend keys' }, items.map(([kind, color, label]) =>
  el('span', {}, [el('i', { class: `key ${kind}`, style: `--c:${color}` }), label])));

/** How strong a claim is: T proved, M measured here, S from a source, O an opinion. */
const EVIDENCE = { T: ['theorem', 'theorem'], M: ['measurement', 'measured'], S: ['record', 'source'], O: ['opinion', 'opinion'] };
export const evidence = (kind) => el('span', { class: `evidence ${EVIDENCE[kind][0]}`, text: EVIDENCE[kind][1] });
/** The same label as markup, for a sentence written as an html string. */
export const evidenceHtml = (kind) => `<span class="evidence ${EVIDENCE[kind][0]}">${EVIDENCE[kind][1]}</span>`;

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
