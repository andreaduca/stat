/* ecdlp.js — the Web Worker for the toy-ECC attacks, so the page stays
   responsive. Messages in:
     {job: 'attack', method, x, y, range}       recover d from Q = (x, y), d ∈ [1, range]
     {job: 'experiment', method, reps, seed}    the timing experiment for one method
   Messages out (assets/js/ui/worker.js protocol): {type: 'progress', value},
   {type: 'done', result}, {type: 'error', message}. BigInts cross intact. */

import { Point } from '../../../assets/js/core/curve.js';
import { METHODS, experiment } from '../core/ecdlp.js';

self.onmessage = ({ data }) => {
  try {
    const progress = (value) => self.postMessage({ type: 'progress', value });
    const result = data.job === 'attack'
      ? METHODS.find((m) => m.id === data.method).run(new Point(data.x, data.y), data.range, progress)
      : experiment(data, progress);
    self.postMessage({ type: 'done', result });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
