/* inputs.js — the inputs every experiment page of hw05 shares, in the input
   dock at the bottom of the window (assets/js/ui/dock.js): the score
   distribution (and its parameter), the number of hackers m, the systems per
   hacker n, and the seed. It also reads and validates them from the page
   state, so every page agrees on the defaults. A page's own controls go in a
   second section, labelled "this page". */

import { el, field } from '../../../assets/js/ui/dom.js';
import { nice } from '../../../assets/js/ui/format.js';
import { inputDock, show, onCommit } from '../../../assets/js/ui/dock.js';
import { scoreDist } from '../core/dists.js';

export const M_PRESETS = [10, 100, 1000, 2000, 10000, 100000];
export const DEFAULT_SEED = 20261105;
export const DEFAULTS = { dist: 'beta25', p: 0.3, a: 2, b: 5, m: 2000, n: 10, seed: DEFAULT_SEED };
const DISTS = [['beta25', '10·Beta(2, 5)'], ['unif', 'U[0, 10]'], ['binom', 'Binomial(10, p)'], ['beta', '10·Beta(α, β)']];

const num = (v, fallback) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? fallback : Number(v));

/**
 * The run a page is looking at, from its state. Values out of range are
 * rejected (not silently clamped): `error` says why, and the page shows a
 * "rejected" card while the dock shows the message.
 * @returns {{dist, p, a, b, m, n, seed, spec: object, error: string|null}}
 */
export function readInputs(state) {
  const dist = DISTS.some(([id]) => id === state.dist) ? state.dist : DEFAULTS.dist;
  const p = num(state.p, DEFAULTS.p), a = num(state.a, DEFAULTS.a), b = num(state.b, DEFAULTS.b);
  const m = Math.round(num(state.m, DEFAULTS.m)), n = Math.round(num(state.n, DEFAULTS.n));
  const seed = Math.round(num(state.seed, DEFAULTS.seed));
  let error = null;
  if (dist === 'binom' && !(p > 0 && p < 1)) error = `p must lie strictly between 0 and 1 (got ${p}).`;
  else if (dist === 'beta' && !(a >= 0.1 && a <= 50 && b >= 0.1 && b <= 50)) error = `α and β must lie between 0.1 and 50 (got α = ${a}, β = ${b}).`;
  else if (!(m >= 10 && m <= 100000)) error = `m must be between 10 and 100 000 hackers (got ${m}).`;
  else if (!(n >= 2 && n <= 1000)) error = `n must be between 2 and 1 000 systems per hacker: one score has no sample variance (got ${n}).`;
  else if (!(seed >= 0 && seed <= 4294967295)) error = `the seed must be an integer between 0 and 4 294 967 295 (got ${seed}).`;
  const spec = { id: dist, ...(dist === 'binom' ? { p } : {}), ...(dist === 'beta' ? { a, b } : {}) };
  return { dist, p, a, b, m, n, seed, spec, error };
}

/** The score distribution of a run, as an object with exact moments. */
export const scoreOf = (run) => scoreDist({ dist: run.dist, p: run.p, a: run.a, b: run.b });

/** A fresh seed from the browser's CSPRNG: the only use of real randomness on
 *  these pages. It picks WHICH reproducible run to look at. */
export function freshSeed() {
  const v = new Uint32Array(1);
  crypto.getRandomValues(v);
  return v[0];
}

const summary = (r) => `${scoreOf(r).label()} · m = ${nice(r.m)} hackers · n = ${nice(r.n)} systems · seed ${r.seed}`;

