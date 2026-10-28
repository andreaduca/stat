/* lln-page.js — the LLN page (E4): the tail qₙ(ε) = P(|Sₙ/n − μ| > ε)
   measured on the m attackers (with Wilson intervals), computed exactly, bounded
   by Chebyshev, Hoeffding and KL–Chernoff and approximated by the CLT; how the
   precision of the estimate grows with m; and the funnel of Sₖ/k paths.
   The maths is in ../core/exact.js and ../core/bounds.js. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot, short } from '../../../assets/js/ui/plot.js';
import { wilson } from '../../../assets/js/core/stats.js';
import { modelFrom } from '../core/models.js';
import { GRID, Simulation, column } from '../core/simulate.js';
import { llnTail, bandEdges } from '../core/exact.js';
import { chebyshev, hoeffding, klChernoff, cltApprox } from '../core/bounds.js';
import { outsideBand } from '../core/estimate.js';
import { readRun, runCard } from './run-input.js';
import { getRun, pending, updatingFlag } from './run.js';
import { labPanel, section, table, verdict } from './lab-panel.js';
import { SIM, EXACT, LIMIT, legend, figure, svgButton } from './widgets.js';
import { hw04Shell, STICKY, MEMORY } from './shell.js';

const nice = (n) => n.toLocaleString('en-US').replace(/,/g, '\u202f');
const BOUND = 'var(--m1)', MUTED = 'var(--muted)', BAND = 'var(--s2)';
const DASH = { cheb: '9 4', hoeff: '4 3', kl: '1.5 3' };
const M_LADDER = [100, 1000, 10000, 100000];
const sci = (x) => (x === 0 ? '0' : x < 1e-3 ? x.toExponential(2) : x.toPrecision(4));

/** n from 10 to 10 000, about 60 integers evenly spread on a log scale. */
const N_CURVE = [...new Set(Array.from({ length: 61 }, (_, i) => Math.round(10 ** (1 + (3 * i) / 60))))];

/** Measured and exact qₙ(ε) at each checkpoint. */
function tailRows(model, res, eps, m = res.m) {
  return res.grid.map((n, c) => {
    const col = column(res, c).subarray(0, m);
    const hits = outsideBand(col, bandEdges(model, n, eps));
    const [lo, hi] = wilson(hits, m);
    return { n, hits, m, q: hits / m, lo, hi, exact: llnTail(model, n, eps).q,
      cheb: chebyshev(model, n, eps), hoeff: hoeffding(model, n, eps), kl: klChernoff(model, n, eps).bound, clt: cltApprox(model, n, eps) };
  });
}

/* ---------- E4: the tail against n ---------- */

