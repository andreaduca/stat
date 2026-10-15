/* lab-panel.js — the frame every statistics-lab experiment shares: its
   parameters (N and the seed always among them), a run in the Web Worker with
   a progress bar and a cancel button, the results (plot, table, estimates with
   theory alongside), a Notes box kept in this browser, and CSV / JSON export.
   Results are cached per parameter set, so redrawing the page never reruns. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { runWorker } from '../../../assets/js/ui/worker.js';
import { toCSV, download } from '../../../assets/js/ui/export.js';
import { load, save } from '../../../assets/js/ui/store.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { chartLegend } from '../../../assets/js/ui/linechart.js';
import { badge } from './widgets.js';

/* ---------- small helpers for the evidence sections of an experiment ---------- */

export const MEASURED = 'var(--s1)', THEORY = 'var(--s2)';
export const pf = (p) => (p < 0.001 ? '< 0.001' : p.toFixed(3));
export const pct = (x, digits = 3) => `${(100 * x).toPrecision(digits)} %`;
export const table = (head, rows) => el('div', { class: 'scroll-x' }, [el('table', { class: 'data' }, [
  el('thead', {}, [el('tr', {}, head.map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
  el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => (c instanceof Node ? el('td', { class: i ? null : 'left' }, [c]) : el('td', { class: i ? null : 'left', text: c })))))),
])]);
export const chart = (opts) => el('div', {}, [barChart(opts), chartLegend([...opts.series, ...(opts.overlay ? [opts.overlay] : [])])]);
export const verdict = (ok, yes, no) => el('span', { class: ok ? 'ok' : 'err', text: ok ? yes : no });

/** A numbered section of the evidence, with a one-line caption saying how to read it. */
export const section = (n, title, caption = '') => [
  el('h3', { class: 'section' }, [el('span', { class: 'n', text: n }), title]),
  caption ? el('p', { class: 'caption', html: caption }) : null,
];

/** A small left-to-right diagram: nodes are [title, subtitle, kind] or operator strings. */
export const flow = (items) => el('div', { class: 'flow' }, items.map((it) => (typeof it === 'string'
  ? el('span', { class: 'op', text: it })
  : el('span', { class: `node ${it[2] ?? ''}` }, [it[0], it[1] ? el('small', { text: it[1] }) : null]))));

/** Counts of integer values in bins of `width` from lo to hi, with the theory
 *  per bin from a probability mass function, scaled to the sample size. */
export function histogram(values, lo, hi, width, pmf) {
  const bins = Math.ceil((hi - lo + 1) / width);
  const counts = new Array(bins).fill(0), theory = new Array(bins).fill(0), labels = [];
  for (const v of values) if (v >= lo && v <= hi) counts[Math.floor((v - lo) / width)]++;
  for (let b = 0; b < bins; b++) {
    labels.push(lo + b * width);
    for (let v = lo + b * width; v < lo + (b + 1) * width && v <= hi; v++) theory[b] += values.length * pmf(v);
  }
  return { labels, counts, theory };
}

/* ---------- the experiment frame ---------- */

const WORKER = new URL('../workers/lab.js', import.meta.url);
const results = new Map();       // "S3 {n,seed}" -> result
let job = null;                  // the running experiment: {key, cancel, progress node, started}

const keyOf = (exp, params) => `${exp} ${JSON.stringify(params)}`;

function start(exp, params, key, update) {
  if (job) job.cancel();
  const running = { key, node: null, started: performance.now() };
  const handle = runWorker(WORKER, { exp, params }, (v) => { if (running.node) running.node.value = v; });
  running.cancel = handle.cancel;
  job = running;
  handle.done
    .then((result) => { results.set(key, { result, seconds: (performance.now() - running.started) / 1000 }); })
    .catch((e) => { if (!e.cancelled) results.set(key, { error: e.message }); else results.set(key, { cancelled: true }); })
    .finally(() => { if (job === running) job = null; update({}); });
}

/**
 * Every experiment reads the same way, top to bottom:
 *   the question → how the experiment works → parameters, each explained →
 *   the result in one sentence → the details (tables, plots) → why it matters.
 * @param {object} o
 * @param {string} o.exp       experiment id, also the module name in js/core/lab/ ('s3')
 * @param {string} o.question  the question the experiment answers, one sentence
 * @param {string[]} o.steps   how it works, a few short numbered steps (HTML)
 * @param {object[]} o.fields  [{key, label, min, max, options?, type?, hint}] — the parameters on screen
 *                             (type 'text' for a free text field)
 * @param {object} o.params    current values, already validated by the page
 * @param {Function} [o.compute]  run synchronously instead of in the worker (S1)
 * @param {(result, params) => {answer: {text, ok}, body: Node[], rows?: object[], summary?: object}} o.view
 */
