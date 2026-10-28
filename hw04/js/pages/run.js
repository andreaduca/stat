/* run.js — get a simulation for a page: from the cache if this exact run was
   already made on this page, otherwise started now in the Web Worker. While it
   runs the page shows a progress bar; when it ends the page redraws itself.
   Several runs may be in flight at once (the CLT page compares two m). */

import { el } from '../../../assets/js/ui/dom.js';
import { runWorker } from '../../../assets/js/ui/worker.js';

const WORKER = new URL('../workers/sim.js', import.meta.url);
const cache = new Map();   // key -> {result, seconds} | {error} | {cancelled}
const jobs = new Map();    // key -> {cancel, bar}

/**
 * @param {{model: object, run: object}} spec  modelFrom() arguments and Simulation arguments
 * @param {() => void} redraw  called once the run is finished (or failed)
 * @returns {{result?, seconds?, error?, cancelled?, running?: boolean}}
 */
export function getRun(spec, redraw) {
  const key = JSON.stringify(spec);
  if (cache.has(key)) return cache.get(key);
  if (!jobs.has(key)) {
    const started = performance.now();
    const job = { bar: null };
    const handle = runWorker(WORKER, spec, (v) => { if (job.bar) job.bar.value = v; });
    job.cancel = handle.cancel;
    jobs.set(key, job);
    handle.done
      .then((result) => cache.set(key, { result, seconds: (performance.now() - started) / 1000 }))
      .catch((e) => cache.set(key, e.cancelled ? { cancelled: true } : { error: e.message }))
      .finally(() => { jobs.delete(key); redraw(); });
  }
  return { running: true, key };
}

/** Forget a cancelled or failed run, so asking again starts it afresh. */
export const forget = (spec) => cache.delete(JSON.stringify(spec));

/** What a panel shows instead of its results while the run is not there:
 *  a progress bar with Cancel, the error, or "cancelled" with a way back. */
export function pending(state, spec, redraw) {
  if (state.error) return el('p', { class: 'err', text: `The simulation failed: ${state.error}` });
  if (state.cancelled) {
    return el('p', { class: 'small muted' }, ['Cancelled. ',
      el('button', { type: 'button', text: 'Run again', onclick: () => { forget(spec); redraw(); } })]);
  }
  const job = jobs.get(state.key);
  const bar = el('progress', { max: 1, value: 0 });
  if (job) job.bar = bar;
  return el('div', { class: 'running' }, [
    el('span', { class: 'small', text: 'Simulating in a Web Worker…' }), bar,
    el('button', { type: 'button', text: 'Cancel', onclick: () => job?.cancel() }),
  ]);
}
