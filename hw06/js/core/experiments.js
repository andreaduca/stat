/* experiments.js — the heavy loops of hw06, run in the worker (js/workers/sim.js):
   convergence and cost sweeps of Ex. 1, Thomae and fat-Cantor sums for large N,
   the accuracy and timing maps of Φ, and the simulations of the extensions.
   Pure, no DOM: runs under Node too, so each one can be checked against its
   reference values in a scratch script. Each takes plain arguments plus onProgress
   and returns plain data. Every random experiment draws its own sub-stream. */

import { SeededRng } from '../../../assets/js/core/rng.js';
import { linFit } from '../../../assets/js/core/numeric.js';
import { median, moments } from '../../../assets/js/core/stats.js';
import { FUNCTIONS, RIEMANN_INTEGRABLE } from './functions.js';
import { RULES } from './riemann.js';
import { AnalyticMeasure, RootFindingMeasure, MonteCarloMeasure, GridCountMeasure as GridCountMeasureLocal, lowerSum, layerCakeMidpoint, layerCakeGrid, geometricGrid, layerCakeExact } from './lebesgue.js';
import { thomaeLeftSum, thomaeMidSum, thomaeUpper, fatCantorUpper, inFatCantor, p4Partials } from './pathological.js';
import { METHODS, hybrid, viaErfc, naiveLower, kappa, pdf, pdfAccurate } from './normal.js';
import { simulateP, uniformity } from './inference.js';
import { buildCDT, sampleEarlyExit, sampleConstantTime } from './cdt.js';
import { distinguisher as runDistinguisher, sdGaussClosed } from './privacy.js';
import { plainMC, qmc, ballMC, rareEvent as runRare } from './montecarlo.js';
import REF from '../../data/phi-reference.js';

/** One id per experiment, so each draws an independent stream from the same seed. */
export const ID = { overview: 1, efficiency: 2, fatCantor: 3, inference: 4, cdt: 5, distinguisher: 6, mc: 7, ball: 8, rare: 9, galton: 10, measureMC: 11 };

/** An independent generator for one experiment: (seed ⊕ id·φ) through the
 *  splitmix32 seeding of SeededRng, so nearby ids give unrelated streams. */
export const stream = (seed, id, sub = 0) => new SeededRng((seed ^ Math.imul(id * 1000 + sub + 1, 0x9e3779b9)) >>> 0);

/** Time per run of `run`: repeated until at least 5 ms have passed (browsers coarsen
 *  performance.now to ≈ 0.1 ms, so a single fast run would read 0), then the median of
 *  three such batches. Returns the last result with `ms` = time per run. */
export function clock(run) {
  const batches = [];
  let r;
  for (let b = 0; b < 3; b++) {
    let reps = 0;
    const t0 = performance.now();
    do { r = run(); reps++; } while (performance.now() - t0 < 5);
    batches.push((performance.now() - t0) / reps);
  }
  return { ...r, ms: median(batches) };
}

/** Sizes of a 1-2-5 sweep between lo and hi. */
export function sweep(lo, hi) {
  const out = [];
  for (let d = 1; d <= hi; d *= 10) for (const m of [1, 2, 5]) { const v = m * d; if (v >= lo && v <= hi) out.push(v); }
  return out;
}

/** Least-squares slope of log₁₀ error against log₁₀ size over sizes in [lo, hi], errors > 10⁻¹³ only. */
export function fittedSlope(rows, lo = 10, hi = 1000) {
  const pts = rows.filter(([n, e]) => n >= lo && n <= hi && e > 1e-13);
  if (pts.length < 3) return null;
  return linFit(pts.map(([n]) => Math.log10(n)), pts.map(([, e]) => Math.log10(e))).slope;
}

/**
 * E2 · convergence of every rule on one function: error against N (Riemann) or K (Lebesgue),
 * with the cost in evaluations of f. f5 gets the geometric t-grid on [1, 10⁸] with its
 * analytic tail; f8's analytic measure is the series of draft §4.3.
 * Category: experiment (deterministic).
 */