export function labPanel({ exp, id, title, cats = [], question, steps = [], fields, params, update, compute = null, view, why, notes }) {
  const key = keyOf(exp, params);
  const inputs = {};
  const controls = fields.map((f) => {
    const input = f.options
      ? el('select', {}, f.options.map(([v, label]) => el('option', { value: v, text: label, selected: String(params[f.key]) === String(v) })))
      : f.type === 'text'
        ? el('input', { type: 'text', class: 'wide', value: String(params[f.key]), spellcheck: 'false' })
        : el('input', { type: 'number', class: 'num', min: f.min, max: f.max, value: String(params[f.key]), style: 'width:11ch' });
    inputs[f.key] = input;
    return field(f.label, input);
  });
  const read = () => Object.fromEntries(fields.map((f) => [f.key, inputs[f.key].value]));
  const rerun = () => {
    const changes = read();
    const same = fields.every((f) => String(changes[f.key]) === String(params[f.key]));
    if (same) results.delete(key);
    update(same ? {} : changes);
  };

  // obtain the result: synchronous, cached, or started now in the worker
  const state = compute ? { result: compute(params) } : results.get(key);
  if (!state && !(job && job.key === key)) start(exp, params, key, update);

  const progress = el('progress', { max: 1, value: 0 });
  if (job && job.key === key) job.node = progress;

  let body;
  if (state?.result) {
    const out = view(state.result, params);
    const name = `hw02-${id}-${Object.values(params).join('-')}`;
    body = [
      el('div', { class: `answer ${out.answer.ok === false ? 'warn' : ''}` }, [
        el('div', { class: 'label', text: 'Result' }),
        el('p', { html: out.answer.text }),
      ]),
      ...out.body,
      el('div', { class: 'row', style: 'margin-top:14px' }, [
        out.rows?.length ? el('button', { type: 'button', text: 'Export CSV', onclick: () => download(`${name}.csv`, toCSV(out.rows), 'text/csv') }) : null,
        el('button', { type: 'button', text: 'Export JSON', onclick: () => download(`${name}.json`, JSON.stringify({ experiment: id, params, result: out.summary ?? state.result }, null, 2), 'application/json') }),
        state.seconds ? el('span', { class: 'small muted', text: `computed in ${state.seconds.toFixed(1)} s in a Web Worker` }) : null,
      ]),
    ];
  } else if (state?.error) {
    body = [el('p', { class: 'err', text: `The experiment failed: ${state.error}` })];
  } else if (state?.cancelled) {
    body = [el('p', { class: 'small muted', text: 'Cancelled. Press Run to start again.' })];
  } else {
    body = [el('div', { class: 'running' }, [
      el('span', { class: 'small', text: 'Running in a Web Worker…' }), progress,
      el('button', { type: 'button', text: 'Cancel', onclick: () => job?.cancel() }),
    ])];
  }

  const notesKey = `hw02.notes.${id}`;
  const notesBox = el('textarea', { rows: 3, 'aria-label': `notes on experiment ${id}`, placeholder: 'Your observations on this experiment — kept in this browser only.', oninput: (e) => save(notesKey, e.target.value) }, [load(notesKey, '')]);
  const seeded = fields.some((f) => f.key === 'seed');

  return el('div', { class: 'card lab' }, [
    el('div', { class: 'step-head' }, [el('h2', { text: title }), ...cats.map(badge)]),
    el('p', { class: 'question', html: question }),
    steps.length ? el('div', { class: 'how' }, [
      el('div', { class: 'label', text: 'How the experiment works' }),
      el('ol', {}, steps.map((s) => el('li', { html: s }))),
    ]) : null,
    el('div', { class: 'row' }, [...controls, el('button', { class: 'primary', type: 'button', text: 'Run', onclick: rerun })]),
    el('ul', { class: 'hints' }, [
      ...fields.filter((f) => f.hint).map((f) => el('li', { html: `<strong>${f.label}</strong> — ${f.hint}` })),
      seeded ? el('li', { html: '<strong>seed</strong> — the simulation draws its random numbers from a seeded generator (xoshiro128**): the same seed always gives the same result, a new seed gives an independent run. These are never real keys.' }) : null,
    ]),
    ...body,
    why ? el('p', { class: 'why matters', html: why }) : null,
    notes ? explain(notes) : null,
    el('details', { class: 'explain' }, [el('summary', { text: 'Notes' }), el('div', {}, [notesBox])]),
  ]);
}
