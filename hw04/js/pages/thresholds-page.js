/* thresholds-page.js — the Thresholds page (E6, E7): how many observations a
   defender needs to pin an attacker's rate down (sample sizes from each bound
   against the exact answer); when an attacker first reaches a level a (running
   maximum and hitting time: reflection principle, hitting-time theorem,
   negative binomial); at least one breach among m attackers; and the race
   between attacker and defender between two barriers (gambler's ruin).
   The maths is in ../core/exact.js, ../core/bounds.js and simulateRaces. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot, short } from '../../../assets/js/ui/plot.js';
import { wilson } from '../../../assets/js/core/stats.js';
import { modelFrom } from '../core/models.js';
import { GRID, simulateRaces } from '../core/simulate.js';
import { probMaxAtLeast, hitTimePmf, hitTimeSurvival, hitTimeSurvivalAsymptotic, hitTimeMoments, atLeastOne, race, catchUp } from '../core/exact.js';
import { sampleSizes, klChernoff } from '../core/bounds.js';
import { normInv, normSf } from '../core/numeric.js';
import { moments } from '../core/estimate.js';
import { readRun, runCard } from './run-input.js';
import { getRun, pending, updatingFlag } from './run.js';
import { labPanel, section, table } from './lab-panel.js';
import { SIM, EXACT, LIMIT, legend, figure, svgButton } from './widgets.js';
import { hw04Shell, STICKY, MEMORY } from './shell.js';

const nice = (n) => n.toLocaleString('en-US').replace(/,/g, ' ');
const BOUND = 'var(--m1)', MUTED = 'var(--muted)';
const BREACH = 'var(--m2)', EXPELLED = 'var(--m1)';
const DASH = { cheb: '9 4', hoeff: '4 3', kl: '1.5 3' };
const sci = (x) => (x === 0 ? '0' : x < 1e-3 ? x.toExponential(2) : x.toPrecision(4));
const num = (v, lo, hi, fallback) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Math.min(hi, Math.max(lo, Number(v))) : fallback);
const N_CURVE = [...new Set(Array.from({ length: 61 }, (_, i) => Math.round(10 ** (1 + (3 * i) / 60))))];
const GROUPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const NMAX = GRID.at(-1);
/** x inside [lo, hi], forgiving the last bit (a Wilson end of 1 − 10⁻¹⁶ against an exact 1). */
const within = (x, lo, hi) => x >= lo - 1e-12 && x <= hi + 1e-12;

/** A number input that applies its value on change (and on Enter). */
const numberField = (label, value, { min, max, step }, apply) => field(label, el('input', {
  type: 'number', class: 'num', min, max, step, value: String(value),
  onchange: (e) => apply(e.target.value), onkeydown: (e) => { if (e.key === 'Enter') apply(e.target.value); },
}));

/* ---------- E6: how many observations ---------- */

