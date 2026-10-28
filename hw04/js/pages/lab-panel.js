/* lab-panel.js — the frame every hw04 experiment shares, adapted from hw02's:
   the question → how the experiment works → its own controls, each with a
   one-line hint → the Result in one sentence computed from the data → the
   numbered evidence sections → why it matters → "What am I looking at?" →
   a Notes box kept in this browser → CSV / JSON export. The simulation itself
   comes from run.js (shared by every panel of a page), so the frame never
   starts work of its own. */

import { el, explain } from '../../../assets/js/ui/dom.js';
import { toCSV, download } from '../../../assets/js/ui/export.js';
import { load, save } from '../../../assets/js/ui/store.js';

/** A numbered section of the evidence, with a one-line caption saying how to read it. */
export const section = (n, title, caption = '') => [
  el('h3', { class: 'section' }, [el('span', { class: 'n', text: n }), title]),
  caption ? el('p', { class: 'caption', html: caption }) : null,
];

/** A table of numbers (first column left-aligned); cells may be nodes. */
export const table = (head, rows, cls = '') => el('div', { class: 'scroll-x' }, [el('table', { class: `data ${cls}` }, [
  el('thead', {}, [el('tr', {}, head.map((h, i) => el('th', { class: i ? null : 'left', html: h })))]),
  el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => (c instanceof Node
    ? el('td', { class: i ? null : 'left' }, [c])
    : el('td', { class: i ? null : 'left', text: c })))))),
])]);

/** ok / not-ok text, never colour alone. */
export const verdict = (ok, yes, no) => el('span', { class: ok ? 'ok' : 'err', text: ok ? `✓ ${yes}` : `✗ ${no}` });

/**
 * @param {object} o
 * @param {string} o.id        short id, used for the Notes key and file names ('E2')
 * @param {string} o.title
 * @param {string} o.question  one sentence
 * @param {string[]} [o.steps] how it works, short numbered steps (HTML)
 * @param {Node[]} [o.controls] the panel's own inputs
 * @param {string[]} [o.hints] one line per control (HTML)
 * @param {Node|null} [o.waiting]  shown instead of the results while the run is not ready
 * @param {() => {answer: {text: string, ok?: boolean}, body: Node[], rows?: object[], summary?: object}} [o.view]
 * @param {string} [o.why]     why it matters (HTML)
 * @param {string[]} [o.notes] the "What am I looking at?" paragraphs
 * @param {string} [o.name]    file name stem for exports
 * @param {Node|null} [o.flag] run.js's updatingFlag: the previous result is on screen, a new one computes
 */
export function labPanel({ id, title, question, steps = [], controls = [], hints = [], waiting = null, view = null, why = '', notes = null, name = id, flag = null }) {
  let body;
  if (waiting || !view) body = [waiting];
  else {
    const out = view();
    body = [
      el('div', { class: `answer ${out.answer.ok === false ? 'warn' : ''}` }, [
        el('div', { class: 'label', text: 'Result' }),
        el('p', { html: out.answer.text }),
      ]),
      ...out.body,
      out.rows?.length || out.summary ? el('div', { class: 'row', style: 'margin-top:14px' }, [
        out.rows?.length ? el('button', { type: 'button', text: 'Export CSV', onclick: () => download(`hw04-${name}.csv`, toCSV(out.rows), 'text/csv') }) : null,
        out.summary ? el('button', { type: 'button', text: 'Export JSON', onclick: () => download(`hw04-${name}.json`, JSON.stringify({ experiment: id, ...out.summary }, null, 2), 'application/json') }) : null,
      ]) : null,
    ];
  }
  const notesKey = `hw04.notes.${id}`;
  const notesBox = el('textarea', { rows: 3, 'aria-label': `notes on ${title}`, placeholder: 'Your observations on this experiment, kept in this browser only.',
    oninput: (e) => save(notesKey, e.target.value) }, [load(notesKey, '')]);

  return el('div', { class: `card lab${flag ? ' is-stale' : ''}` }, [
    flag,
    el('h2', { text: title }),
    el('p', { class: 'question', html: question }),
    steps.length ? el('div', { class: 'how' }, [
      el('div', { class: 'label', text: 'How the experiment works' }),
      el('ol', {}, steps.map((s) => el('li', { html: s }))),
    ]) : null,
    controls.length ? el('div', { class: 'row' }, controls) : null,
    hints.length ? el('ul', { class: 'hints' }, hints.map((h) => el('li', { html: h }))) : null,
    ...body,
    why ? el('p', { class: 'why matters', html: why }) : null,
    notes ? explain(notes) : null,
    el('details', { class: 'explain' }, [el('summary', { text: 'Notes' }), el('div', {}, [notesBox])]),
  ]);
}
