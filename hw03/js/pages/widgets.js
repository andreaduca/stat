/* widgets.js — small building blocks shared by the hw03 pages: the
   public/secret tag and a bar chart with its legend. (facts() is in
   assets/js/ui/dom.js; humanTime, humanBytes, pow2 in assets/js/ui/format.js.) */

import { el } from '../../../assets/js/ui/dom.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { chartLegend } from '../../../assets/js/ui/linechart.js';

/** public / secret tag: colour plus a word, never colour alone. */
export const tag = (kind) => el('span', { class: `tag ${kind}`, text: kind });

/** A bar chart with its legend underneath. */
export const chart = (opts) => el('div', {}, [barChart(opts), chartLegend([...opts.series, ...(opts.overlay ? [opts.overlay] : [])])]);
