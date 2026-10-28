/* sim.js — the Web Worker that runs a Simulation, so the page stays
   responsive while 10⁸ steps are drawn. Message in: {model, run} (the
   arguments of modelFrom and of the Simulation constructor, minus the model).
   Messages out (assets/js/ui/worker.js protocol): {type: 'progress', value},
   {type: 'done', result}, {type: 'error', message}. */

import { modelFrom } from '../core/models.js';
import { Simulation } from '../core/simulate.js';

self.onmessage = ({ data }) => {
  try {
    const sim = new Simulation({ ...data.run, model: modelFrom(data.model) });
    const result = sim.run((value) => self.postMessage({ type: 'progress', value }));
    // hand the big arrays over instead of copying them
    const buffers = [result.S, result.maxS, result.hitTime, result.pj].filter(Boolean).map((a) => a.buffer);
    self.postMessage({ type: 'done', result }, buffers);
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
