/* inputs.js — the input every page of hw06 shares (the seed of the simulations),
   in the input dock at the bottom of the window (assets/js/ui/dock.js), plus the
   readers of the page-specific values that more than one page uses (the function
   and the sizes N, K of Ex. 1). A value out of range is rejected with a reason,
   never silently clamped. A page's own controls go in a second section,
   labelled "this page". */

import { el, field } from '../../../assets/js/ui/dom.js';
import { inputDock, show, onCommit, numberOr, freshSeed } from '../../../assets/js/ui/dock.js';
import { FUNCTION_IDS } from '../core/functions.js';

export { rejected } from '../../../assets/js/ui/dock.js';

export const DEFAULTS = { f: 'f1', N: 100, K: 100, seed: 20261111 };

/**
 * The shared inputs, from the page state.
 * @returns {{seed: number, error: string|null}}  error says why a value was rejected
 */
export function readInputs(state) {
  const seed = Math.round(numberOr(state.seed, DEFAULTS.seed));
  let error = null;
  if (!(seed >= 0 && seed <= 4294967295)) error = `the seed must be an integer between 0 and 4 294 967 295 (got ${seed}).`;
  return { seed, error };
}

/**
 * The Ex. 1 selection (function, cells N, levels K), from the page state.
 * @returns {{f: string, N: number, K: number, error: string|null}}
 */
export function readIntegration(state) {
  const f = FUNCTION_IDS.includes(state.f) ? state.f : DEFAULTS.f;
  const N = Math.round(numberOr(state.N, DEFAULTS.N)), K = Math.round(numberOr(state.K, DEFAULTS.K));
  let error = null;
  if (state.f && !FUNCTION_IDS.includes(state.f)) error = `unknown function "${state.f}" (one of ${FUNCTION_IDS.join(', ')}).`;
  else if (!(N >= 2 && N <= 100000)) error = `N must be between 2 and 100 000 (got ${N}).`;
  else if (!(K >= 2 && K <= 100000)) error = `K must be between 2 and 100 000 (got ${K}).`;
  return { f, N, K, error };
}

const SHARED = {
  id: 'shared',
  build(apply, later) {
    const seed = el('input', { type: 'number', class: 'num', min: 0, 'aria-label': 'seed' });
    onCommit(seed, () => apply({ seed: seed.value }), later);
    return {
      nodes: [el('div', { class: 'row' }, [
        field('seed', seed),
        el('button', { type: 'button', text: 'New seed', onclick: () => apply({ seed: freshSeed() }) }),
      ])],
      refresh(v) { show(seed, v.seed); },
    };
  },
  summary: (v) => `seed ${v.seed}`,
  notes: [
    'Every change applies at once and the charts redraw in place: the previous result stays on screen, marked "updating…", until the new one is ready. The seed is shared by all the pages of this homework.',
    '<strong>seed</strong>: the simulations (Monte Carlo measures, random tags, sampled p-values, the lattice sampler) use xoshiro128**, a fast seeded generator, not a cryptographic one: a simulation needs reproducibility, not secrecy. "New seed" draws one from <code>crypto.getRandomValues</code>, the only real randomness on these pages. The deterministic numerics (Riemann and Lebesgue rules, Φ) do not depend on it.',
  ],
};

/**
 * Mount or refresh the dock; returns null, so it takes no place in the page.
 * @param {object|null} [page]  the page's own section ({id, label: 'this page', build, summary, notes}), its value as pageValue
 */
export const dock = (inputs, update, page = null, pageValue = null) => inputDock({
  id: 'hw06', title: 'Inputs', update,
  sections: page ? [SHARED, page] : [SHARED],
  values: { shared: inputs, ...(page ? { [page.id]: pageValue } : {}) },
  message: inputs.error ? { text: `Rejected: ${inputs.error}`, kind: 'err' } : null,
});
