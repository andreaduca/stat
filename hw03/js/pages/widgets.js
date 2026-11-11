/* widgets.js — small building blocks shared by the hw03 pages: the
   public/secret tag, and the bar chart with its legend (now shared, from
   assets/js/ui/barchart.js). (facts() is in assets/js/ui/dom.js; humanTime,
   humanBytes, pow2 in assets/js/ui/format.js.) */

import { el } from '../../../assets/js/ui/dom.js';

export { barChartWithLegend as chart } from '../../../assets/js/ui/barchart.js';

/** public / secret tag: colour plus a word, never colour alone. */
export const tag = (kind) => el('span', { class: `tag ${kind}`, text: kind });
