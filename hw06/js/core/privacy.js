/* privacy.js — statistical distance between two Gaussians (an L¹ integral, so an
   Ex. 1 problem), the advantage of a distinguisher that meets it, and the analytic
   calibration of the Gaussian mechanism in differential privacy, where δ is a
   DIFFERENCE of two Φ tails and a naive Φ breaks it. Pure, no DOM.
   Note 06 §3; [[Statistical distance]], [[Gaussian mechanism in differential privacy]]. */

import { Phi, PhiMinusHalf, pdf } from './normal.js';
import { normal } from '../../../assets/js/core/samplers.js';
import { wilson } from '../../../assets/js/core/stats.js';

/** Composite Simpson of g on [a, b], N cells. */
function simpsonOn(g, a, b, N) {
  if (N % 2) N++;
  const h = (b - a) / N;
  let s = g(a) + g(b);
  for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * g(a + i * h);
  return (s * h) / 3;
}

/**
 * Δ(N(0,1), N(μ,1)) = ½ ∫ |p − q|, numerically.
 * Category: statistical distance, by Simpson on [−15, 15 + μ] with 10⁵ cells, split at the
 * crossing point μ/2 where |p − q| has a kink (Simpson across a kink drops to O(h²)).
 */
export function sdGaussNumeric(mu, N = 100000) {
  const g = (x) => 0.5 * Math.abs(pdf(x) - pdf(x - mu));
  const c = mu / 2, lo = -15, hi = 15 + mu;
  const nl = Math.max(2, Math.round((N * (c - lo)) / (hi - lo)));
  return simpsonOn(g, lo, c, nl) + simpsonOn(g, c, hi, N - nl);
}

/**
 * The same in closed form: p > q exactly on x < μ/2, so
 *    Δ = P₀(X < μ/2) − P_μ(X < μ/2) = Φ(μ/2) − Φ(−μ/2) = 2Φ(μ/2) − 1.
 * Category: statistical distance [T]. Computed as 2(Φ(μ/2) − ½) by the positive series, so
 * that μ = 0.01 (Δ ≈ 0.004) does not lose digits to the subtraction from 1.
 */
export const sdGaussClosed = (mu) => 2 * PhiMinusHalf(mu / 2);

/**
 * The threshold distinguisher: shown one draw X from N(0,1) (b = 0) or N(μ,1) (b = 1), each
 * with probability ½, answer 1 iff X > μ/2. Its advantage P(1 | b = 1) − P(1 | b = 0)
 * equals Δ: it is the optimal test (Neyman–Pearson), and Δ bounds every test [T].
 * Category: simulation. Returns the advantage with a 99 % Wilson interval (from the
 * accuracy acc: advantage = 2·acc − 1).
 */
export function distinguisher(mu, n, rng) {
  let correct = 0;
  for (let i = 0; i < n; i++) {
    const b = rng.u32() & 1, x = normal(rng) + (b ? mu : 0);
    if ((x > mu / 2 ? 1 : 0) === b) correct++;
  }
  const [lo, hi] = wilson(correct, n, 2.5758293035489004);
  return { advantage: (2 * correct) / n - 1, lo: 2 * lo - 1, hi: 2 * hi - 1, n };
}

/**
 * The analytic Gaussian mechanism (Balle & Wang 2018) [S]: adding N(0, σ²) to a query of
 * sensitivity Δ is (ε, δ)-DP for exactly
 *    δ(ε, σ) = Φ(Δ/(2σ) − εσ/Δ) − e^ε Φ(−Δ/(2σ) − εσ/Δ).
 * Category: privacy (calibration). Both terms are lower-tail Φ values that become tiny
 * as σ grows and nearly cancel: δ = 10⁻¹⁰ is the difference of two numbers ≈ 10⁻⁹. A Φ
 * with relative accuracy in the tail is required.
 * @param {(x: number) => number} [Phi_]  the Φ to use (the naive one to show the damage)
 */
export function deltaOf(eps, sigma, sens = 1, Phi_ = Phi) {
  const a = sens / (2 * sigma), b = (eps * sigma) / sens;
  return Phi_(a - b) - Math.exp(eps) * Phi_(-a - b);
}

/** The smallest σ with δ(ε, σ) ≤ δ*, by bisection on [0.05, 500] (δ decreases in σ). */
export function analyticSigma(eps, deltaStar, sens = 1, Phi_ = Phi) {
  let lo = 0.05, hi = 500;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (deltaOf(eps, mid, sens, Phi_) > deltaStar) lo = mid; else hi = mid;
    if (hi - lo < 1e-12 * hi) break;
  }
  return hi;
}

/** The classical calibration σ = Δ √(2 ln(1.25/δ))/ε (Dwork & Roth 2014, Thm A.1) [S].
 *  Valid only for ε < 1, and loose: a sufficient condition, not the exact δ. */
export const classicalSigma = (eps, deltaStar, sens = 1) => (sens * Math.sqrt(2 * Math.log(1.25 / deltaStar))) / eps;

/** Φ by subtraction in the lower tail: Φ(x) = 1 − Φ(−x) for x < 0. What not to do. */
export const PhiNaive = (x) => (x < 0 ? 1 - Phi(-x) : Phi(x));
