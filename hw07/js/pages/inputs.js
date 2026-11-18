/* inputs.js — the input every page of hw07 shares (the seed of the simulations),
   in the input dock at the bottom of the window (assets/js/ui/dock.js), plus the
   reader of the significance level α, which several pages set in their own row
   with their own default. A value out of range is rejected with a reason, never
   silently clamped. A page's own controls go in a second section, "this page". */

import { el, field } from '../../../assets/js/ui/dom.js';
import { inputDock, show, onCommit, numberOr, freshSeed } from '../../../assets/js/ui/dock.js';

export { rejected } from '../../../assets/js/ui/dock.js';

export const DEFAULTS = { seed: 20261117 };

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
 * The significance level of a page: 0.05 for real data (Berkeley, a CSV), 0.01 for
 * the generators and the side channels, where many tests are run (draft §5).
 * @returns {{alpha: number, error: string|null}}
 */
export function readAlpha(state, fallback) {
  const alpha = numberOr(state.alpha, fallback);
  const error = alpha >= 0.001 && alpha <= 0.1 ? null : `α must be between 0.001 and 0.1 (got ${alpha}).`;
  return { alpha, error };
}

const SHARED = {
  id: 'shared',
  build(apply, later) {
    const seed = el('input', { type: 'number', class: 'num seed-in', min: 0, 'aria-label': 'seed' });
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
    '<strong>seed</strong>: the simulated data (generator outputs, side-channel traces, causal models) use xoshiro128**, a fast seeded generator, not a cryptographic one: a simulation needs reproducibility, not secrecy. "New seed" draws one from <code>crypto.getRandomValues</code>, the only real randomness on these pages. The Berkeley counts and a loaded CSV do not depend on it.',
  ],
};

/**
 * Mount or refresh the dock; returns null, so it takes no place in the page.
 * @param {object|null} [page]  the page's own section ({id, label: 'this page', build, summary, notes}), its value as pageValue
 */
export const dock = (inputs, update, page = null, pageValue = null) => inputDock({
  id: 'hw07', title: 'Inputs', update,
  sections: page ? [SHARED, page] : [SHARED],
  values: { shared: inputs, ...(page ? { [page.id]: pageValue } : {}) },
  message: inputs.error ? { text: `Rejected: ${inputs.error}`, kind: 'err' } : null,
});
