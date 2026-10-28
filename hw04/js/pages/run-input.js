/* run-input.js — the one input card every experiment page of hw04 opens with:
   the step model (and p), the number of attackers m, the seed, and Run. It
   also reads and validates those parameters from the page state, so every
   page agrees on the defaults. A page adds its own controls as extra rows. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';

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

/**
 * @param {ReturnType<typeof readRun>} run  current values
 * @param {(changes: object) => void} update
 * @param {Node[]} [extraRows]  the page's own controls, under the shared ones
 */
export function runCard(run, update, extraRows = []) {
  const model = el('select', { 'aria-label': 'step model' }, [
    el('option', { value: 'rad', text: 'Rademacher ±1', selected: run.model === 'rad' }),
    el('option', { value: 'ber', text: 'Bernoulli(p) 0/1', selected: run.model === 'ber' }),
  ]);
  const p = el('input', { type: 'number', class: 'num', min: 0.001, max: 0.999, step: 'any', value: String(run.p), disabled: run.model !== 'ber' });
  model.addEventListener('change', () => { p.disabled = model.value !== 'ber'; });
  const presets = el('div', { class: 'row tight' }, P_PRESETS.map((v) =>
    el('button', { type: 'button', class: 'mini', text: String(v), 'aria-label': `p = ${v}`, onclick: () => update({ model: 'ber', p: v }) })));
  const m = el('select', { 'aria-label': 'attackers m' }, M_PRESETS.map((v) =>
    el('option', { value: v, text: v.toLocaleString('en-US').replace(/,/g, ' '), selected: v === run.m })));
  const seed = el('input', { type: 'number', class: 'num', min: 0, max: 4294967295, step: 1, value: String(run.seed), style: 'width:13ch' });
  const go = () => update({ model: model.value, p: model.value === 'ber' ? p.value : null, m: m.value, seed: seed.value });

  return el('div', { class: 'card' }, [
    el('div', { class: 'row' }, [
      field('step model', model),
      field('p = P(Xᵢ = 1)', p),
      presets,
      el('div', { class: 'vrule' }),
      field('attackers m', m),
      el('div', { class: 'vrule' }),
      field('seed', seed),
      el('button', { type: 'button', text: 'New seed', onclick: () => update({ seed: freshSeed() }) }),
      el('button', { type: 'button', class: 'primary', text: 'Run', onclick: go }),
    ]),
    el('p', { class: 'small muted', style: 'margin:10px 0 0', html:
      'The <strong>model</strong> says what one probe of one system scores. <strong>m</strong> is the number of attackers, each an independent path through the systems. ' +
      'The <strong>seed</strong> fixes the random numbers: the same seed gives the same run on every page.' }),
    ...extraRows,
    explain([
      '<strong>Rademacher</strong>: each step is +1 (the attacker gains ground) or −1 (the defender pushes back), each with probability ½. The mean is 0 and the variance is 1: the symmetric case of the assignment.',
      '<strong>Bernoulli(p)</strong>: each step is 1 (the system is penetrated) with probability p, else 0. The mean is p and the variance p(1 − p). The presets 0.5, 0.1 and 0.01 go from a fair coin to rare breaches.',
      '<strong>m</strong> plays two roles. In the story it is the number of attackers. In the statistics it is the number of replications: the error of everything measured on these pages shrinks like 1/√m. Small m (5, 20, 100) shows how unreliable a few attackers are; 10⁴ is the working size.',
      '<strong>seed</strong>: the simulation uses xoshiro128**, a fast seeded generator, not a cryptographic one. A simulation needs reproducibility, not secrecy. "New seed" draws a seed from <code>crypto.getRandomValues</code>; that is the only real randomness on these pages.',
    ], 'What does each value change?'),
  ]);
}
