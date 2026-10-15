/* worker.js — run one job in a module Web Worker and get a cancellable
   promise back. Protocol (see hw02/js/workers/lab.js): the worker posts
   {type: 'progress', value}, then {type: 'done', result} or
   {type: 'error', message}. Cancelling terminates the worker outright. */

/**
 * @param {URL|string} url  the worker module
 * @param {object} message  posted once to start the job
 * @param {(fraction: number) => void} [onProgress]
 * @returns {{done: Promise<any>, cancel: () => void}}
 */
export function runWorker(url, message, onProgress = () => {}) {
  const worker = new Worker(url, { type: 'module' });
  let settle = null;
  const done = new Promise((resolve, reject) => {
    settle = { resolve, reject };
    worker.addEventListener('message', ({ data }) => {
      if (data.type === 'progress') onProgress(data.value);
      else if (data.type === 'done') { worker.terminate(); resolve(data.result); }
      else if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
    });
    worker.addEventListener('error', (e) => { worker.terminate(); reject(new Error(e.message || 'the worker failed to start')); });
  });
  worker.postMessage(message);
  return {
    done,
    cancel() { worker.terminate(); settle.reject(Object.assign(new Error('cancelled'), { cancelled: true })); },
  };
}