export function convergence({ fid, sizes = sweep(10, 100000), onProgress = () => {} }) {
  const fn = FUNCTIONS[fid], series = {};
  const add = (key, n, value, evals) => (series[key] ??= []).push([n, Math.abs(value - fn.exact), evals]);
  const bounded = Number.isFinite(fn.range[1]);
  sizes.forEach((n, i) => {
    for (const [key, r] of Object.entries(RULES)) {
      if ((key === 'left' || key === 'trapezoid' || key === 'simpson') && fn.open.a) continue;   // f(a) undefined
      fn.resetCount();
      const res = r.run(fn, n);
      add(key, n, res.value, res.evals);
    }
    const A = new AnalyticMeasure(fn);
    if (bounded && (fid !== 'f8' || n <= 2000)) {
      add('lower', n, lowerSum(fn, A, n).value, 0);
      add('layercake', n, layerCakeMidpoint(fn, A, n).value, 0);
    } else if (!bounded) {
      add('geometric', n, layerCakeGrid(fn, A, geometricGrid(fn.range[0], 1e8, n), { tail: fn.tail }).value, 0);
    }
    onProgress((i + 1) / sizes.length);
  });
  const slopes = Object.fromEntries(Object.entries(series).map(([k, rows]) => [k, fittedSlope(rows)]));
  return { fid, exact: fn.exact, series, slopes };
}

/**
 * E3 · error against cost for the methods that pay in evaluations: Riemann rules, the layer
 * cake with root-finding preimages, and the layer cake on a Monte Carlo sample. Wall-clock
 * time per run is measured too (median of 3; machine-dependent).
 */
export function efficiency({ fid, seed, onProgress = () => {} }) {
  const fn = FUNCTIONS[fid], out = {};
  const timeIt = (run) => clock(() => { fn.resetCount(); return run(); });
  const push = (key, size, r) => (out[key] ??= []).push({ size, error: Math.abs(r.value - fn.exact), evals: r.evals ?? r.cost, ms: r.ms });
  const Ns = sweep(10, 100000), Ks = fid === 'f8' ? [5, 10, 20, 50] : sweep(5, 10000);
  let done = 0; const total = Ns.length + Ks.length * 2;
  for (const N of Ns) {
    for (const key of ['midpoint', 'simpson']) if (!(key === 'simpson' && fn.open.a)) push(key, N, timeIt(() => RULES[key].run(fn, N)));
    push('mc', N, timeIt(() => { const P = new MonteCarloMeasure(fn, stream(seed, ID.efficiency, N), N); return layerCakeExact(P); }));
    onProgress(++done / total);
  }
  const bounded = Number.isFinite(fn.range[1]);
  // unbounded f (f5): the layer cake on a geometric t-grid with the analytic tail
  const cake = (P, K) => (bounded ? layerCakeMidpoint(fn, P, K) : layerCakeGrid(fn, P, geometricGrid(fn.range[0], 1e8, K), { tail: fn.tail }));
  if (fn.pieces) for (const K of Ks) {
    push('root', K, timeIt(() => cake(new RootFindingMeasure(fn), K)));
    onProgress(++done / total);
  }
  for (const K of Ks) {
    push('analytic', K, timeIt(() => ({ ...cake(new AnalyticMeasure(fn), K), evals: 0 })));
    onProgress(++done / total);
  }
  return { fid, series: out };
}

/** P2 Thomae: left, mid and upper Darboux sums for each N (exact integer arithmetic). */
export function thomae({ Ns, onProgress = () => {} }) {
  return Ns.map((N, i) => {
    const r = { N, left: thomaeLeftSum(N).value, mid: thomaeMidSum(N).value, upper: thomaeUpper(N) };
    onProgress((i + 1) / Ns.length);
    return r;
  });
}

/** P3 fat Cantor: left-, mid- and random-tag Riemann sums and the upper Darboux sum for each N. */
export function fatCantor({ Ns, seed, onProgress = () => {} }) {
  return Ns.map((N, i) => {
    const rng = stream(seed, ID.fatCantor, i);
    let l = 0, m = 0, r = 0;
    for (let j = 0; j < N; j++) { l += inFatCantor(j / N); m += inFatCantor((j + 0.5) / N); r += inFatCantor((j + rng.float()) / N); }
    onProgress((i + 1) / Ns.length);
    return { N, left: l / N, mid: m / N, random: r / N, lower: 0, upper: fatCantorUpper(N) };
  });
}

/** P4 partial integrals at log-spaced T. */
export const p4 = ({ Ts }) => p4Partials(Ts);

/**
 * E7 · relative (and absolute) error of every method on the 2001-point reference grid, plus
 * the routes of E10. The reference is the 80-digit table (data/phi-reference.js).
 */
