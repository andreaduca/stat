/* page.js — the boilerplate every page of every homework repeats: mount the
   shell, read the state out of the URL, re-render when something changes.
   A page module supplies a shell and a render function and nothing else.

   `sticky` names the parameters that describe "what is being looked at"
   (a curve, a dataset, a seed). They are remembered under `memory`, so moving
   to another page of the same homework keeps the subject — while an explicit
   URL always wins over the memory.

   `render` may return the nodes or a Promise of them (a page whose maths is
   asynchronous, such as Web Crypto). Only the latest draw is shown: a slow
   draw that finishes after a newer one is discarded. */

import { el, mountShell } from './dom.js';
import { readParams, writeParams } from './params.js';
import { load, save } from './store.js';

/**
 * @param {object} o
 * @param {object} o.shell     arguments for mountShell
 * @param {(api: {state: object, update: Function, patch: Function}) => Node[]|Promise<Node[]>} o.render
 * @param {string[]} o.sticky  parameters remembered between pages
 * @param {string|null} o.memory  storage key for those parameters
 */
export function startPage({ shell, render, sticky = [], memory = null }) {
  mountShell(shell);
  const root = document.getElementById('app');

  const params = readParams();
  const named = sticky.some((key) => params[key] !== undefined);
  let state = memory && !named ? { ...load(memory, {}), ...params } : params;

  const remember = () => {
    if (!memory) return;
    const keep = {};
    for (const key of sticky) if (state[key] !== undefined) keep[key] = state[key];
    save(memory, keep);
  };

  /** Change the state and the URL without redrawing — for controls that must
   *  not interrupt what is on screen, such as an animation speed. */
  const patch = (changes) => {
    state = { ...state, ...changes };
    for (const [key, value] of Object.entries(changes)) if (value === null) delete state[key];
    writeParams(changes);
    remember();
  };

  const show = (nodes) => root.replaceChildren(...[].concat(nodes).filter(Boolean));
  // an asynchronous render that fails says so on the page (tools/check.mjs looks for .page-error)
  const failed = (e) => show(el('div', { class: 'card' }, [el('p', { class: 'err page-error', text: e.message })]));
  let drawn = 0;

  const api = {
    get state() { return state; },
    patch,
    update(changes) { patch(changes); return api.draw(); },
    /** Returns a Promise that settles once this draw is on screen (or superseded). */
    draw() {
      const ticket = ++drawn;
      const out = render(api);
      if (typeof out?.then !== 'function') { show(out); return Promise.resolve(); }
      return out.then((nodes) => { if (ticket === drawn) show(nodes); },
                      (e) => { if (ticket === drawn) failed(e); });
    },
  };

  remember();
  api.draw();
  return api;
}