function tailPanel(model, run, res, eps, zoom) {
  const rows = tailRows(model, res, eps);
  const curve = (f) => N_CURVE.map((n) => [n, f(n)]);
  const exactCurve = curve((n) => llnTail(model, n, eps).q);
  // full: down to the exact tail; zoom: only as far down as m attackers can see (≈ 1/m)
  const floor = zoom ? 0.3 / res.m : Math.max(1e-30, Math.min(...exactCurve.map((p) => p[1]).filter((v) => v > 0)) / 3);
  const seen = rows.filter((r) => r.hits > 0), zero = rows.filter((r) => r.hits === 0);
  const chart = plot({
    x: { log: true, min: 8, max: 12500, ticks: [10, 100, 1000, 10000], title: 'n (systems)' },
    y: { log: true, min: floor, max: 1.5, title: 'qₙ(ε) = P(|Sₙ/n − μ| > ε)' }, height: 340,
    layers: [
      { type: 'line', points: curve((n) => chebyshev(model, n, eps)), color: BOUND, dash: DASH.cheb, label: 'Chebyshev', end: 'Chebyshev' },
      { type: 'line', points: curve((n) => hoeffding(model, n, eps)), color: BOUND, dash: DASH.hoeff, label: 'Hoeffding', end: 'Hoeffding' },
      { type: 'line', points: curve((n) => klChernoff(model, n, eps).bound), color: BOUND, dash: DASH.kl, label: 'KL–Chernoff', end: 'KL–Chernoff' },
      { type: 'line', points: curve((n) => cltApprox(model, n, eps)), color: LIMIT, dash: true, thin: true, label: 'CLT approx.', end: 'CLT approx.' },
      { type: 'line', points: exactCurve, color: EXACT, label: 'exact', end: 'exact' },
      { type: 'points', points: seen.map((r) => [r.n, r.q]), err: seen.map((r) => [r.n, r.lo, r.hi]), color: SIM, label: 'simulated' },
      { type: 'arrows', points: zero.map((r) => [r.n, r.hi]), color: SIM, label: 'simulated: 0 hits, at most' },
    ],
    label: 'log-log plot of the LLN tail probability against n: simulation, exact, three bounds and the CLT approximation',
  });
  const inside = rows.filter((r) => r.exact >= r.lo - 1e-12 && r.exact <= r.hi + 1e-12).length;
  const n0 = zero[0]?.n;
  const at1000 = rows.find((r) => r.n === 1000);
  return {
    answer: {
      ok: inside >= rows.length - 1,
      text: (rows[0].hits
        ? `The fraction of attackers outside μ ± ${eps} falls from ${sci(rows[0].q)} at n = 10 to ${sci(rows.at(-1).q)} at n = ${nice(rows.at(-1).n)}: <strong>Sₙ/n converges in probability to μ = ${model.mean}</strong>.`
        : `No attacker is outside μ ± ${eps} at any checkpoint, although the exact probability at n = 10 is ${sci(rows[0].exact)}: with m = ${nice(run.m)} the simulation cannot resolve probabilities much below 1/m, and the exact curve alone shows the convergence to μ = ${model.mean}.`) +
        ` The exact value lies inside the 95 % Wilson interval at ${inside} of ${rows.length} checkpoints (about 1 miss in 20 is expected).` +
        (n0 ? ` From n = ${nice(n0)} no attacker leaves the band, so the simulation can only say q ≤ ${sci(zero[0].hi)}; the exact curve carries on to ${sci(rows.at(-1).exact)} at n = ${nice(rows.at(-1).n)}.` : '') +
        ` At n = 1 000 the bounds overshoot the exact ${sci(at1000.exact)} by ×${short(at1000.cheb / at1000.exact)} (Chebyshev), ×${short(at1000.hoeff / at1000.exact)} (Hoeffding) and ×${short(at1000.kl / at1000.exact)} (KL–Chernoff).`,
    },
    body: [
      ...section(1, 'The tail probability against n', 'Points: the fraction of the m attackers outside the band, with 95 % Wilson intervals; an arrow means no attacker was outside, and points at the most the tail can be. Solid orange: the exact value. Blue: three upper bounds, valid for every n. Dashed: the CLT approximation, which is not a bound.'),
      figure(chart, `${model.label()}, ε = ${eps}, m = ${nice(run.m)}, seed ${run.seed}. Values below ${sci(floor)} run off the bottom; the table has them.`),
      el('div', { class: 'row end' }, [svgButton(chart, `lln-${run.model}-${eps}-${run.seed}`)]),
      legend([['dot', SIM, 'simulated (± 95 % Wilson)'], ['line', EXACT, 'exact'], ['dash', BOUND, 'bounds (three dash patterns)'], ['dash', LIMIT, 'CLT approximation']]),
      ...section(2, 'The numbers', 'hits = attackers with |Sₙ/n − μ| > ε. A bound of 1 says nothing.'),
      table(['n', 'hits', 'q̂', 'Wilson 95 %', 'exact', 'exact inside?', 'Chebyshev', 'Hoeffding', 'KL–Chernoff', 'CLT approx.'], rows.map((r) => [
        nice(r.n), nice(r.hits), sci(r.q), `[${sci(r.lo)}, ${sci(r.hi)}]`, sci(r.exact), verdict(r.exact >= r.lo - 1e-12 && r.exact <= r.hi + 1e-12, 'yes', 'no'),
        sci(r.cheb), sci(r.hoeff), sci(r.kl), sci(r.clt)])),
    ],
    rows: rows.map((r) => ({ n: r.n, eps, m: r.m, hits: r.hits, q_hat: r.q, wilson_lo: r.lo, wilson_hi: r.hi, exact: r.exact, chebyshev: r.cheb, hoeffding: r.hoeff, kl_chernoff: r.kl, clt_approx: r.clt })),
    summary: { model: model.label(), eps, m: run.m, seed: run.seed },
  };
}

