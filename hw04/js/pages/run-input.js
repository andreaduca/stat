/* run-input.js — the one set of inputs every experiment page of hw04 shares:
   the step model (and p), the number of attackers m, the seed, and Run. It is
   a dock fixed to the bottom of the window, so the inputs stay next to
   whatever chart is being watched; it folds down to a one-line summary (the
   choice is remembered in this browser). It also reads and validates those
   parameters from the page state, so every page agrees on the defaults. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { load, save } from '../../../assets/js/ui/store.js';

export const M_PRESETS = [5, 20, 100, 1000, 10000, 100000];
export const P_PRESETS = [0.5, 0.1, 0.01];
export const DEFAULT_SEED = 20261028;

const num = (v, fallback) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? fallback : Number(v));

/** The run a page is looking at, from its state, with every value made valid. */
export function readRun(state) {
  const model = state.model === 'ber' ? 'ber' : 'rad';
  const p = Math.min(0.999, Math.max(0.001, num(state.p, 0.5)));
  const m = Math.min(100000, Math.max(5, Math.round(num(state.m, 10000))));
  const seed = Math.max(0, Math.min(4294967295, Math.round(num(state.seed, DEFAULT_SEED))));
  return { model, p: model === 'ber' ? p : 0.5, m, seed };
}

/** A fresh seed from the browser's CSPRNG — the only use of real randomness on
 *  these pages: it picks WHICH reproducible run to look at. */
export function freshSeed() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0];
}

const FOLD_KEY = 'hw04.dock.folded';
const nice = (v) => v.toLocaleString('en-US').replace(/,/g, '\u202f');

/** One line saying which run is on screen. */
const summary = (run) => `${run.model === 'ber' ? `Bernoulli(${run.p})` : 'Rademacher ±1'} · m = ${nice(run.m)} attackers · seed ${run.seed}`;

/* The dock is built once per page and lives outside #app, so a redraw of the
   page never rebuilds it: the control being used keeps its focus, and only the
   summary line and the values that came from the URL are refreshed. */
let dock = null;

/**
 * The input dock, fixed at the bottom of the window. Changing a value applies it
 * at once (numbers after a short pause, so a few clicks on the arrows make one run).
 * @param {ReturnType<typeof readRun>} run  current values
 * @param {(changes: object) => void} update
 * @returns {null}  nothing to place in the page: the dock mounts itself
 */
export function runCard(run, update) {
  if (dock) { dock.refresh(run); dock.update = update; return null; }

  const apply = (changes) => dock.update(changes);
  let timer = null;
  const later = (fn) => { clearTimeout(timer); timer = setTimeout(fn, 450); };

  const model = el('select', { 'aria-label': 'step model' }, [
    el('option', { value: 'rad', text: 'Rademacher ±1' }),
    el('option', { value: 'ber', text: 'Bernoulli(p) 0/1' }),
  ]);
  const p = el('input', { type: 'number', class: 'num p-in', min: 0.01, max: 0.99, step: 0.01, 'aria-label': 'p' });
  const m = el('select', { 'aria-label': 'attackers m' }, M_PRESETS.map((v) => el('option', { value: v, text: nice(v) })));
  const seed = el('input', { type: 'number', class: 'num seed-in', min: 0, max: 4294967295, step: 1, 'aria-label': 'seed' });
  const go = () => { clearTimeout(timer); apply({ model: model.value, p: model.value === 'ber' ? p.value : null, m: m.value, seed: seed.value }); };

  model.addEventListener('change', () => { p.disabled = model.value !== 'ber'; go(); });
  m.addEventListener('change', go);
  for (const input of [p, seed]) {
    input.addEventListener('change', () => later(go));           // arrows, or leaving the field
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }
  const presets = el('div', { class: 'row tight' }, P_PRESETS.map((v) =>
    el('button', { type: 'button', class: 'mini', text: String(v), 'aria-label': `Bernoulli with p = ${v}`, onclick: () => apply({ model: 'ber', p: v }) })));

  const node = el('section', { class: 'card run-dock', 'aria-label': 'simulation inputs' });
  const summaryNode = el('span', { class: 'dock-summary' });
  const toggle = el('button', { type: 'button', class: 'mini dock-toggle', onclick: () => fold(!node.classList.contains('folded')) });
  const fold = (folded) => {
    save(FOLD_KEY, folded);
    if (folded) node.classList.add('folded'); else node.classList.remove('folded');
    toggle.textContent = folded ? '▴ Edit inputs' : '▾ Fold';
    toggle.setAttribute('aria-expanded', String(!folded));
  };

  node.append(
    el('div', { class: 'dock-head' }, [el('span', { class: 'dock-title', text: 'Simulation' }), summaryNode, toggle]),
    el('div', { class: 'dock-body' }, [
      el('div', { class: 'row' }, [
        field('step model', model),
        field('p = P(Xᵢ = 1)', p),
        presets,
        el('div', { class: 'vrule' }),
        field('attackers m', m),
        el('div', { class: 'vrule' }),
        field('seed', seed),
        el('button', { type: 'button', text: 'New seed', onclick: () => apply({ seed: freshSeed() }) }),
        el('button', { type: 'button', class: 'primary', text: 'Run', onclick: go }),
      ]),
      explain([
        'Every change applies at once and the charts above redraw in place: the previous result stays on screen, marked "updating…", until the new one is ready. The inputs are shared by all the pages of this homework.',
        '<strong>Rademacher</strong>: each step is +1 (the attacker gains ground) or −1 (the defender pushes back), each with probability ½. The mean is 0 and the variance is 1: the symmetric case of the assignment.',
        '<strong>Bernoulli(p)</strong>: each step is 1 (the system is penetrated) with probability p, else 0. The mean is p and the variance p(1 − p). The arrows move p by 0.01; type a value for anything finer (down to 0.001). The presets 0.5, 0.1 and 0.01 go from a fair coin to rare breaches.',
        '<strong>m</strong> plays two roles. In the story it is the number of attackers. In the statistics it is the number of replications: the error of everything measured on these pages shrinks like 1/√m. Small m (5, 20, 100) shows how unreliable a few attackers are; 10⁴ is the working size.',
        '<strong>seed</strong>: the simulation uses xoshiro128**, a fast seeded generator, not a cryptographic one. A simulation needs reproducibility, not secrecy. "New seed" draws a seed from <code>crypto.getRandomValues</code>; that is the only real randomness on these pages.',
      ], 'What does each value change?'),
    ]),
  );

  dock = { node, update };
  /* bring the controls in line with the run on screen, without touching the one being edited */
  dock.refresh = (r) => {
    summaryNode.textContent = summary(r);
    const busy = (x) => typeof document !== 'undefined' && document.activeElement === x;
    if (!busy(model)) model.value = r.model;
    if (!busy(p)) p.value = String(r.p);
    p.disabled = r.model !== 'ber';
    if (!busy(m)) m.value = String(r.m);
    if (!busy(seed)) seed.value = String(r.seed);
  };
  dock.refresh(run);
  fold(load(FOLD_KEY, false) === true);
  document.body.append(node);
  return null;
}
