/* estimate.js — what is measured on the m simulated attackers at one
   checkpoint: sample moments with their standard errors, the counts of each
   value (the lattice histogram), the empirical CDF and its Kolmogorov–Smirnov
   distance to a reference, Q-Q points, and a χ² goodness of fit against the
   exact law. This is the "simulation" layer of every plot; its error shrinks
   like 1/√m by the same LLN and CLT the homework studies. Pure, no DOM.
   HMWK4 note 03 §4–5; [[Monte Carlo estimation]],
   [[Empirical distribution function and KS distance]]. */

import { chiSquare } from '../../../assets/js/core/stats.js';
import { normInv } from './numeric.js';

/** Sample moments of m values, with standard errors.
 *  Category: estimator.
 *    mean x̄, unbiased variance s² = Σ(x − x̄)²/(m − 1),
 *    skewness g₁ = m₃/m₂^{3/2}, excess kurtosis g₂ = m₄/m₂² − 3 (mₖ central moments),
 *    SE(x̄) = s/√m, SE(s²) ≈ s²·√(2/(m − 1) + g₂/m)  ([[Monte Carlo estimation]] lemma 3).
 *  The relative error of a variance is ≈ √(2/m): 1.4 % at m = 10⁴ (note 03 §2). */
export function moments(values) {
  const m = values.length;
  let sum = 0;
  for (let i = 0; i < m; i++) sum += values[i];
  const mean = sum / m;
  let m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < m; i++) {
    const d = values[i] - mean, d2 = d * d;
    m2 += d2; m3 += d2 * d; m4 += d2 * d2;
  }
  const variance = m > 1 ? m2 / (m - 1) : 0;
  m2 /= m; m3 /= m; m4 /= m;
  const skewness = m2 > 0 ? m3 / m2 ** 1.5 : 0;
  const exKurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;
  return {
    m, mean, variance, sd: Math.sqrt(variance), skewness, exKurtosis,
    seMean: Math.sqrt(variance / m),
    seVar: variance * Math.sqrt(Math.max(0, 2 / Math.max(1, m - 1) + exKurtosis / m)),
  };
}

/** The moments of Sₙ/c from those of Sₙ: the mean and its SE divide by c, the
 *  variance and its SE by c²; skewness and kurtosis do not change (they are
 *  scale-free). With c = n^α this gives all three quantities from one pass. */
export const scaleMoments = (mom, c) => ({
  ...mom, mean: mom.mean / c, variance: mom.variance / (c * c), sd: mom.sd / c,
  seMean: mom.seMean / c, seVar: mom.seVar / (c * c),
});

/** The distinct values of an integer sample, sorted, with how often each occurs.
 *  Category: estimator. For a lattice variable this IS the histogram with one bin
 *  per atom — the only binning that creates no artefacts (note 02 §3).
 *  @returns {{values: Int32Array, counts: Int32Array, m: number}} */
export function atoms(sample) {
  let lo = Infinity, hi = -Infinity;
  for (const v of sample) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const tally = new Int32Array(hi - lo + 1);
  for (const v of sample) tally[v - lo]++;
  const values = [], counts = [];
  for (let i = 0; i < tally.length; i++) if (tally[i]) { values.push(lo + i); counts.push(tally[i]); }
  return { values: Int32Array.from(values), counts: Int32Array.from(counts), m: sample.length };
}

/** Fixed-width bins on [lo, hi): counts per bin and density (count / (m·width)).
 *  Category: estimator. The "naive bins" of the CLT page — on a lattice, bins
 *  that do not line up with the atoms hold 1 or 2 atoms alternately, and the
 *  histogram shows a comb that is an artefact of the binning, not of the data. */
export function binned(sample, lo, hi, bins, scale = 1) {
  const width = (hi - lo) / bins, counts = new Float64Array(bins);
  for (const raw of sample) {
    const v = raw / scale;
    if (v >= lo && v < hi) counts[Math.floor((v - lo) / width)]++;
  }
  const m = sample.length;
  return { lo, width, counts, density: Array.from(counts, (c) => c / (m * width)) };
}