/* ---------- precision: the same estimate with more attackers ---------- */

function precisionPanel(model, run, big, eps, nPick) {
  const c = big.grid.indexOf(nPick);
  const exact = llnTail(model, nPick, eps).q;
  const rows = M_LADDER.map((m) => {
    const col = column(big, c).subarray(0, m);
    const hits = outsideBand(col, bandEdges(model, nPick, eps));
    const [lo, hi] = wilson(hits, m);
    return { m, hits, q: hits / m, lo, hi, half: (hi - lo) / 2 };
  });
  const chart = plot({
    x: { log: true, min: 50, max: 2e5, ticks: M_LADDER, title: 'm (attackers)' }, y: { title: `estimate of q at n = ${nice(nPick)}` }, height: 240,
    layers: [
      { type: 'hline', at: exact, color: EXACT, dash: false, text: `exact ${sci(exact)}` },
      { type: 'points', points: rows.map((r) => [r.m, r.q]), err: rows.map((r) => [r.m, r.lo, r.hi]), color: SIM, label: 'q̂ ± 95 %' },
    ],
  });
  const k = 1.96 * Math.sqrt(exact * (1 - exact));
  return {
    answer: { text: `Half-widths of the 95 % interval: ${rows.map((r) => sci(r.half)).join(' → ')}. ` + (Math.abs(rows[0].half * Math.sqrt(rows[0].m) / k - 1) < 0.2
      ? `Each tenfold increase in m narrows the interval by about √10 ≈ 3.2: the half-width times √m stays near 1.96·√(q(1 − q)) = ${k.toFixed(3)} (${rows.map((r) => (r.half * Math.sqrt(r.m)).toFixed(3)).join(', ')}). The error of a Monte Carlo estimate shrinks like 1/√m: the LLN and the CLT again, applied to the simulation itself.`
      : `The half-width times √m (${rows.map((r) => (r.half * Math.sqrt(r.m)).toFixed(3)).join(', ')}) reaches 1.96·√(q(1 − q)) = ${k.toFixed(3)} only once m·q is large: here q = ${sci(exact)} is rare, so at small m the interval is set by its z²/m term, not by the 1/√m law. Pick an n where q is larger to see the clean √m shrinkage.`) },
    body: [
      ...section(1, 'One probability, four sample sizes', `The first 100, 1 000, 10 000 and 100 000 attackers of one run of 10⁵ (seed ${run.seed}), all estimating the same q at n = ${nice(nPick)}.`),
      chart,
      table(['m', 'hits', 'q̂', 'Wilson 95 %', 'half-width', 'half-width × √m'], rows.map((r) => [nice(r.m), nice(r.hits), sci(r.q), `[${sci(r.lo)}, ${sci(r.hi)}]`, sci(r.half), (r.half * Math.sqrt(r.m)).toFixed(3)])),
    ],
    rows: rows.map((r) => ({ n: nPick, eps, ...r, exact })),
  };
}

/* ---------- the funnel ---------- */

