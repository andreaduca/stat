/* inference.js — Φ at work in hypothesis testing: p-values of z-tests, the 5σ
   threshold, Bonferroni's correction for many tests, and a simulation of the
   p-values under H₀ and H₁. Pure, no DOM. Note 06 §1; [[z-test and p-values]],
   [[Probability integral transform]]. */

import { Q, PhiInv } from './normal.js';
import { normal } from '../../../assets/js/core/samplers.js';
import { chiSquare } from '../../../assets/js/core/stats.js';

/**
 * p-values of a z statistic. Category: inference.
 *    one-sided (upper)  p = Q(z) = 1 − Φ(z)
 *    two-sided          p = 2Q(|z|)
 * A p-value is a tail area of the normal: the integral of Ex. 2, read at the observed z.
 * At 5σ it is 2.87·10⁻⁷, where 1 − Φ(5) computed by subtraction keeps only 8 digits;
 * at 9σ it is 1.1·10⁻¹⁹, where the subtraction gives 0 (note 06 §1).
 */
export const pOneSided = (z) => Q(z);
export const pTwoSided = (z) => 2 * Q(Math.abs(z));

/** z = (x̄ − μ₀)/(σ/√n), the statistic of the one-sample z-test with known σ. */
export const zFromData = (xbar, mu0, sigma, n) => (xbar - mu0) / (sigma / Math.sqrt(n));

/**
 * The z threshold of a two-sided test at family level α over m tests, Bonferroni:
 *    z* = Φ⁻¹(1 − α/(2m)) = −Φ⁻¹(α/(2m))
 * (the second form avoids rounding 1 − tiny). Category: inference (multiple testing).
 * α = 0.05: z* = 1.96 (m = 1), 4.06 (m = 10³), 5.45 (m = 10⁶): a million tests need the
 * physicists' 5σ, and the p-values to compare against are ≈ 10⁻⁸: far-tail accuracy.
 */
export const bonferroniZ = (alpha, m) => -PhiInv(alpha / (2 * m));

/** The thresholds of the threshold table, with their p-values. */
export const THRESHOLDS = [
  { z: 1.96, what: '95 % two-sided, the textbook default' },
  { z: 3, what: '"3σ evidence" in physics' },
  { z: 5, what: '"5σ discovery" (Higgs boson, 2012)' },
  { z: 5.4513104, what: 'Bonferroni, α = 5 % over 10⁶ tests' },
];

/**
 * R simulated z-tests, each the z statistic of a sample: under H₀, z ~ N(0, 1); under H₁
 * with effect δ (in standard-error units), z ~ N(δ, 1). Returns the two-sided p-values.
 * Category: simulation. Under H₀ the p-values are Uniform(0, 1) — the probability integral
 * transform: if Z has continuous CDF F then F(Z) ~ U(0, 1) [T] — so a histogram is flat
 * and a χ² test should not reject; under H₁ they pile up near 0 (that pile is the power).
 */
export function simulateP(R, delta, rng) {
  const p = new Float64Array(R);
  for (let i = 0; i < R; i++) p[i] = pTwoSided(delta + normal(rng));
  return p;
}

/** Counts of the values in `bins` equal bins of [0, 1], and the χ² uniformity test. */
export function uniformity(values, bins = 20) {
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor(v * bins))]++;
  return { counts, ...chiSquare(counts) };
}