export function accuracy({ s = 2, onProgress = () => {} }) {
  const xs = new Float64Array(REF.grid.map((r) => r[0])), ref = REF.grid.map((r) => Number(r[1]));
  const series = {};
  const run = (key, f) => {
    const rel = new Float64Array(xs.length), abs = new Float64Array(xs.length), cost = new Float64Array(xs.length);
    xs.forEach((x, i) => {
      const r = f(x), v = typeof r === 'number' ? r : r.value;
      abs[i] = Math.abs(v - ref[i]); rel[i] = abs[i] / ref[i]; cost[i] = typeof r === 'number' ? 0 : r.cost;
    });
    series[key] = { rel, abs, cost };
  };
  METHODS.forEach((m, i) => { run(m.id, m.id === 'M7' ? (x) => hybrid(x, s) : m.run); onProgress((i + 1) / (METHODS.length + 4)); });
  run('M7-nosplit', (x) => hybrid(x, s, false));
  run('erfc', viaErfc);
  run('naive', naiveLower);
  const kap = new Float64Array(xs.length); xs.forEach((x, i) => { kap[i] = kappa(x); });
  return { xs, series, kappa: kap, s };
}

/**
 * E8 · time per call of each method: median over `reps` repetitions of `calls` calls at
 * points spread over [−10, 5] (a sum is kept so the work cannot be optimised away).
 * Machine- and engine-dependent; the ranking is what transfers.
 */
export function timing({ calls = 100000, reps = 5, onProgress = () => {} }) {
  const pts = Array.from({ length: 64 }, (_, i) => -10 + (15 * i) / 63);
  const out = {};
  const cases = [...METHODS.map((m) => [m.id, (x) => m.run(x).value]), ['pdf', pdf], ['pdfAccurate', pdfAccurate]];
  cases.forEach(([id, f], k) => {
    const n = id === 'M1' || id === 'M3' ? calls / 100 : id === 'M2' || id === "M2'" || id === 'M5' ? calls / 10 : calls;
    const ts = [];
    let sink = 0;
    for (let r = 0; r < reps; r++) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) sink += f(pts[i & 63]);
      ts.push(((performance.now() - t0) * 1e6) / n);
    }
    out[id] = { nsPerCall: median(ts), calls: n, sink };
    onProgress((k + 1) / cases.length);
  });
  return out;
}

/** E12 · R simulated z-tests under H₀ and under H₁ (effect δ): p-value histograms and the χ² uniformity test. */
export function inference({ R, delta, seed }) {
  const p0 = simulateP(R, 0, stream(seed, ID.inference, 0)), p1 = simulateP(R, delta, stream(seed, ID.inference, 1));
  let below = 0;
  for (const v of p1) if (v < 0.05) below++;
  return { R, delta, h0: uniformity(p0), h1: uniformity(p1), power: below / R };
}

/** E13 · n samples from each sampler: histograms, comparison counts by output, their moments. */
export function cdtSamples({ sigma, T, bits, n, seed }) {
  const table = buildCDT({ sigma, T, bits });
  const res = {};
  for (const [key, sampler, sub] of [['early', sampleEarlyExit, 0], ['constant', sampleConstantTime, 1]]) {
    const rng = stream(seed, ID.cdt, sub), counts = new Array(table.support.length).fill(0);
    const comps = new Float64Array(n), byOutput = new Array(table.support.length).fill(0);
    for (let i = 0; i < n; i++) {
      const { x, comparisons } = sampler(table, rng);
      counts[x + T]++; comps[i] = comparisons; byOutput[x + T] = comparisons;
    }
    const mom = moments(comps);
    res[key] = { counts, byOutput, meanComparisons: mom.mean, sdComparisons: Math.sqrt(mom.variance * (n - 1) / n) };
  }
  return { sigma, T, bits, n, q: table.q.map(Number), sd: table.sd, zeros: table.zeros, from: table.from, ...res };
}

/** E14 · the threshold distinguisher at each μ against Δ = 2Φ(μ/2) − 1. */
export function distinguisher({ mus, n, seed }) {
  return mus.map((mu, i) => ({ mu, sd: sdGaussClosed(mu), ...runDistinguisher(mu, n, stream(seed, ID.distinguisher, i)) }));
}

/** E15 · MC, QMC, midpoint and Simpson on one function, error against N (MC with its SE). */
export function mcCompare({ fid, Ns, seed }) {
  const fn = FUNCTIONS[fid];
  return Ns.map((N, i) => {
    const mc = plainMC(fn, N, stream(seed, ID.mc, i)), q = qmc(fn, N);
    const mid = RULES.midpoint.run(fn, N), simp = fn.open.a ? null : RULES.simpson.run(fn, N);
    return { N, mc: mc.value, mcSE: mc.se, qmc: q.value, mid: mid.value, simpson: simp?.value ?? null, exact: fn.exact };
  });
}

/** E15 · the d-ball volume for d = 2…10 at fixed N. */
export const ball = ({ N, seed, ds = [2, 3, 4, 5, 6, 7, 8, 9, 10] }) => ds.map((d) => ballMC(d, N, stream(seed, ID.ball, d)));