function funnel(model, run, eps) {
  const K = 20, res = new Simulation({ model, m: K, grid: [10000], seed: run.seed, keepPaths: K }).run();
  const mu = model.mean, sd = model.sd;
  const paths = res.paths.map((p) => Array.from(p.k).map((k, i) => [k, k ? p.S[i] / k : NaN]));
  const ks = Array.from({ length: 81 }, (_, i) => 10 ** (i / 20));
  const nStar = Math.ceil((4 * model.variance) / (eps * eps));   // where μ ± 2σ/√n meets μ ± ε
  const lastOut = res.paths.map((p) => { let last = 0; p.k.forEach((k, i) => { if (k && Math.abs(p.S[i] / k - mu) > eps) last = k; }); return last; });
  const chart = plot({
    x: { log: true, min: 1, max: 10000, ticks: [1, 10, 100, 1000, 10000], title: 'k (systems probed)' },
    y: { min: model.values[0], max: model.values[1], title: 'Sₖ/k' }, height: 260,
    layers: [
      { type: 'shade', y0: mu - eps, y1: mu + eps, color: BAND },
      { type: 'paths', paths, color: SIM, label: 'attacker', names: res.paths.map((p, i) => `attacker ${i + 1}: last outside the band at k ≈ ${nice(lastOut[i])}`) },
      ...[1, -1].map((s) => ({ type: 'line', points: ks.map((k) => [k, mu + (2 * s * sd) / Math.sqrt(k)]), color: MUTED, dash: true, thin: true, hover: false })),
      { type: 'hline', at: mu, color: LIMIT, dash: false },
      nStar <= 10000 ? { type: 'vline', at: nStar, color: MUTED, text: `4σ²/ε² ≈ ${nice(nStar)}` } : null,
    ].filter(Boolean),
  });
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The funnel: twenty attackers’ averages' }),
    el('p', { html: `The first 20 attackers' running averages Sₖ/k (seed ${run.seed}), the band μ ± ε (shaded) and the envelope μ ± 2σ/√k (dashed). The envelope enters the band at k ≈ 4σ²/ε² = ${nice(nStar)}. Hover over a path to see when it last left the band (latest of the 20: k ≈ ${nice(Math.max(...lastOut))}; kept points only, so approximate).` }),
    chart,
    legend([['path', SIM, 'one attacker'], ['band', BAND, `μ ± ε, ε = ${eps}`], ['dash', MUTED, 'μ ± 2σ/√k']]),
    el('details', { class: 'explain' }, [el('summary', { text: 'Convergence in probability, or almost surely?' }), el('div', {}, [
      el('p', { html: '<strong>In probability</strong> (the weak law, the plot above): at each fixed n, the <em>fraction</em> of attackers outside the band goes to 0. It says nothing about any single attacker\'s path, which could in principle keep leaving the band now and then.' }),
      el('p', { html: '<strong>Almost surely</strong> (the strong law, this picture): with probability 1, <em>each</em> path eventually enters the band and never leaves it again. Every path here does so, at its own (random) time. The strong law implies the weak law but not the other way round; the homework asks for the weak one, which the tail plot measures.' }),
      el('p', { class: 'practice', html: 'For a defender, the weak law says that among many attackers, few have a success rate far from p at a large n. The strong law says that one persistent attacker\'s observed rate eventually stays close to its true p. Both are why a long observation window reveals skill.' }),
    ])]),
  ]);
}