function calculator(model, eps, delta) {
  const t0 = performance.now();
  const s = sampleSizes(model, eps, delta);
  const ms = performance.now() - t0;
  const rows = [
    ['Chebyshev', 'σ²/(δε²)', s.chebyshev, 'bound: 1/δ'],
    ['Hoeffding', 'w²·ln(2/δ)/(2ε²)', s.hoeffding, 'bound: ln(1/δ)/ε², ignores σ'],
    ['KL–Chernoff', 'smallest n with the KL bound ≤ δ', s.kl, 'bound: the right exponent'],
    ['CLT', '(σ·Φ⁻¹(1 − δ/2)/ε)²', s.clt, 'estimate, not a guarantee'],
    ['exact', 'first n with qₙ ≤ δ', s.exactFirst, 'binomial tail, scanned'],
    ['exact, for good', 'n from which qₙ stays ≤ δ', s.exactFrom, 'the honest answer'],
  ];
  const eps2 = Array.from({ length: 31 }, (_, i) => 10 ** (-2.7 + (1.7 * i) / 30));   // ε from 0.002 to 0.1
  const chart = plot({
    x: { log: true, min: 0.002, max: 0.1, title: 'ε (precision)' }, y: { log: true, title: `n needed for δ = ${delta}` }, height: 270,
    layers: [
      { type: 'line', points: eps2.map((e) => [e, model.variance / (delta * e * e)]), color: BOUND, dash: DASH.cheb, label: 'Chebyshev', end: 'Chebyshev' },
      { type: 'line', points: eps2.map((e) => [e, (model.range ** 2 * Math.log(2 / delta)) / (2 * e * e)]), color: BOUND, dash: DASH.hoeff, label: 'Hoeffding', end: 'Hoeffding' },
      { type: 'line', points: eps2.map((e) => [e, klN(model, e, delta)]), color: BOUND, dash: DASH.kl, label: 'KL–Chernoff', end: 'KL–Chernoff' },
      { type: 'line', points: eps2.map((e) => [e, ((model.sd * normInv(1 - delta / 2)) / e) ** 2]), color: LIMIT, dash: true, thin: true, label: 'CLT', end: 'CLT' },
      ...(s.exactFrom ? [{ type: 'points', points: [[eps, s.exactFrom]], color: EXACT, r: 5, label: 'exact (this ε)' }] : []),
      { type: 'vline', at: eps, color: MUTED, text: `ε = ${eps}` },
    ],
  });
  return {
    answer: { text: `To know an attacker's rate to within ε = ${eps} of μ = ${model.mean}, except with probability δ = ${delta}: Chebyshev asks for <strong>${nice(s.chebyshev)}</strong> observations, Hoeffding <strong>${nice(s.hoeffding)}</strong>, KL–Chernoff <strong>${nice(s.kl)}</strong>, the CLT estimate <strong>${nice(s.clt)}</strong>; ` +
      (s.exactFrom ? `the exact answer is <strong>${nice(s.exactFrom)}</strong>${s.exactFirst !== s.exactFrom ? ` (the tail first dips below δ at ${nice(s.exactFirst)}, then the lattice lifts it back above a few times)` : ''}.` : 'the exact scan is skipped above 50 000 observations (it would take seconds); there the CLT estimate is typically within a few per cent of the exact answer.') },
    body: [
      ...section(1, 'The number of observations, by method', 'qₙ(ε) = P(|Sₙ/n − μ| > ε); each row gives the n that makes it at most δ.'),
      table(['method', 'formula', 'n needed', 'what it is'], rows.map(([a, f, n, w]) => [a, f, n === null ? '—' : nice(n), w]), 'prose'),
      el('p', { class: 'small muted', text: s.scanned ? `Exact search: every n from ${nice(s.scanned[0])} to ${nice(s.scanned[1])}, in ${ms.toFixed(0)} ms.` : 'Exact search skipped (above 50 000).' }),
      ...section(2, 'Cost against precision', 'Every method scales like 1/ε²: halving ε quadruples the observations. Lines are parallel on log-log axes; they differ by constant factors, which is where the bounds lose.'),
      chart,
      legend([['dash', BOUND, 'bounds (Chebyshev, Hoeffding, KL–Chernoff)'], ['dash', LIMIT, 'CLT estimate'], ['dot', EXACT, 'exact, at this ε']]),
    ],
    rows: rows.map(([method, formula, n]) => ({ method, formula, n, eps, delta, model: model.label() })),
  };
}

/** Smallest n with the KL–Chernoff bound ≤ δ (it decreases in n: bisection). */
function klN(model, eps, delta) {
  let lo = 1, hi = 1;
  while (klChernoff(model, hi, eps).bound > delta && hi < 1e12) hi *= 2;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (klChernoff(model, mid, eps).bound <= delta) hi = mid; else lo = mid + 1; }
  return lo;
}

/* ---------- E7: first passage ---------- */

