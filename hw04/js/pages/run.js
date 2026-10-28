/* run.js — get a simulation for a page: from the cache if this exact run was
   already made on this page, otherwise started now in the Web Worker. While a
   NEW run computes, the previous result of the same slot (the same panel's
   simulation with other inputs) stays on screen, flagged as updating, so the
   page keeps its layout and the reader keeps their place; when the run ends
   the page redraws in place. Only the very first run of a slot shows a bar. */

import { el } from '../../../assets/js/ui/dom.js';
import { runWorker } from '../../../assets/js/ui/worker.js';

const WORKER = new URL('../workers/sim.js', import.meta.url);
const cache = new Map();   // key -> {result, seconds} | {error} | {cancelled}
const jobs = new Map();    // key -> {cancel, bars, slot}: every panel waiting on it shows a bar
const latest = new Map();  // slot -> the last finished {result, seconds} shown in that slot

/**
 * @param {{model: object, run: object}} spec  modelFrom() arguments and Simulation arguments
 * @param {() => void} redraw  called once the run is finished (or failed)
 * @param {string} [slot]  which panel's simulation this is; a new spec in the same slot
 *                         cancels the slot's older run and shows its last result meanwhile
 * @returns {{result?, seconds?, error?, cancelled?, running?: boolean, stale?: boolean, key: string}}
 */
export function getRun(spec, redraw, slot = 'main') {
  const key = JSON.stringify(spec);
  if (cache.has(key)) {
    const got = cache.get(key);
    if (got.result) latest.set(slot, got);
    return { ...got, key };
  }
  if (!jobs.has(key)) {
    // a newer request in this slot makes the older one pointless
    for (const [k, job] of jobs) if (job.slot === slot) { job.superseded = true; job.cancel(); jobs.delete(k); }
    const started = performance.now();
    const job = { bars: [], slot };
    const handle = runWorker(WORKER, spec, (v) => { for (const b of job.bars) b.value = v; });
    job.cancel = handle.cancel;
    jobs.set(key, job);
    handle.done
      .then((result) => cache.set(key, { result, seconds: (performance.now() - started) / 1000 }))
      .catch((e) => { if (!job.superseded) cache.set(key, e.cancelled ? { cancelled: true } : { error: e.message }); })
      .finally(() => { if (!job.superseded) { jobs.delete(key); redraw(); } });
  }
  const before = latest.get(slot);
  return before ? { ...before, stale: true, running: true, key } : { running: true, key };
}

/** Forget a cancelled or failed run, so asking again starts it afresh. */
export const forget = (spec) => cache.delete(JSON.stringify(spec));

/** A progress bar for a running job (or nothing if it is not running). */
function bar(key) {
  const job = jobs.get(key);
  const b = el('progress', { max: 1, value: 0 });
  if (job) job.bars.push(b);
  return { b, job };
}

/** What a panel shows instead of its results the first time, while there is
 *  nothing to show yet: a progress bar with Cancel, the error, or "cancelled". */
export function pending(state, spec, redraw) {
  if (state.error) return el('p', { class: 'err', text: `The simulation failed: ${state.error}` });
  if (state.cancelled) {
    return el('p', { class: 'small muted' }, ['Cancelled. ',
      el('button', { type: 'button', text: 'Run again', onclick: () => { forget(spec); redraw(); } })]);
  }
  const { b, job } = bar(state.key);
  return el('div', { class: 'running' }, [
    el('span', { class: 'small', text: 'Simulating in a Web Worker…' }), b,
    el('button', { type: 'button', text: 'Cancel', onclick: () => job?.cancel() }),
  ]);
}

/** The flag a panel wears while it shows the previous result and the new one
 *  computes. Positioned over the panel's corner, so nothing below it moves. */
export function updatingFlag(state) {
  if (!state?.stale) return null;
  const { b } = bar(state.key);
  return el('div', { class: 'updating', role: 'status' }, [el('span', { text: 'updating…' }), b]);
}
