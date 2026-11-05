/* nature-page.js — what this page shows, in two to four lines. */

import { el, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { readInputs, dock } from './inputs.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

/* this page's own row in the dock (leave it out if the page has none) */
const OWN = {
  id: 'nature', label: 'this page',
  build(apply) {
    const box = el('input', { type: 'checkbox', onchange: (e) => apply({ detail: e.target.checked ? '1' : null }) });
    return {
      nodes: [el('div', { class: 'row' }, [el('label', { class: 'small' }, [box, ' show the detail'])])],
      refresh(v) { box.checked = v.detail; },
    };
  },
  summary: (v) => (v.detail ? 'detail on' : ''),
};

function examplePanel(state, update) {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'A panel' }),
    el('p', { class: 'small muted', text: 'Replace this with the real thing.' }),
    explain([
      'What the reader is looking at, in two to four sentences.',
      'PRACTICE: where this shows up in the real world — be specific, or leave it out.',
    ]),
  ]);
}

startPage({
  shell: hw05Shell('nature.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,   // redraw in place: keep the scroll and the open boxes when an input changes
  render: ({ state, update }) => {
    dock(readInputs(state), update, OWN, { detail: state.detail === '1' });
    return [examplePanel(state, update)];
  },
});
