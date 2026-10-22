/* experiment.js — the Web Worker that runs the Caesar success-vs-length
   experiment, so the page stays responsive. Message in: {T, seed}.
   Messages out (assets/js/ui/worker.js protocol): {type: 'progress', value},
   {type: 'done', result}, {type: 'error', message}. */

import { loadModel, loadQuadgrams, loadTest } from '../core/data.js';
import { buildLanguage, experiment } from '../core/attack.js';

self.onmessage = async ({ data }) => {
  try {
    const [model, quad, test] = await Promise.all([loadModel(), loadQuadgrams(), loadTest()]);
    const L = buildLanguage(model, quad);
    const result = experiment(data, L, test, (value) => self.postMessage({ type: 'progress', value }));
    self.postMessage({ type: 'done', result });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
