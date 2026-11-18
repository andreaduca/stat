/* experiments.js — the repeated simulations of hw07, run in the worker
   (js/workers/sim.js): many seeded runs of a test, to see the distribution of χ²
   or of p under the null, the power against an alternative, the bias of the plug-in
   mutual information. Pure, no DOM: runs under Node too, so each one can be checked
   against the reference values of draft §8.3 in a scratch script.
   Each experiment takes plain arguments plus onProgress and returns plain data
   (typed arrays are handed to the page without copying). */

import { SeededRng } from '../../../assets/js/core/rng.js';
import { ContingencyTable } from './table.js';
import { chiSquare, gTest, welchT, sampleSize } from './tests.js';
import { source, serialTable, stickyW } from './generators.js';
import { traces, leakageTable, classLeaks } from './sidechannel.js';
import { shiftTable } from './secrecy.js';

/** One id per experiment, so each draws an independent stream from the same seed. */
export const ID = { serial: 1, sticky: 2, miBias: 3, side: 4, otp: 5, typeOne: 6, fourTables: 10, detection: 11, sideDetection: 12, causal: 20 };

/** An independent generator for one experiment and run: (seed ⊕ (id·1000 + run + 1)·φ) through
 *  the splitmix32 seeding of SeededRng, so nearby ids and runs give unrelated streams. */
export const stream = (seed, id, sub = 0) => new SeededRng((seed ^ Math.imul(id * 1000 + sub + 1, 0x9e3779b9)) >>> 0);
const subSeed = (seed, id, run) => stream(seed, id, run).u32();

const progress = (onProgress, r, R) => { if ((r & 15) === 0) onProgress(r / R); };

/**
 * Simulated power of the serial test against the sticky generator: the share of R runs of
 * N pairs where p ≤ α. Category: simulation (to set beside the asymptotic noncentral-χ² power).
 */
export function stickyPower({ eps, k = 16, N, R = 500, alpha = 0.01, seed, onProgress = () => {} }) {
  let hits = 0;
  const ps = new Float64Array(R);
  for (let r = 0; r < R; r++) {
    ps[r] = chiSquare(serialTable(source('sticky', { seed: subSeed(seed, ID.sticky, r), k, eps }), N, k)).p;
    if (ps[r] <= alpha) hits++;
    progress(onProgress, r, R);
  }
  return { eps, k, N, R, alpha, power: hits / R, ps };
}

/**
 * The power table of the generators page: for each ε, the pairs N that give 80 % asymptotic power
 * (noncentral χ², λ = N ε²(k − 1)) and the simulated power at that N (R runs each).
 * Category: simulation. Expected (k = 16, α = 0.01): N = 504 / 2015 / 12593 / 50372 for
 * ε = 0.1 / 0.05 / 0.02 / 0.01; simulated power somewhat below 0.80 (few counts per cell).
 */
export function stickyPowerTable({ epsList = [0.1, 0.05, 0.02, 0.01], k = 16, R = 500, alpha = 0.01, seed, onProgress = () => {} }) {
  const df = (k - 1) ** 2;
  const plan = epsList.map((eps) => ({ eps, N: sampleSize({ df, w: stickyW(eps, k), alpha }).n }));
  const total = plan.reduce((s, q) => s + q.N, 0);
  let done = 0;
  const rows = plan.map(({ eps, N }, e) => {
    let hits = 0;
    for (let r = 0; r < R; r++) {
      const t = serialTable(source('sticky', { seed: subSeed(seed, ID.sticky, e * R + r), k, eps }), N, k);
      if (chiSquare(t).p <= alpha) hits++;
      if ((r & 15) === 0) onProgress((done + (N * r) / R) / total);
    }
    done += N;
    return { eps, N, power: hits / R };
  });
  return { k, R, alpha, rows };
}

/**
 * The bias of the plug-in mutual information: R tables of N independent uniform pairs (r × c),
 * Î of each. Category: simulation. Expected mean ≈ (r − 1)(c − 1)/(2N ln 2) bits (Lemma 4),
 * a little above it for small N.
 */
export function miBias({ r = 4, c = 4, Ns = [100, 1000, 10000], R = 2000, seed, onProgress = () => {} }) {
  const out = Ns.map((N) => ({ N, values: new Float64Array(R), baseline: ((r - 1) * (c - 1)) / (2 * N * Math.LN2) }));
  const rows = Array.from({ length: r }, (_, i) => String(i)), cols = Array.from({ length: c }, (_, j) => String(j));
  out.forEach((o, n) => {
    for (let run = 0; run < R; run++) {
      const rng = stream(seed, ID.miBias, n * R + run);
      const t = new ContingencyTable(rows, cols);
      for (let i = 0; i < o.N; i++) t.add(rng.int(r), rng.int(c));
      o.values[run] = gTest(t).mutualInfoBits;
      progress(onProgress, n * R + run, Ns.length * R);
    }
  });
  return { r, c, R, results: out };
}

/**
 * R runs of the side-channel experiment: the χ² test (HW class × 9 quantile bins, df 32) and
 * Welch's t (HW 0 vs HW 4) on the same traces. Category: simulation.
 */
