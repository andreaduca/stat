/* lab-panel.js — the frame every statistics-lab experiment shares: its
   parameters (N and the seed always among them), a run in the Web Worker with
   a progress bar and a cancel button, the results (plot, table, estimates with
   theory alongside), a Notes box kept in this browser, and CSV / JSON export.
   Results are cached per parameter set, so redrawing the page never reruns. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { runWorker } from '../../../assets/js/ui/worker.js';
import { toCSV, download } from '../../../assets/js/ui/export.js';
import { load, save } from '../../../assets/js/ui/store.js';
import { badge } from './widgets.js';

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
 * @param {object} o
 * @param {string} o.exp       experiment id, also the module name in js/core/lab/ ('s3')
 * @param {object[]} o.fields  [{key, label, min, max, options?}] — the parameters on screen
 * @param {object} o.params    current values, already validated by the page
 * @param {Function} [o.compute]  run synchronously instead of in the worker (S1)
 * @param {(result, params) => {body: Node[], rows?: object[], summary?: object}} o.view
 */
export function labPanel({ exp, id, title, cats = [], formula, fields, params, update, compute = null, view, why, notes }) {
  const key = keyOf(exp, params);
  const inputs = {};
  const controls = fields.map((f) => {
    const input = f.options
      ? el('select', {}, f.options.map(([v, label]) => el('option', { value: v, text: label, selected: String(params[f.key]) === String(v) })))
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
  let state = compute ? { result: compute(params) } : results.get(key);
  if (!state && !(job && job.key === key)) start(exp, params, key, update);

  const progress = el('progress', { max: 1, value: 0 });
  if (job && job.key === key) job.node = progress;

  let body;
  if (state?.result) {
    const out = view(state.result, params);
    const name = `hw02-${id}-${Object.values(params).join('-')}`;
    body = [
      ...out.body,
      el('div', { class: 'row', style: 'margin-top:12px' }, [
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
  const notesBox = el('textarea', { rows: 3, placeholder: 'Your observations on this experiment — kept in this browser only.', oninput: (e) => save(notesKey, e.target.value) }, [load(notesKey, '')]);

  return el('div', { class: 'card' }, [
    el('div', { class: 'step-head' }, [el('h2', { text: title }), ...cats.map(badge)]),
    formula ? el('p', { class: 'formula', html: formula }) : null,
    el('div', { class: 'row' }, [...controls, el('button', { class: 'primary', type: 'button', text: 'Run', onclick: rerun })]),
    fields.some((f) => f.key === 'seed')
      ? el('p', { class: 'small muted', style: 'margin:8px 0 14px', text: 'Simulation randomness comes from a seeded generator (xoshiro128**): the same seed and parameters always give the same result. Simulation keys are never real keys.' })
      : el('div', { style: 'height:14px' }),
    ...body,
    why ? el('p', { class: 'why matters', html: why }) : null,
    notes ? explain(notes) : null,
    el('details', { class: 'explain' }, [el('summary', { text: 'Notes' }), el('div', {}, [notesBox])]),
  ]);
}