function firstPassage(model, run, res, a, nPick) {
  const G = res.grid.length, m = res.m, c = res.grid.indexOf(nPick);
  const rad = model.kind === 'rademacher';

  // (a) P(Mₙ ≥ a) at every checkpoint
  const reach = res.grid.map((n, k) => {
    let h = 0;
    for (let j = 0; j < m; j++) if (res.maxS[j * G + k] >= a) h++;
    const [lo, hi] = wilson(h, m);
    return { n, h, q: h / m, lo, hi, exact: probMaxAtLeast(model, n, a) };
  });
  const reachChart = plot({
    x: { log: true, min: 8, max: 12500, ticks: [10, 100, 1000, 10000], title: 'n (systems)' }, y: { min: 0, max: 1, title: `P(Mₙ ≥ ${a})` }, height: 240,
    layers: [
      { type: 'line', points: N_CURVE.map((n) => [n, probMaxAtLeast(model, n, a)]), color: EXACT, label: rad ? 'reflection principle' : 'binomial tail' },
      ...(rad ? [{ type: 'line', points: N_CURVE.map((n) => [n, Math.min(1, 2 * normSf(a / Math.sqrt(n)))]), color: LIMIT, dash: true, thin: true, label: '2(1 − Φ(a/√n)), asymptotic' }] : []),
      { type: 'points', points: reach.map((r) => [r.n, r.q]), err: reach.map((r) => [r.n, r.lo, r.hi]), color: SIM, label: 'simulated' },
    ],
  });

  // (b) the law of Tₐ among the attackers who reached a by n_max, in geometric bins
  const hits = Array.from(res.hitTime).filter((t) => t >= 0);
  const edges = [...new Set(Array.from({ length: 31 }, (_, i) => Math.round(a * (NMAX / a) ** (i / 30))))];
  if (edges[0] > a) edges.unshift(a);
  edges[edges.length - 1] = NMAX + 1;
  const counts = new Float64Array(edges.length - 1), mass = new Float64Array(edges.length - 1);
  const binOf = (t) => { let b = 0; while (b < edges.length - 2 && t >= edges[b + 1]) b++; return b; };
  for (const t of hits) counts[binOf(t)]++;
  for (let t = a; t <= NMAX; t++) mass[binOf(t)] += hitTimePmf(model, a, t);
  const bars = Array.from(counts, (k, b) => [edges[b], edges[b + 1], k / m]);
  const tChart = plot({
    x: { log: true, min: Math.max(1, a * 0.8), max: NMAX * 1.25, title: `Tₐ (first step with score ${a})` }, y: { min: 0, title: 'probability per bin' }, height: 240,
    layers: [
      { type: 'bars', bars, color: SIM, label: 'simulated' },
      { type: 'points', points: Array.from(mass, (q, b) => [Math.sqrt(edges[b] * edges[b + 1]), q]), color: EXACT, r: 3.5, label: rad ? 'hitting-time theorem' : 'negative binomial' },
    ],
  });
  const tm = hits.length ? moments(Int32Array.from(hits)) : null;

  // (c) survival P(Tₐ > n), log-log
  const surv = reach.map((r) => ({ n: r.n, s: 1 - r.q, lo: 1 - r.hi, hi: 1 - r.lo, exact: hitTimeSurvival(model, a, r.n) }));
  const survChart = plot({
    x: { log: true, min: 8, max: 12500, ticks: [10, 100, 1000, 10000], title: 'n (systems)' }, y: { log: true, min: Math.max(1e-6, 0.3 / m, Math.min(...N_CURVE.map((n) => hitTimeSurvival(model, a, n))) / 3), max: 1.5, title: `P(T${a} > n): no breach yet` }, height: 250,
    layers: [
      { type: 'line', points: N_CURVE.map((n) => [n, hitTimeSurvival(model, a, n)]), color: EXACT, label: 'exact', end: 'exact' },
      ...(rad ? [{ type: 'line', points: N_CURVE.filter((n) => n > a * a / 4).map((n) => [n, hitTimeSurvivalAsymptotic(a, n)]), color: LIMIT, dash: true, thin: true, label: 'a√(2/(πn))', end: 'a√(2/(πn))' }] : []),
      { type: 'points', points: surv.filter((r) => r.s > 0).map((r) => [r.n, r.s]), err: surv.filter((r) => r.s > 0).map((r) => [r.n, Math.max(r.lo, 1e-9), r.hi]), color: SIM, label: 'simulated' },
    ],
  });

  // (d) at least one of g attackers, at n = nPick
  const qOne = probMaxAtLeast(model, nPick, a);
  const groups = GROUPS.filter((g) => m / g >= 10).map((g) => {
    const count = Math.floor(m / g);
    let any = 0;
    for (let i = 0; i < count; i++) {
      for (let j = i * g; j < (i + 1) * g; j++) if (res.maxS[j * G + c] >= a) { any++; break; }
    }
    const [lo, hi] = wilson(any, count);
    return { g, count, f: any / count, lo, hi, exact: atLeastOne(qOne, g) };
  });
  const gs = Array.from({ length: 41 }, (_, i) => 10 ** ((4 * i) / 40));
  const groupChart = plot({
    x: { log: true, min: 0.8, max: 12500, ticks: [1, 10, 100, 1000, 10000], title: 'number of attackers' }, y: { min: 0, max: 1, title: `P(at least one reaches ${a} within ${nice(nPick)})` }, height: 240,
    layers: [
      { type: 'line', points: gs.map((g) => [g, atLeastOne(qOne, g)]), color: EXACT, label: '1 − (1 − q)ᵐ' },
      { type: 'points', points: groups.map((r) => [r.g, r.f]), err: groups.map((r) => [r.g, r.lo, r.hi]), color: SIM, label: 'simulated groups' },
    ],
  });
  const g50 = Math.ceil(Math.log(0.5) / Math.log1p(-qOne)), g99 = Math.ceil(Math.log(0.01) / Math.log1p(-qOne));
  const inside = reach.filter((r) => within(r.exact, r.lo, r.hi)).length;
  const last = reach.at(-1);

  return {
    answer: { text: `Within ${nice(last.n)} systems, ${sci(last.q)} of the attackers reached ${a} (exact ${sci(last.exact)}${rad ? ', reflection principle' : ''}); the exact value is inside the 95 % interval at ${inside} of ${reach.length} checkpoints. ` +
      (rad ? `Breach is certain in the long run, but slow: ${sci(1 - last.exact)} of attackers are still below ${a} after ${nice(last.n)} steps, and that fraction falls only like 1/√n, so the expected breach time is infinite. `
        : `With drift, breach comes at a predictable time: E[Tₐ] = a/p = ${nice(Math.round(hitTimeMoments(model.p, a).mean))} (measured ${tm ? tm.mean.toFixed(1) : '—'}). `) +
      `Each attacker breaches within ${nice(nPick)} systems with probability ${sci(qOne)}; ` + (qOne <= 0 ? 'no group of attackers changes that.' : g99 <= 1 ? 'a single attacker is already enough for 99 %.' : `${g50 <= 1 ? 'one attacker already gets there half the time' : `with ${nice(g50)} attackers at least one gets there with probability ½`}, with ${nice(g99)} with probability 99 %.`) },
    body: [
      ...section(1, `Reaching level ${a}: P(Mₙ ≥ ${a})`, rad
        ? 'Mₙ is the highest score an attacker has reached in its first n steps. Reflection principle: P(Mₙ ≥ a) = 2P(Sₙ > a) + P(Sₙ = a): every path that touches a and ends below it is the mirror image of one that ends above it.'
        : 'A Bernoulli path never goes down, so its maximum is its current score: P(Mₙ ≥ a) = P(Sₙ ≥ a), a binomial tail.'),
      figure(reachChart, `${model.label()}, a = ${a}, m = ${nice(m)}, seed ${run.seed}.`),
      ...section(2, `When the breach happens: the law of T${a}`, `The attackers who reached ${a} within ${nice(NMAX)} systems (${nice(hits.length)} of ${nice(m)}), their first-passage times in bins of equal width on a log scale. ` +
        (rad ? 'Exact: the hitting-time theorem, P(Tₐ = n) = (a/n)·P(Sₙ = a).' : 'Exact: the negative binomial, P(Tₐ = n) = C(n − 1, a − 1)pᵃ(1 − p)ⁿ⁻ᵃ.')),
      tChart,
      legend([['bar', SIM, 'simulated'], ['dot', EXACT, 'exact']]),
      ...section(3, 'Still no breach: P(Tₐ > n), log-log', rad
        ? 'The survival falls like a√(2/(πn)): slope −½. Σₙ P(Tₐ > n) = E[Tₐ] diverges, which means certain, but with infinite expected time.'
        : 'A light tail: once n passes a/p the survival collapses. The expected time is finite, a/p.'),
      survChart,
      ...section(4, `At least one of many attackers, within ${nice(nPick)} systems`, `The m simulated attackers split into groups of each size; the fraction of groups where someone reached ${a}, against 1 − (1 − q)ᵐ with q = ${sci(qOne)}.`),
      groupChart,
      legend([['dot', SIM, 'simulated (± 95 %)'], ['line', EXACT, 'exact'], ...(rad ? [['dash', LIMIT, 'asymptotic']] : [])]),
      table(['n', 'reached a', 'P(Mₙ ≥ a) simulated', 'exact', 'P(Tₐ > n) exact'], reach.map((r) => [nice(r.n), nice(r.h), `${sci(r.q)} [${sci(r.lo)}, ${sci(r.hi)}]`, sci(r.exact), sci(hitTimeSurvival(model, a, r.n))])),
    ],
    rows: reach.map((r) => ({ n: r.n, a, m, reached: r.h, p_hat: r.q, wilson_lo: r.lo, wilson_hi: r.hi, exact: r.exact, survival_exact: hitTimeSurvival(model, a, r.n) })),
    summary: { model: model.label(), a, m, seed: run.seed, hits: hits.length, mean_T_hitters: tm?.mean ?? null },
  };
}

