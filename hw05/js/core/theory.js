/* theory.js — what the sampling theory predicts, as exact formulas of a
   distribution's moments: the spread of x̄ and s² over repeated samples, the
   tilt between them, the bias of s, the standard errors that turn "close to
   the truth" into a z-score, the limit coverage of the χ² interval, the
   stationary moments of the exponentially weighted baseline, the DP noise, and
   the sample sizes a defender needs. The pages draw these as the solid lines
   the simulations are measured against. Pure, no DOM.
   HW5 notes 02 §2, 04, 06; [[Variance of the sample variance]],
   [[Sum of squares and sample variance]], [[Confidence intervals and coverage]]. */

import { lnGamma } from '../../../assets/js/core/stats.js';
import { normCdf, normInv } from '../../../assets/js/core/numeric.js';

/** Var(x̄) = σ²/n, for any shape.
 *  Category: exact formula ([[Sample mean]] Lemma 1: variance of a sum of independent terms, scaled by 1/n²). */
export const varMean = (dist, n) => dist.variance / n;

/** Var(s²) = μ₄/n − (n − 3)σ⁴/(n(n − 1)) = σ⁴(2/(n − 1) + κ/n).
 *  Category: exact formula ([[Variance of the sample variance]] Theorem, pairwise-form proof).
 *  The 2/(n−1) part is the normal case; κ/n is what the tails add. Two systems
 *  per hacker give a nearly useless variance estimate (relative SD ≈ 1.39 for
 *  the default score). Needs n ≥ 2. */
export const varS2 = (dist, n) => dist.variance ** 2 * (2 / (n - 1) + dist.exKurtosis / n);

/** Var(SS/n) = ((n − 1)/n)²·Var(s²): the plug-in variance is s² scaled down. */
export const varPlugIn = (dist, n) => ((n - 1) / n) ** 2 * varS2(dist, n);

/** E[SS/n] = (n − 1)/n·σ²: biased low by σ²/n (Bessel, [[Sum of squares and sample variance]] Lemma 2). */
export const meanPlugIn = (dist, n) => ((n - 1) / n) * dist.variance;

/** Cov(x̄, s²) = μ₃/n.
 *  Category: exact formula ([[Variance of the sample variance]] Lemma D). For right-skewed
 *  scores (μ₃ > 0) a hacker with a high mean also looks more erratic. */
export const covMeanS2 = (dist, n) => dist.mu3 / n;

/** The correlation μ₃/(n·√(Var x̄·Var s²)), what the (x̄, s²) scatter should show. */
export const corrMeanS2 = (dist, n) => covMeanS2(dist, n) / Math.sqrt(varMean(dist, n) * varS2(dist, n));

/** c₄(n) = √(2/(n − 1))·Γ(n/2)/Γ((n − 1)/2), so that E[s] = c₄σ for NORMAL data.
 *  Category: exact formula. s² is unbiased but s = √s² is not (Jensen,
 *  [[Estimators - bias, variance and MSE]] Lemma 3): c₄(2) = 0.798, c₄(10) = 0.973. */
export const c4 = (n) => Math.sqrt(2 / (n - 1)) * Math.exp(lnGamma(n / 2) - lnGamma((n - 1) / 2));

/** Standard errors of averages over R independent samples of size n (draft §4.4):
 *    SE(mean of x̄) = σ/√(nR),  SE(mean of s²) = SD(s²)/√R,  SE(mean of SS/n) = SD(SS/n)/√R.
 *  Category: exact formula. A comparison "average vs truth" is reported as
 *  z = (average − truth)/SE: |z| ≤ 3 is consistent, otherwise "check". */
export const seAvgMean = (dist, n, R) => Math.sqrt(dist.variance / (n * R));
export const seAvgS2 = (dist, n, R) => Math.sqrt(varS2(dist, n) / R);
export const seAvgPlugIn = (dist, n, R) => Math.sqrt(varPlugIn(dist, n) / R);

/** The comparison every table shows: measured, theory, difference, SE, z, and a verdict. */
export function compare(measured, theory, se) {
  const diff = measured - theory, z = se > 0 ? diff / se : NaN;
  return { measured, theory, diff, se, z, ok: Math.abs(z) <= 3 };
}

/** SE of an empirical variance V̂ of m values whose own excess kurtosis is κ_T:
 *  SE(V̂) ≈ V·√(2/(m − 1) + κ_T/m) (draft §8.3). For x̄ⱼ, κ_T = κ/n. */
export const seOfVariance = (V, m, kappaT) => V * Math.sqrt(Math.max(0, 2 / (m - 1) + kappaT / m));

/* ---------- intervals ---------- */

/** Limit coverage of the nominal (1 − α) χ² interval for σ² as n → ∞:
 *    2Φ(z_{1−α/2}·√(2/(2 + κ))) − 1.
 *  Category: exact formula ([[Confidence intervals and coverage]] Theorem 3). The interval is
 *  built for the normal spread 2σ⁴/n of s², while the true spread is (2 + κ)σ⁴/n:
 *  heavy tails under-cover, light tails over-cover, and more data does not fix it.
 *  Exp(1): 0.673; U(0, 1): 0.998; the default score: 0.957. */
export function chi2CoverageLimit(kappa, level = 0.95) {
  const z = normInv(1 - (1 - level) / 2);
  return 2 * normCdf(z * Math.sqrt(2 / (2 + kappa))) - 1;
}

/* ---------- the exponentially weighted baseline ---------- */

/** Stationary moments of the exponentially weighted baseline on i.i.d. data:
 *    Var(m) = α/(2 − α)·σ²,   E v = 2(1 − α)/(2 − α)·σ².
 *  Category: exact formula ([[Exponentially weighted mean and variance]] Lemma 3).
 *  The mean never settles (variance ≈ ασ²/2): the price of being able to follow a change. */
export const ewStationary = (alpha, sigma2) => ({
  varMean: (alpha / (2 - alpha)) * sigma2,
  meanVar: ((2 * (1 - alpha)) / (2 - alpha)) * sigma2,
});

/* ---------- how many systems a defender must watch ---------- */

/** n needed to estimate one hacker's mean to ±h with the given confidence:
 *  n = (z·σ/h)², rounded up. Category: exact formula (note 04 §3, from SE = σ/√n). */
export function sampleSizeMean(sigma, h, level = 0.95) {
  const z = normInv(1 - (1 - level) / 2);
  return Math.ceil(((z * sigma) / h) ** 2);
}

/** n needed to estimate one hacker's VARIANCE to ±r (relative, e.g. 0.1 = 10 %):
 *  n = z²(2 + κ)/r², from the ASYMPTOTIC relative SD √((2 + κ)/n) of s²
 *  (Corollary 2 of the Var(s²) note; it ignores the small-n term 2/(n−1) − 2/n).
 *  Category: exact formula (approximation stated). Note 04 uses z ≈ 2: ≈ 750 for the default score. */
export function sampleSizeVar(kappa, r, level = 0.95) {
  const z = normInv(1 - (1 - level) / 2);
  return Math.ceil((z * z * (2 + kappa)) / (r * r));
}
