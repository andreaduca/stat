/* lab.js — the Web Worker that runs the statistics-lab experiments, so the
   page stays responsive. Message in: {exp, params}. Messages out:
   {type: 'progress', value} (0…1, at most every 1 %), {type: 'done', result},
   {type: 'error', message}. Cancelling = the page terminates the worker. */

self.onmessage = async ({ data: { exp, params } }) => {
  try {
    const { run } = await import(`../core/lab/${exp}.js`);
    let last = -1;
    const progress = (value) => {
      if (value - last >= 0.01 || value === 1) { last = value; self.postMessage({ type: 'progress', value }); }
    };
    self.postMessage({ type: 'done', result: await run(params, progress) });
  } catch (e) {
    self.postMessage({ type: 'error', message: e.message });
  }
};
