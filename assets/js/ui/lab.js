/* lab.js — the frame every experiment shares (hw02's statistics lab, hw03's
   attacks, hw04's simulations). It reads top to bottom in a fixed order:
   the question → how the experiment works → its controls, each with a
   one-line hint → the Result in one sentence → numbered evidence sections →
   why it matters → "What am I looking at?" → a Notes box kept in this browser
   → CSV / JSON export. It only draws: running the experiment (a worker, a
   cache) is the homework's business, which hands in the view or a placeholder. */

import { el, explain } from './dom.js';
import { toCSV, download } from './export.js';
import { load, save } from './store.js';

/** A numbered section of the evidence, with a one-line caption saying how to read it. */
export const section = (n, title, caption = '') => [
  el('h3', { class: 'section' }, [el('span', { class: 'n', text: n }), title]),
  caption ? el('p', { class: 'caption', html: caption }) : null,
];

/** A table of numbers (first column left-aligned); headers may hold markup, cells may be nodes. */
export const table = (head, rows, cls = '') => el('div', { class: 'scroll-x' }, [el('table', { class: `data ${cls}`.trim() }, [
  el('thead', {}, [el('tr', {}, head.map((h, i) => el('th', { class: i ? null : 'left', html: h })))]),
  el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => (c instanceof Node
    ? el('td', { class: i ? null : 'left' }, [c])
    : el('td', { class: i ? null : 'left', text: c })))))),
])]);

/** ok / not-ok text, never colour alone. */
export const verdict = (ok, yes, no) => el('span', { class: ok ? 'ok' : 'err', text: ok ? `✓ ${yes}` : `✗ ${no}` });

/** What a panel shows while its run computes: a label, the progress bar, Cancel. */
export const running = (label, bar, onCancel = null) => el('div', { class: 'running' }, [
  el('span', { class: 'small', text: label }), bar,
  onCancel ? el('button', { type: 'button', text: 'Cancel', onclick: onCancel }) : null,
]);

/**
 * @param {object} o
 * @param {string} o.hw        the homework ('hw04'): prefix of the Notes key and of export file names
 * @param {string} o.id        short id of the experiment ('E2'), for the Notes key and the JSON
 * @param {string} o.title
 * @param {Node[]} [o.head]    extra nodes beside the title (hw02's category badges)
 * @param {string} o.question  one sentence (HTML)
 * @param {string[]} [o.steps] how it works, short numbered steps (HTML)
 * @param {Node[]} [o.controls] the panel's own inputs, in one row
 * @param {string[]} [o.hints] one line per control (HTML)
 * @param {Node|Node[]|null} [o.waiting]  shown instead of the results while there is nothing to show
 * @param {() => {answer: {text: string, ok?: boolean}, body: Node[], rows?: object[], summary?: object}} [o.view]
 * @param {string} [o.why]     why it matters (HTML)
 * @param {string[]} [o.notes] the "What am I looking at?" paragraphs
 * @param {string} [o.name]    file name stem for exports
 * @param {(out) => object|null} [o.json]  what Export JSON saves (no button when null)
 * @param {Node[]} [o.extra]   more items for the export row (a timing note)
 * @param {Node|null} [o.flag] a badge saying the result on screen is the previous one (hw04's updatingFlag)
 * @param {boolean} [o.notesBox]  false leaves the Notes box out (hw03)
 */
export function labPanel({
  hw, id, title, head = [], question, steps = [], controls = [], hints = [], waiting = null, view = null,
  why = '', notes = null, name = id, json = (out) => (out.summary ? { experiment: id, ...out.summary } : null),
  extra = [], flag = null, notesBox = true,
}) {
  let body;
  if (waiting || !view) body = [].concat(waiting);
  else {
    const out = view();
    const data = json(out);
    const tail = [
      out.rows?.length ? el('button', { type: 'button', text: 'Export CSV', onclick: () => download(`${hw}-${name}.csv`, toCSV(out.rows), 'text/csv') }) : null,
      data ? el('button', { type: 'button', text: 'Export JSON', onclick: () => download(`${hw}-${name}.json`, JSON.stringify(data, null, 2), 'application/json') }) : null,
      ...extra,
    ].filter(Boolean);
    body = [
      el('div', { class: `answer ${out.answer.ok === false ? 'warn' : ''}` }, [
        el('div', { class: 'label', text: 'Result' }),
        el('p', { html: out.answer.text }),
      ]),
      ...out.body,
      tail.length ? el('div', { class: 'row', style: 'margin-top:14px' }, tail) : null,
    ];
  }

  let notesNode = null;
  if (notesBox) {
    const key = `${hw}.notes.${id}`;
    const box = el('textarea', { rows: 3, 'aria-label': `notes on ${title}`, placeholder: 'Your observations on this experiment, kept in this browser only.',
      oninput: (e) => save(key, e.target.value) }, [load(key, '')]);
    notesNode = el('details', { class: 'explain' }, [el('summary', { text: 'Notes' }), el('div', {}, [box])]);
  }

  return el('div', { class: `card lab${flag ? ' is-stale' : ''}` }, [
    flag,
    head.length ? el('div', { class: 'step-head' }, [el('h2', { text: title }), ...head]) : el('h2', { text: title }),
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
    notesNode,
  ]);
}