startPage({
  shell: hw04Shell('lln.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readRun(state);
    const model = modelFrom(run);
    const eps = Math.min(0.5, Math.max(0.005, Number(state.eps) || (run.model === 'ber' ? 0.05 : 0.1)));
    const nPick = GRID.includes(Number(state.np)) ? Number(state.np) : 100;
    const redraw = () => api.draw();
    const spec = { model: { model: run.model, p: run.p }, run: { m: run.m, grid: GRID, seed: run.seed, keepPaths: 0 } };
    const got = getRun(spec, redraw, 'main');
    const bigSpec = { model: spec.model, run: { ...spec.run, m: 100000 } };
    const big = run.m === 100000 ? got : getRun(bigSpec, redraw, 'big');

    const shown = el('span', { class: 'eq', text: `ε = ${eps}` });
    const epsInput = el('input', { type: 'range', min: 0.005, max: 0.5, step: 0.005, value: String(eps), 'aria-label': 'ε',
      oninput: (e) => { shown.textContent = `ε = ${e.target.value}`; }, onchange: (e) => update({ eps: e.target.value }) });
    return [
      runCard(run, update),
      labPanel({
        id: 'E4', title: 'Convergence in probability of Sₙ/n', name: `E4-${run.model}-${eps}-${run.seed}`,
        question: `Does the fraction of attackers whose average score Sₙ/n is more than ε away from μ = ${model.mean} go to 0 as n grows, and how fast?`,
        steps: [
          `Simulate m = ${nice(run.m)} attackers (${model.label()}) up to n = 10 000.`,
          'At each checkpoint count the attackers with |Sₙ/n − μ| > ε (strictly) and estimate qₙ(ε) by that fraction, with a Wilson interval.',
          'Compute qₙ(ε) exactly from the binomial law, and the three upper bounds and the CLT approximation, at every n from 10 to 10 000.',
        ],
        controls: [field('ε, the width of the band', epsInput), shown, el('div', { class: 'vrule' }),
          field('vertical range', el('select', { onchange: (e) => update({ zoom: e.target.value === 'full' ? null : 'sim' }) }, [
            el('option', { value: 'full', text: 'down to the exact tail', selected: state.zoom !== 'sim' }),
            el('option', { value: 'sim', text: 'what m attackers can see (≈ 1/m)', selected: state.zoom === 'sim' })]))],
        hints: ['<strong>ε</strong>: how close to μ counts as "close". Smaller ε needs larger n: every bound and the exact tail move right like 1/ε² (release the slider to recompute).',
          '<strong>vertical range</strong>: the full range shows the exact tail falling to 10⁻²³ and beyond; the other stops near 1/m, the smallest probability the simulation can resolve.'],
        flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
        view: () => tailPanel(model, run, got.result, eps, state.zoom === 'sim'),
        why: 'Convergence in probability is exactly this statement: for every ε, qₙ(ε) → 0. The plot shows it happening, the exact curve shows how fast (exponentially in n), and the bounds show what can be guaranteed without knowing the exact law.',
        notes: [
          'Chebyshev, σ²/(nε²), uses only the variance and falls like 1/n: enough to prove the law, far too loose to plan with. Hoeffding, 2e^(−2nε²/w²) for steps in an interval of width w, falls exponentially but ignores the variance. KL–Chernoff, e^(−nD(μ+ε‖μ)) + e^(−nD(μ−ε‖μ)), has the exact exponential rate (Cramér) and is the tightest of the three.',
          'The CLT approximation 2(1 − Φ(ε√n/σ)) is the normal tail. It is close in the middle, but it is not a bound, and far in the tail its relative error is large: the binomial is a lattice with a skew, the normal is neither.',
          'The Wilson interval does not collapse to [0, 0] when no attacker is outside: with 0 hits out of m it is [0, ≈ 3.84/m]. That upper end is the arrow, the most the simulation can see. Below about 1/m only the exact computation can go, which is why the exact layer is on every plot (note 02 §1).',
          'PRACTICE: replace "attacker" by "defender\'s estimate of an attacker\'s skill". After n observed probes, the estimate Sₙ/n is within ε of the true rate except with probability qₙ(ε). The tail tells a defender how long to watch before trusting a measured rate.',
        ],
      }),
      labPanel({
        id: 'E4-precision', title: 'Choosing m: precision of the estimate', name: `E4-precision-${run.model}-${eps}-${run.seed}`,
        question: 'How many attackers does the simulation need to estimate one tail probability to a given precision?',
        steps: ['Simulate 10⁵ attackers once.', 'Estimate the same q from the first 10², 10³, 10⁴ and 10⁵ of them, each with its Wilson interval.'],
        controls: [field('at n =', el('select', { onchange: (e) => update({ np: e.target.value === '100' ? null : e.target.value }) },
          GRID.map((n) => el('option', { value: n, text: nice(n), selected: n === nPick }))))],
        hints: ['<strong>n</strong>: the checkpoint whose tail is estimated. Pick one where q is not tiny (n = 10 to 300 at the default ε), or watch every estimate be 0.'],
        flag: updatingFlag(big), waiting: big.result ? null : pending(big, bigSpec, redraw),
        view: () => precisionPanel(model, run, big.result, eps, nPick),
        why: 'The "suitable choice of m" in the assignment is itself an application of the theorems: the estimate of a probability q has standard error √(q(1 − q)/m). To see q ≈ 10⁻³ with 10 % relative error needs m ≈ 10⁵ (note 03 §2).',
      }),
      funnel(model, run, eps),
    ];
  },
});