export function sideChannelRuns({ masked, sigma, n, R = 200, bins = 9, key = 0xb, seed, onProgress = () => {} }) {
  const chiP = new Float64Array(R), tP = new Float64Array(R), chiLog = new Float64Array(R), tLog = new Float64Array(R);
  for (let r = 0; r < R; r++) {
    const { labels, leaks } = traces(stream(seed, ID.side, r), n, { masked, sigma, key });
    const x = chiSquare(leakageTable(labels, leaks, bins));
    const t = welchT(...classLeaks(labels, leaks, 0, 4));
    chiP[r] = x.p; chiLog[r] = x.log10p; tP[r] = t.p; tLog[r] = t.log10p;
    progress(onProgress, r, R);
  }
  return { masked, sigma, n, R, chiP, tP, chiLog, tLog };
}

/** R one-time-pad tables of N letters: their χ² should look like χ²₆₂₅ (mean 625). Category: simulation. */
export function otpRuns({ N = 200000, R = 200, seed, onProgress = () => {} }) {
  const chi2 = new Float64Array(R);
  for (let r = 0; r < R; r++) {
    chi2[r] = chiSquare(shiftTable(stream(seed, ID.otp, r), N, 'fresh')).chi2;
    progress(onProgress, r, R);
  }
  return { N, R, chi2 };
}

/**
 * Type-I error of the 2 × 2 χ² test: R tables of N independent pairs with P(row 1) = pRow,
 * P(col 1) = pCol; the share with p ≤ α. Category: simulation. With few expected counts the
 * χ² approximation is conservative (≈ 0.025 at N = 10 for nominal 0.05); from N ≈ 100 it is on target.
 * `rate` counts every table; `rateValid` only those where the test can run (no empty row or
 * column, df > 0): at N = 10 with pCol = 0.1 about a third of the tables have an empty column.
 */
export function typeOne({ N, pRow = 0.5, pCol = 0.1, R = 20000, alpha = 0.05, seed, onProgress = () => {} }) {
  let hits = 0, valid = 0;
  for (let r = 0; r < R; r++) {
    const rng = stream(seed, ID.typeOne, r);
    const t = new ContingencyTable(['a', 'b'], ['a', 'b']);
    for (let i = 0; i < N; i++) t.add(rng.float() < pRow ? 0 : 1, rng.float() < pCol ? 0 : 1);
    const x = chiSquare(t);
    if (x.df > 0) { valid++; if (x.p <= alpha) hits++; }
    progress(onProgress, r, R);
  }
  return { N, R, alpha, rate: hits / R, rateValid: valid ? hits / valid : NaN, valid };
}

/* ---------- the generators page (cheap enough for the main thread) ---------- */

/** The four serial tables of E5, N non-overlapping pairs each. The LCG is seeded with the page
 *  seed itself (its low bits fail for every seed; seed 12345 is the reference of draft §8.2),
 *  xoshiro and the sticky generator with their own sub-streams. Category: simulation. */
export function generatorTables({ seed, N, eps, k = 16 }) {
  const seeds = { good: stream(seed, ID.fourTables, 0).u32(), lcgLow: seed, lcgHigh: seed, sticky: stream(seed, ID.fourTables, 1).u32() };
  return ['good', 'lcgLow', 'lcgHigh', 'sticky'].map((kind) => ({ kind, table: serialTable(source(kind, { seed: seeds[kind], k, eps }), N, k) }));
}

/**
 * Detection as the pairs accumulate: log₁₀ p of the serial test after n pairs, at about
 * `points` log-spaced values of n up to Nmax, for one stream of one generator (the table
 * grows; nothing is recomputed from scratch). Category: simulation.
 * @returns {[number, number][]}  [n, log₁₀ p]
 */
export function detectionPath({ kind, seed, eps = 0.05, k = 16, Nmax, from = 100, points = 60 }) {
  const next = source(kind, { seed: stream(seed, ID.detection, kind === 'sticky' ? 1 : 0).u32(), k, eps });
  const labels = Array.from({ length: k }, (_, i) => String(i));
  const t = new ContingencyTable(labels, labels);
  const out = [];
  let n = 0;
  for (let q = 0; q <= points; q++) {
    const target = Math.round(from * (Nmax / from) ** (q / points));
    while (n < target) { const a = next(); t.add(a, next()); n++; }
    out.push([n, chiSquare(t).log10p]);
  }
  return out;
}

/**
 * Side-channel detection as the traces accumulate: log₁₀ p of the χ² test (HW class × 9 bins
 * at the pooled quantiles of the traces so far) and of Welch's t (HW 0 vs HW 4) after n traces,
 * at about `points` log-spaced n up to N, on one stream. Category: simulation.
 * @returns {{n: number, chi: number, t: number}[]}
 */
export function sideDetectionPath({ masked, sigma, N, key = 0xb, seed, from = 100, points = 40 }) {
  const { labels, leaks } = traces(stream(seed, ID.sideDetection, masked ? 1 : 0), N, { masked, sigma, key });
  const out = [];
  for (let q = 0; q <= points; q++) {
    const n = Math.round(from * (N / from) ** (q / points));
    const x = chiSquare(leakageTable(labels, leaks, 9, n));
    const t = welchT(...classLeaks(labels, leaks, 0, 4, n));
    out.push({ n, chi: x.log10p, t: Number.isFinite(t.log10p) ? t.log10p : 0 });
  }
  return out;
}
