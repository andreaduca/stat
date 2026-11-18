/* sim.js — the Web Worker that runs hw07's experiments, so the page stays
   responsive. Message in: {kind, args} (kind names a function of
   core/experiments.js, args its plain arguments). Messages out
   (assets/js/ui/worker.js protocol): {type: 'progress', value},
   {type: 'done', result}, {type: 'error', message}. */

import * as X from '../core/experiments.js';

const KINDS = {
  stickyPower: X.stickyPower, stickyPowerTable: X.stickyPowerTable, miBias: X.miBias,
  sideChannelRuns: X.sideChannelRuns, otpRuns: X.otpRuns, typeOne: X.typeOne,
};

/* every typed array in the result, so they are handed over rather than copied */
function buffers(v, out = []) {
  if (ArrayBuffer.isView(v)) out.push(v.buffer);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) buffers(v[k], out);
  return out;
}

self.onmessage = ({ data }) => {
  try {
    const run = KINDS[data.kind];
    if (!run) throw new Error(`unknown experiment ${data.kind}`);
    const result = run({ ...data.args, onProgress: (value) => self.postMessage({ type: 'progress', value }) });
    self.postMessage({ type: 'done', result }, [...new Set(buffers(result))]);
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