/* ---------- the race ---------- */

let raceTimer = null;
const raceView = { t: null };   // the animation's time, kept across redraws

function racePanel(run, ra, rb, r) {
  const ex = race(r, ra, rb);
  const count = Math.max(500, Math.min(20000, Math.floor(2e7 / Math.max(1, ex.duration))));
  const sim = simulateRaces({ r, a: ra, b: rb, count, seed: run.seed });
  const [lo, hi] = wilson(sim.breaches, sim.count);
  const dur = moments(sim.durations);
  const T = Math.max(...sim.paths.map((p) => p.length - 1));
  const holder = el('div');
  if (raceView.t === null || raceView.t > T) raceView.t = T;

  const draw = () => {
    const t = raceView.t;
    const cut = (p) => Array.from(p.slice(0, t + 1), (s, k) => [k, s]);
    const won = sim.paths.map((p, i) => [p, sim.outcome[i] > 0 && p.length - 1 <= t]);
    holder.replaceChildren(plot({
      x: { min: 0, max: T, title: 'rounds' }, y: { min: -rb - 1, max: ra + 1, title: 'attacker’s lead' }, height: 250,
      layers: [
        { type: 'hline', at: ra, color: BREACH, dash: false, text: `breach +${ra}` },
        { type: 'hline', at: -rb, color: EXPELLED, dash: false, text: `expelled −${rb}`, anchor: 'start' },
        { type: 'hline', at: 0, color: MUTED, dash: true },
        { type: 'paths', paths: sim.paths.filter((p, i) => sim.outcome[i] > 0).map(cut), color: BREACH, label: 'race' },
        { type: 'paths', paths: sim.paths.filter((p, i) => sim.outcome[i] < 0).map(cut), color: EXPELLED, label: 'race' },
      ],
    }), el('p', { class: 'small muted', text: `round ${t} of ${T}: ${won.filter((w) => w[1]).length} breaches and ${sim.paths.filter((p, i) => sim.outcome[i] < 0 && p.length - 1 <= t).length} expulsions among the ${sim.paths.length} races drawn` }));
  };
  const slider = el('input', { type: 'range', min: 0, max: T, step: 1, value: String(raceView.t), 'aria-label': 'round',
    oninput: (e) => { stop(); raceView.t = Number(e.target.value); draw(); } });
  const stop = () => { if (raceTimer) { clearInterval(raceTimer); raceTimer = null; play.textContent = '▶ replay'; } };
  const play = el('button', { type: 'button', text: '▶ replay', onclick: () => {
    if (raceTimer) { stop(); return; }
    raceView.t = 0; play.textContent = '❚❚ pause';
    const stepBy = Math.max(1, Math.round(T / 120));
    raceTimer = setInterval(() => { raceView.t = Math.min(T, raceView.t + stepBy); slider.value = String(raceView.t); draw(); if (raceView.t >= T) stop(); }, 40);
  } });
  if (raceTimer) { clearInterval(raceTimer); raceTimer = null; }
  draw();

  const rs = Array.from({ length: 81 }, (_, i) => 0.3 + (0.4 * i) / 80);
  const curve = plot({
    x: { min: 0.3, max: 0.7, title: 'r = P(attacker wins a round)' }, y: { min: 0, max: 1, title: 'P(breach)' }, height: 220,
    layers: [
      { type: 'line', points: rs.map((x) => [x, race(x, ra, rb).breach]), color: EXACT, label: 'gambler’s ruin' },
      { type: 'vline', at: 0.5, color: MUTED, text: 'fair' },
      { type: 'points', points: [[r, sim.breaches / sim.count]], err: [[r, lo, hi]], color: SIM, r: 5, label: 'simulated' },
    ],
  });
  return {
    answer: { text: `${nice(sim.count)} races with r = ${r}, a = ${ra}, b = ${rb}: the attacker breaches in <strong>${(100 * sim.breaches / sim.count).toFixed(1)} %</strong> [${(100 * lo).toFixed(1)}, ${(100 * hi).toFixed(1)}] (gambler's ruin: ${(100 * ex.breach).toFixed(1)} %), after ${dur.mean.toFixed(1)} ± ${dur.seMean.toFixed(1)} rounds on average (exact ${ex.duration.toFixed(1)}). ` +
      (Math.abs(r - 0.5) < 1e-9 ? `A fair race is decided by the distances alone: b/(a + b) = ${rb}/${ra + rb}.` : `An edge of ${Math.abs(r - 0.5).toFixed(2)} per round turns into ${(100 * Math.abs(ex.breach - rb / (ra + rb))).toFixed(0)} percentage points per race.`) },
    body: [
      ...section(1, 'Twenty races', 'Each line is one race between the two barriers: orange ends in a breach, blue in an expulsion. Replay to watch them run.'),
      el('div', { class: 'row' }, [play, field('round', slider)]),
      holder,
      legend([['path', BREACH, 'ends in a breach'], ['path', EXPELLED, 'ends in an expulsion']]),
      ...section(2, 'Breach probability against the edge per round', 'The exact gambler’s-ruin curve, with the simulated point at the chosen r. Steep around ½: a small edge per round is a large edge per race.'),
      curve,
      table(['', 'simulated', 'exact'], [
        ['P(breach)', `${(sim.breaches / sim.count).toFixed(4)} [${lo.toFixed(4)}, ${hi.toFixed(4)}]`, ex.breach.toFixed(4)],
        ['mean duration (rounds)', `${dur.mean.toFixed(2)} ± ${dur.seMean.toFixed(2)}`, ex.duration.toFixed(2)],
        [`no lower barrier: P(ever +${ra})`, '—', r < 0.5 ? sci(catchUp(r, ra)) : '1 (certain)'],
      ]),
    ],
    rows: [{ r, a: ra, b: rb, races: sim.count, breaches: sim.breaches, p_breach: sim.breaches / sim.count, exact: ex.breach, mean_duration: dur.mean, exact_duration: ex.duration }],
  };
}