/** E15 · Q(5) by plain and importance sampling. */
export const rare = ({ N, seed }) => runRare(N, stream(seed, ID.rare));

/** The measure providers of E1 by name, with what each needs. */
export const PROVIDERS = {
  analytic: { label: 'analytic inverse', needs: (fn) => !!fn.muGt },
  root: { label: 'root finding', needs: (fn) => !!fn.pieces },
  mc: { label: 'Monte Carlo (N points)', needs: () => true },
  grid: { label: 'grid count (N midpoints)', needs: () => true },
};

/**
 * E1 · one function, one Riemann rule with N cells, and the two Lebesgue rules with K levels
 * and the chosen measure provider; value, cost in evaluations of f, and wall-clock time.
 * Unbounded f (f5): the Lebesgue rules become the layer cake on a geometric t-grid on
 * [1, 10⁸] with the analytic tail (analytic, root) or the exact layer cake of the sample (mc, grid).
 * Combinations that would take minutes are refused with a reason (f8: 10⁵ series terms or
 * 2000 root solves per level).
 */
export function e1({ fid, rule, N, K, provider, seed }) {
  const fn = FUNCTIONS[fid];
  const timed = (run) => { const r = clock(() => { fn.resetCount(); const v = run(); return { ...v, evals: v.evals ?? fn.evals }; }); return r; };
  const out = { fid, exact: fn.exact };
  if (fn.open.a && (rule === 'left' || rule === 'trapezoid' || rule === 'simpson')) out.riemann = { note: `f(${fn.a}) is undefined: this rule evaluates the left end` };
  else out.riemann = timed(() => RULES[rule].run(fn, N));
  if (!PROVIDERS[provider].needs(fn)) { out.note = provider === 'root' ? 'no monotone pieces to solve on (a fat Cantor set has none)' : 'no closed-form measure'; return out; }
  if (fid === 'f8' && provider === 'analytic' && K > 5000) { out.note = 'K ≤ 5000 for f8 with the series measure (10⁵ terms per level)'; return out; }
  if (fid === 'f8' && provider === 'root' && K > 500) { out.note = 'K ≤ 500 for f8 with root finding (2000 solves per level)'; return out; }
  const make = () => (provider === 'analytic' ? new AnalyticMeasure(fn) : provider === 'root' ? new RootFindingMeasure(fn)
    : provider === 'mc' ? new MonteCarloMeasure(fn, stream(seed, ID.measureMC), N) : new GridCountMeasureLocal(fn, N));
  const bounded = Number.isFinite(fn.range[1]);
  if (bounded) {
    out.lower = timed(() => { const P = make(); const r = lowerSum(fn, P, K); return { ...r, evals: fn.evals }; });
    out.cake = timed(() => { const P = make(); const r = layerCakeMidpoint(fn, P, K); return { ...r, evals: fn.evals }; });
  } else if (provider === 'analytic' || provider === 'root') {
    out.cake = timed(() => { const P = make(); const r = layerCakeGrid(fn, P, geometricGrid(fn.range[0], 1e8, K), { tail: fn.tail }); return { ...r, evals: fn.evals }; });
    out.cakeNote = `geometric t-grid on [1, 10⁸] with the analytic tail 1/T`;
  } else {
    out.cake = timed(() => { const P = make(); const r = layerCakeExact(P); return { ...r, evals: fn.evals }; });
    out.cakeNote = 'the sample’s own staircase, integrated exactly (a uniform t-grid cannot reach an unbounded range)';
  }
  return out;
}

/**
 * E2 · do both approaches reach the same limit? Every Riemann-integrable function of the
 * collection, with the midpoint rule at N = 10⁵ and the layer cake (analytic measure) at
 * K = 10⁵ (f8: K = 2000, its series costs 10⁵ terms per level), against the exact value.
 */
export function agreement({ onProgress = () => {} }) {
  const ids = [...RIEMANN_INTEGRABLE, 'f5'];
  return ids.map((fid, i) => {
    const fn = FUNCTIONS[fid], A = new AnalyticMeasure(fn), N = 100000, K = fid === 'f8' ? 2000 : 100000;
    const r = RULES.midpoint.run(fn, N).value;
    const c = Number.isFinite(fn.range[1]) ? layerCakeMidpoint(fn, A, K).value
      : layerCakeGrid(fn, A, geometricGrid(fn.range[0], 1e8, 1000), { tail: fn.tail }).value;
    onProgress((i + 1) / ids.length);
    return { fid, N, K: Number.isFinite(fn.range[1]) ? K : 1000, riemann: r, lebesgue: c, exact: fn.exact, improper: fid === 'f5' };
  });
}
