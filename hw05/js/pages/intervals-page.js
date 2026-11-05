/* intervals-page.js — what this experiment measures, in two to four lines.
   The panel reads in the fixed order of assets/js/ui/lab.js. This one computes
   synchronously; a long run belongs in a Web Worker (assets/js/ui/worker.js,
   and hw04/js/pages/run.js for the cache and the in-place redraw). */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { nice } from '../../../assets/js/ui/format.js';
import { readInputs, dock } from './inputs.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

function experiment(state, update) {
  const n = Math.min(1e6, Math.max(1, Math.round(Number(state.n) || 1000)));
  const input = el('input', { type: 'number', class: 'num', min: 1, max: 1e6, value: String(n),
    onchange: (e) => update({ n: e.target.value }) });
  return labPanel({
    hw: 'hw05', id: 'E1', title: 'The experiment',
    question: 'The question the experiment answers, in one sentence.',
    steps: ['first step of the procedure;', 'second step;', 'what is measured.'],
    controls: [field('n', input)],
    hints: ['<strong>n</strong> — what changing it does.'],
    view: () => ({
      answer: { text: `The finding in one sentence, computed from the data (n = ${nice(n)}).` },
      body: [...section(1, 'The numbers', 'How to read this table.'), table(['n', 'value'], [[nice(n), String(n)]])],
      rows: [{ n }],
    }),
    why: 'why the result matters.',
    notes: ['What am I looking at, in two to four sentences.'],
  });
}

startPage({
  shell: hw05Shell('intervals.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,   // redraw in place: keep the scroll and the open boxes when an input changes
  render: ({ state, update }) => {
    dock(readInputs(state), update);
    return [experiment(state, update)];
  },
});