startPage({
  shell: hw04Shell('thresholds.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readRun(state);
    const model = modelFrom(run);
    const redraw = () => api.draw();
    const eps = num(state.eps, 0.002, 0.5, run.model === 'ber' ? 0.01 : 0.05), delta = num(state.delta, 1e-9, 0.5, 0.01);
    const a = Math.round(num(state.a, 1, 200, 20));
    const nPick = GRID.includes(Number(state.np)) ? Number(state.np) : 100;
    const ra = Math.round(num(state.ra, 1, 100, 10)), rb = Math.round(num(state.rb, 1, 100, 10)), r = num(state.r, 0.3, 0.7, 0.5);
    const spec = { model: { model: run.model, p: run.p }, run: { m: run.m, grid: GRID, seed: run.seed, keepPaths: 0, trackMax: true, threshold: a } };
    const got = getRun(spec, redraw, 'passage');

    const rShown = el('span', { class: 'eq', text: `r = ${r.toFixed(2)}` });
    return [
      runCard(run, update),
      labPanel({
        id: 'E6', title: 'How many observations does a defender need?', name: `E6-${run.model}-${eps}-${delta}`,
        question: `How many probes must a defender watch before an attacker's observed success rate Sₙ/n is within ε of its true value μ, except with probability δ?`,
        steps: ['Ask each inequality for the n that makes its bound on qₙ(ε) at most δ.', 'Ask the CLT for its estimate.', 'Search for the true answer with the exact binomial tail, n by n.'],
        controls: [
          numberField('ε (precision)', eps, { min: 0.002, max: 0.5, step: 0.001 }, (v) => update({ eps: v })),
          numberField('δ (allowed failure)', delta, { min: 1e-9, max: 0.5, step: 0.001 }, (v) => update({ delta: v })),
        ],
        hints: ['<strong>ε</strong>: how close the measured rate must be to the true one. <strong>δ</strong>: how often it may still miss. The step model, and so σ, comes from the dock below.'],
        view: () => calculator(model, eps, delta),
        why: 'Small biases are expensive to see: the cost grows like 1/ε², but only like ln(1/δ). An attacker who is only slightly better than baseline hides in the noise for a long time. The same arithmetic sets the data needed by a distinguisher in cryptanalysis.',
        notes: [
          'Chebyshev pays 1/δ for confidence; Hoeffding and KL pay only ln(1/δ), because they bound an exponential moment, not just the variance. Hoeffding uses only the range w of a step (1 for Bernoulli, 2 for Rademacher), so for small p it is far worse than KL, which uses p itself.',
          'The exact tail is not monotone in n: the band edges nμ ± nε cross lattice points as n grows, and qₙ jumps up a little each time. "Exact, for good" is the n after the last such crossing above δ.',
          'PRACTICE: a linear approximation of a cipher that holds with probability ½ + ε needs on the order of 1/ε² known plaintexts to be exploited (Matsui’s linear cryptanalysis; 📌 constants in the paper). It is the same 1/ε² as in this table, with ε the bias.',
        ],
      }),
      labPanel({
        id: 'E7', title: 'Breach as a first passage', name: `E7-${run.model}-a${a}-${run.seed}`,
        question: `If a breach means the attacker’s score reaches the level a = ${a}, how likely is it within n systems, when does it happen, and what changes with many attackers?`,
        steps: [
          `Simulate m = ${nice(run.m)} attackers (${model.label()}), recording each one's running maximum Mₙ at every checkpoint and the first step Tₐ at which its score reached a.`,
          'Compare the fraction with Mₙ ≥ a, the histogram of Tₐ and the fraction still below a with the exact formulas.',
          'Split the attackers into groups and count the groups where at least one reached a.',
        ],
        controls: [
          numberField('level a', a, { min: 1, max: 200, step: 1 }, (v) => update({ a: v })),
          field('groups: within n =', el('select', { onchange: (e) => update({ np: e.target.value === '100' ? null : e.target.value }) },
            GRID.map((n) => el('option', { value: n, text: nice(n), selected: n === nPick })))),
        ],
        hints: ['<strong>level a</strong>: the score that counts as a breach. For Rademacher the typical score after n steps is about √n, so a = 20 is "unusual" until n ≈ 400.',
          '<strong>within n</strong>: the horizon for the "at least one of many attackers" panel.'],
        flag: updatingFlag(got),
        waiting: got.result ? null : pending(got, spec, redraw),
        view: () => firstPassage(model, run, got.result, a, nPick),
        why: 'A threshold turns a score into an event: "the attacker got in". Zero drift does not protect: every fixed level is reached eventually. Many attackers turn a rare event per attacker into a near-certainty for the defender.',
        notes: [
          'Reflection principle (Rademacher): for a path that reaches a and ends at s < a, flipping every step after the first visit to a gives a path ending at 2a − s > a. That pairing is a bijection, so P(Mₙ ≥ a, Sₙ < a) = P(Sₙ > a), hence P(Mₙ ≥ a) = 2P(Sₙ > a) + P(Sₙ = a).',
          'Recurrence: the symmetric walk reaches every level with probability 1. But P(Tₐ > n) ≈ a√(2/(πn)), and E[Tₐ] = Σ P(Tₐ > n) diverges. Breach is certain, yet the average waiting time is infinite: a few attackers wait extremely long.',
          'At least one of m: if each attacker breaches with probability q independently, P(at least one) = 1 − (1 − q)ᵐ ≈ mq while mq is small. Rare per attacker is not rare per population.',
        ],
      }),
      labPanel({
        id: 'E7-race', title: 'The race between attacker and defender', name: `E7-race-${ra}-${rb}-${r}`,
        question: 'If every round is won by the attacker with probability r and by the defender otherwise, how often does the attacker breach (+a) before being expelled (−b), and how long does it take?',
        steps: [`Run ${nice(Math.max(500, Math.min(20000, Math.floor(2e7 / Math.max(1, race(r, ra, rb).duration)))))} races from 0 (seed ${run.seed}).`, 'Each round: +1 with probability r, −1 otherwise; stop at +a or −b.', 'Compare the breach fraction and the mean duration with gambler’s ruin.'],
        controls: [
          numberField('breach at +a', ra, { min: 1, max: 100, step: 1 }, (v) => update({ ra: v })),
          numberField('expelled at −b', rb, { min: 1, max: 100, step: 1 }, (v) => update({ rb: v })),
          field('r', el('input', { type: 'range', min: 0.3, max: 0.7, step: 0.01, value: String(r), 'aria-label': 'r',
            oninput: (e) => { rShown.textContent = `r = ${Number(e.target.value).toFixed(2)}`; }, onchange: (e) => update({ r: e.target.value }) })),
          rShown,
        ],
        hints: ['<strong>r</strong> belongs to this panel only: it generalises the Rademacher step (r = ½) to a race where one side has an edge. The dock\'s model is not used here.'],
        view: () => racePanel(run, ra, rb, r),
        why: 'Defence as a race: patches and detections push the attacker back, exploits push it forward. A slight per-round edge decides most races, and with no lower barrier an attacker at a disadvantage still catches up with probability (r/(1 − r))ᵃ.',
        notes: [
          'Gambler\'s ruin by first-step analysis: P(breach from i) = r·P(from i + 1) + (1 − r)·P(from i − 1), with P = 1 at +a and 0 at −b. Fair game: b/(a + b), mean duration ab. Biased, with s = (1 − r)/r: (1 − sᵇ)/(1 − s^(a+b)).',
          'PRACTICE: Bitcoin double-spending is this race without a lower barrier. An attacker with a share q of the hash power, z blocks behind, ever catches up with probability (q/(1 − q))^z when q < ½: q = 0.1, z = 5 gives 1.7·10⁻⁵; q = 0.3, z = 5 gives 0.014 (Nakamoto 2008, §11; 📌 the paper adds a Poisson term for the attacker\'s progress meanwhile).',
        ],
      }),
    ];
  },
});
