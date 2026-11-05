/* run-input.js — the one set of inputs every experiment page of hw04 shares:
   the step model (and p), the number of attackers m, the seed, and Run, in the
   shared input dock (assets/js/ui/dock.js). It also reads and validates those
   parameters from the page state, so every page agrees on the defaults. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { nice } from '../../../assets/js/ui/format.js';
import { inputDock, show, onCommit } from '../../../assets/js/ui/dock.js';

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

/** One line saying which run is on screen. */
const summary = (run) => `${run.model === 'ber' ? `Bernoulli(${run.p})` : 'Rademacher ±1'} · m = ${nice(run.m)} attackers · seed ${run.seed}`;

/** The shared inputs: model and p, attackers m, seed. */
const RUN = {
  id: 'run',
  build(apply, later) {
    const model = el('select', { 'aria-label': 'step model' }, [
      el('option', { value: 'rad', text: 'Rademacher ±1' }),
      el('option', { value: 'ber', text: 'Bernoulli(p) 0/1' }),
    ]);
    const p = el('input', { type: 'number', class: 'num p-in', min: 0.01, max: 0.99, step: 0.01, 'aria-label': 'p' });
    const m = el('select', { 'aria-label': 'attackers m' }, M_PRESETS.map((v) => el('option', { value: v, text: nice(v) })));
    const seed = el('input', { type: 'number', class: 'num seed-in', min: 0, max: 4294967295, step: 1, 'aria-label': 'seed' });
    const go = () => apply({ model: model.value, p: model.value === 'ber' ? p.value : null, m: m.value, seed: seed.value });

    model.addEventListener('change', () => { p.disabled = model.value !== 'ber'; go(); });
    m.addEventListener('change', go);
    onCommit(p, go, later);
    onCommit(seed, go, later);
    const presets = el('div', { class: 'row tight' }, P_PRESETS.map((v) =>
      el('button', { type: 'button', class: 'mini', text: String(v), 'aria-label': `Bernoulli with p = ${v}`, onclick: () => apply({ model: 'ber', p: v }) })));

    return {
      nodes: [el('div', { class: 'row' }, [
        field('step model', model),
        field('p = P(Xᵢ = 1)', p),
        presets,
        el('div', { class: 'vrule' }),
        field('attackers m', m),
        el('div', { class: 'vrule' }),
        field('seed', seed),
        el('button', { type: 'button', text: 'New seed', onclick: () => apply({ seed: freshSeed() }) }),
        el('button', { type: 'button', class: 'primary', text: 'Run', onclick: go }),
      ])],
      refresh(r) {
        show(model, r.model);
        show(p, r.p);
        p.disabled = r.model !== 'ber';
        show(m, r.m);
        show(seed, r.seed);
      },
    };
  },
  summary,
  notes: [
    'Every change applies at once and the charts above redraw in place: the previous result stays on screen, marked "updating…", until the new one is ready. The inputs are shared by all the pages of this homework.',
    '<strong>Rademacher</strong>: each step is +1 (the attacker gains ground) or −1 (the defender pushes back), each with probability ½. The mean is 0 and the variance is 1: the symmetric case of the assignment.',
    '<strong>Bernoulli(p)</strong>: each step is 1 (the system is penetrated) with probability p, else 0. The mean is p and the variance p(1 − p). The arrows move p by 0.01; type a value for anything finer (down to 0.001). The presets 0.5, 0.1 and 0.01 go from a fair coin to rare breaches.',
    '<strong>m</strong> plays two roles. In the story it is the number of attackers. In the statistics it is the number of replications: the error of everything measured on these pages shrinks like 1/√m. Small m (5, 20, 100) shows how unreliable a few attackers are; 10⁴ is the working size.',
    '<strong>seed</strong>: the simulation uses xoshiro128**, a fast seeded generator, not a cryptographic one. A simulation needs reproducibility, not secrecy. "New seed" draws a seed from <code>crypto.getRandomValues</code>; that is the only real randomness on these pages.',
  ],
};

/**
 * The input dock, fixed at the bottom of the window (see assets/js/ui/dock.js).
 * @param {ReturnType<typeof readRun>} run  current values
 * @param {(changes: object) => void} update
 * @returns {null}  nothing to place in the page: the dock mounts itself
 */
export const runCard = (run, update) => inputDock({ id: 'hw04', title: 'Simulation', sections: [RUN], values: { run }, update });
