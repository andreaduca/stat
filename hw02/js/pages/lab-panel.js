/* lab-panel.js — hw02's statistics-lab experiments in the shared frame
   (assets/js/ui/lab.js): parameters drawn from a field list (N and the seed
   always among them), a run in the Web Worker with a progress bar and a
   cancel button, and results cached per parameter set, so redrawing the page
   never reruns. Also the small helpers the evidence sections use. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { runWorker } from '../../../assets/js/ui/worker.js';
import { labPanel as frame, running } from '../../../assets/js/ui/lab.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { chartLegend } from '../../../assets/js/ui/linechart.js';
import { badge } from './widgets.js';

export { section, table } from '../../../assets/js/ui/lab.js';
export { pctSig as pct } from '../../../assets/js/ui/format.js';

/* ---------- small helpers for the evidence sections of an experiment ---------- */

export const MEASURED = 'var(--s1)', THEORY = 'var(--s2)';
export const pf = (p) => (p < 0.001 ? '< 0.001' : p.toFixed(3));
export const chart = (opts) => el('div', {}, [barChart(opts), chartLegend([...opts.series, ...(opts.overlay ? [opts.overlay] : [])])]);
/** ok / not-ok text (hw02's own: the words carry the meaning, without ✓/✗). */
export const verdict = (ok, yes, no) => el('span', { class: ok ? 'ok' : 'err', text: ok ? yes : no });

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

/* ---------- running an experiment ---------- */

const WORKER = new URL('../workers/lab.js', import.meta.url);
const results = new Map();       // "S3 {n,seed}" -> result
let job = null;                  // the running experiment: {key, cancel, progress node, started}

const keyOf = (exp, params) => `${exp} ${JSON.stringify(params)}`;

function start(exp, params, key, update) {
  if (job) job.cancel();
  const run = { key, node: null, started: performance.now() };
  const handle = runWorker(WORKER, { exp, params }, (v) => { if (run.node) run.node.value = v; });
  run.cancel = handle.cancel;
  job = run;
  handle.done
    .then((result) => { results.set(key, { result, seconds: (performance.now() - run.started) / 1000 }); })
    .catch((e) => { if (!e.cancelled) results.set(key, { error: e.message }); else results.set(key, { cancelled: true }); })
    .finally(() => { if (job === run) job = null; update({}); });
}

/**
 * An experiment of the statistics lab, in the shared frame.
 * @param {object} o
 * @param {string} o.exp       experiment id, also the module name in js/core/lab/ ('s3')
 * @param {string} o.id        the id shown and used for the Notes and export names ('S3')
 * @param {string[]} [o.cats]  category badges beside the title
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
  const rerun = () => {
    const changes = Object.fromEntries(fields.map((f) => [f.key, inputs[f.key].value]));
    const same = fields.every((f) => String(changes[f.key]) === String(params[f.key]));
    if (same) results.delete(key);
    update(same ? {} : changes);
  };

  // obtain the result: synchronous, cached, or started now in the worker
  const state = compute ? { result: compute(params) } : results.get(key);
  if (!state && !(job && job.key === key)) start(exp, params, key, update);

  let waiting = null;
  if (state?.error) waiting = el('p', { class: 'err', text: `The experiment failed: ${state.error}` });
  else if (state?.cancelled) waiting = el('p', { class: 'small muted', text: 'Cancelled. Press Run to start again.' });
  else if (!state?.result) {
    const bar = el('progress', { max: 1, value: 0 });
    if (job && job.key === key) job.node = bar;
    waiting = running('Running in a Web Worker…', bar, () => job?.cancel());
  }

  const seeded = fields.some((f) => f.key === 'seed');
  return frame({
    hw: 'hw02', id, title, head: cats.map(badge), question, steps,
    controls: [...controls, el('button', { class: 'primary', type: 'button', text: 'Run', onclick: rerun })],
    hints: [
      ...fields.filter((f) => f.hint).map((f) => `<strong>${f.label}</strong> — ${f.hint}`),
      seeded ? '<strong>seed</strong> — the simulation draws its random numbers from a seeded generator (xoshiro128**): the same seed always gives the same result, a new seed gives an independent run. These are never real keys.' : null,
    ].filter(Boolean),
    waiting,
    view: state?.result ? () => view(state.result, params) : null,
    name: `${id}-${Object.values(params).join('-')}`,
    json: (out) => ({ experiment: id, params, result: out.summary ?? state.result }),
    extra: state?.seconds ? [el('span', { class: 'small muted', text: `computed in ${state.seconds.toFixed(1)} s in a Web Worker` })] : [],
    why, notes,
  });
}
