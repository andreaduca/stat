/* page.js — the boilerplate every page of every homework repeats: mount the
   shell, read the state out of the URL, re-render when something changes.
   A page module supplies a shell and a render function and nothing else.

   `sticky` names the parameters that describe "what is being looked at"
   (a curve, a dataset, a seed). They are remembered under `memory`, so moving
   to another page of the same homework keeps the subject — while an explicit
   URL always wins over the memory. */

import { mountShell } from './dom.js';
import { readParams, writeParams } from './params.js';
import { load, save } from './store.js';

/**
 * @param {object} o
 * @param {object} o.shell     arguments for mountShell
 * @param {(api: {state: object, update: Function, patch: Function}) => Node[]} o.render
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

  const api = {
    get state() { return state; },
    patch,
    update(changes) { patch(changes); api.draw(); },
    draw() { root.replaceChildren(...[].concat(render(api)).filter(Boolean)); },
  };

  remember();
  api.draw();
  return api;
}