/** KS distance between the empirical CDF of a lattice sample and a continuous CDF G:
 *  D = sup_x |F̂(x) − G(x)|.
 *  Category: test statistic.
 *  Method: ties grouped — F̂ jumps once per distinct value, so at each atom x the
 *  gap is checked just before (F̂(x⁻)) and at (F̂(x)) the jump
 *  ([[Empirical distribution function and KS distance]] lemma 2).
 *  `map` turns a stored value into the variable G is about (e.g. s ↦ s/√n). */
export function ksToContinuous(at, cdf, map = (v) => v) {
  let before = 0, D = 0;
  for (let i = 0; i < at.values.length; i++) {
    const g = cdf(map(at.values[i]));
    const after = before + at.counts[i] / at.m;
    D = Math.max(D, Math.abs(after - g), Math.abs(before - g));
    before = after;
  }
  return D;
}

/** KS distance between the empirical CDF and the EXACT finite-n CDF, sup|F̂ − Fₙ|.
 *  Both are step functions on the same lattice, so comparing them after each
 *  atom of the exact support is enough. This is the pure sampling noise
 *  (no theorem error at all): it should be ≈ 0.87/√m on average. */
export function ksToExact(at, law) {
  let i = 0, Fhat = 0, F = 0, D = 0;
  for (let k = 0; k < law.s.length; k++) {
    F += law.prob[k];
    while (i < at.values.length && at.values[i] <= law.s[k]) Fhat += at.counts[i++] / at.m;
    D = Math.max(D, Math.abs(Fhat - F));
  }
  return D;
}

/** Points of a normal Q-Q plot: the j-th smallest value against Φ⁻¹((j − ½)/m).
 *  Category: visualisation. A straight diagonal means "normal"; a staircase is
 *  the lattice; a bend at one end is skewness. Thinned to at most `max` points
 *  (evenly in rank, always keeping both extremes) so the SVG stays light. */
export function qqPoints(sample, map = (v) => v, max = 2000) {
  const sorted = Float64Array.from(sample, map).sort();
  const m = sorted.length, step = Math.max(1, (m - 1) / (max - 1));
  const pts = [];
  for (let r = 0; r < m; r += step) {
    const j = Math.round(r);
    pts.push([normInv((j + 0.5) / m), sorted[j]]);
    if (j === m - 1) break;
  }
  if (pts.at(-1)[1] !== sorted[m - 1]) pts.push([normInv((m - 0.5) / m), sorted[m - 1]]);
  return pts;
}

/** Pearson χ² goodness of fit of the observed values against the exact law,
 *  merging neighbouring atoms until each merged cell expects at least 5.
 *  Category: test (note 03 §4). A p-value that is not systematically tiny means
 *  the simulation reproduces the exact distribution. */
export function gofToExact(at, law, minExpected = 5) {
  const obs = new Map();
  for (let i = 0; i < at.values.length; i++) obs.set(at.values[i], at.counts[i]);
  const O = [], E = [];
  let o = 0, e = 0;
  for (let k = 0; k < law.s.length; k++) {
    o += obs.get(law.s[k]) ?? 0;
    e += law.prob[k] * at.m;
    if (e >= minExpected) { O.push(o); E.push(e); o = 0; e = 0; }
  }
  if (e > 0 || o > 0) {
    if (E.length) { O[O.length - 1] += o; E[E.length - 1] += e; } else { O.push(o); E.push(e); }
  }
  return E.length > 1 ? { ...chiSquare(O, E), cells: E.length } : { stat: 0, df: 0, p: 1, cells: E.length };
}

/** How many attackers ended outside the LLN band: Sₙ ≥ hi or Sₙ ≤ lo,
 *  with the integer edges from exact.js's bandEdges (the same outcomes the
 *  exact tail counts). */
export function outsideBand(sample, { hi, lo }) {
  let k = 0;
  for (const v of sample) if (v >= hi || v <= lo) k++;
  return k;
}