const SHARED = {
  id: 'shared',
  build(apply, later) {
    const dist = el('select', { 'aria-label': 'score distribution' }, DISTS.map(([v, t]) => el('option', { value: v, text: t })));
    const p = el('input', { type: 'number', class: 'num p-in', min: 0.01, max: 0.99, step: 0.01, 'aria-label': 'p' });
    const a = el('input', { type: 'number', class: 'num p-in', min: 0.1, max: 50, step: 0.5, 'aria-label': 'alpha' });
    const b = el('input', { type: 'number', class: 'num p-in', min: 0.1, max: 50, step: 0.5, 'aria-label': 'beta' });
    const m = el('select', { 'aria-label': 'hackers m' }, M_PRESETS.map((v) => el('option', { value: v, text: nice(v) })));
    const known = new Set(M_PRESETS.map(String));
    const n = el('input', { type: 'number', class: 'num p-in', min: 2, max: 1000, step: 1, 'aria-label': 'systems per hacker n' });
    const seed = el('input', { type: 'number', class: 'num seed-in', min: 0, max: 4294967295, step: 1, 'aria-label': 'seed' });
    const enable = () => { p.disabled = dist.value !== 'binom'; a.disabled = b.disabled = dist.value !== 'beta'; };
    const go = () => apply({ dist: dist.value, p: p.value, a: a.value, b: b.value, m: m.value, n: n.value, seed: seed.value });
    dist.addEventListener('change', () => { enable(); go(); });
    m.addEventListener('change', go);
    for (const input of [p, a, b, n, seed]) onCommit(input, go, later);
    return {
      nodes: [el('div', { class: 'row' }, [
        field('score', dist), field('p', p), field('α', a), field('β', b),
        el('div', { class: 'vrule' }),
        field('hackers m', m), field('systems n', n),
        el('div', { class: 'vrule' }),
        field('seed', seed),
        el('button', { type: 'button', text: 'New seed', onclick: () => apply({ seed: freshSeed() }) }),
        el('button', { type: 'button', class: 'primary', text: 'Run', onclick: go }),
      ])],
      refresh(r) {
        show(dist, r.dist); show(p, r.p); show(a, r.a); show(b, r.b);
        // m may be a value typed in the URL, not a preset: offer it too
        if (!known.has(String(r.m))) { known.add(String(r.m)); m.append(el('option', { value: r.m, text: nice(r.m) })); }
        show(m, r.m); show(n, r.n); show(seed, r.seed);
        enable();
      },
    };
  },
  summary,
  notes: [
    'Every change applies at once and the charts redraw in place: the previous result stays on screen, marked "updating…", until the new one is ready. These inputs are shared by all the pages of this homework.',
    '<strong>score</strong>: the distribution of one attempt\'s 0–10 score. <strong>10·Beta(2, 5)</strong> (default): most attempts score low, a few high, a right skew (μ = 2.857, σ² = 2.551). <strong>U[0, 10]</strong>: every score equally likely, light tails (κ = −1.2). <strong>Binomial(10, p)</strong>: ten sub-goals, each reached with probability p, the direct heir of HW4\'s Bernoulli step. <strong>10·Beta(α, β)</strong>: any other shape on [0, 10]; β > α skews right, α > β left. The choice is a modelling assumption, not data: the averages do not depend on it, the spread of s² does (through the kurtosis κ).',
    '<strong>m</strong> is the number of hackers, i.e. the number of independent replications: the error of every average across hackers shrinks like 1/√m. <strong>n</strong> is the number of systems each hacker attacks, i.e. the sample size of each hacker\'s x̄ and s²: one hacker\'s estimates sharpen like 1/√n. Two different questions, two different sample sizes.',
    '<strong>seed</strong>: the simulations use xoshiro128**, a fast seeded generator, not a cryptographic one: a simulation needs reproducibility, not secrecy. "New seed" draws one from <code>crypto.getRandomValues</code>, the only real randomness on these pages.',
  ],
};

/**
 * Mount or refresh the dock; returns null, so it takes no place in the page.
 * @param {ReturnType<typeof readInputs>} run
 * @param {object|null} [page]  the page's own section ({id, label: 'this page', build, summary, notes})
 */
export const dock = (run, update, page = null, pageValue = null) => inputDock({
  id: 'hw05', title: 'Inputs', update,
  sections: page ? [SHARED, page] : [SHARED],
  values: { shared: run, ...(page ? { [page.id]: pageValue } : {}) },
  message: run.error ? { text: `Rejected: ${run.error}`, kind: 'err' } : null,
});

/** What a page shows while its inputs are rejected: the reason is in the dock too. */
export const rejected = (error) => el('div', { class: 'card' }, [
  el('h2', { text: 'These inputs are rejected' }),
  el('p', { class: 'err', text: error }),
  el('p', { class: 'small muted', text: 'Change the value in the dock below; the page comes back as soon as the inputs are valid.' }),
]);
