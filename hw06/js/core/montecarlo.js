/* montecarlo.js — integration by sampling: plain Monte Carlo with its standard
   error, quasi-Monte Carlo with the van der Corput sequence, the volume of the
   d-ball (where grids die and Monte Carlo does not), and a rare event — Q(5) —
   by plain sampling and by importance sampling. Pure, no DOM.
   Note 06 §4; [[Monte Carlo integration and quasi-Monte Carlo]]. Monte Carlo is
   Lebesgue's idea with random coins: it samples the distribution of f's values
   (the layer cake of lebesgue.js with the MC provider is the same number). */

import { normal } from '../../../assets/js/core/samplers.js';
import { lnGamma } from '../../../assets/js/core/stats.js';

/**
 * Plain Monte Carlo: ∫_a^b f ≈ (b − a)·(1/N) Σ f(Uᵢ), Uᵢ uniform on [a, b].
 * Category: Monte Carlo. Unbiased; standard error (b − a)·s/√N with s the sample SD of
 * f(U): the rate 1/√N does not depend on smoothness or dimension. Welford for the variance.
 * @returns {{value: number, se: number, evals: number}}
 */
export function plainMC(fn, N, rng) {
  const L = fn.b - fn.a;
  let mean = 0, S = 0;
  for (let i = 1; i <= N; i++) {
    const y = fn.eval(fn.a + rng.float() * L), d = y - mean;
    mean += d / i; S += d * (y - mean);
  }
  return { value: L * mean, se: (L * Math.sqrt(S / (N - 1))) / Math.sqrt(N), evals: N };
}

/** The i-th van der Corput point in base 2: the binary digits of i mirrored after the point
 *  (1 → 0.1₂ = ½, 2 → 0.01₂ = ¼, 3 → 0.11₂ = ¾, …). Fills [0, 1) evenly at every N. */
export function vanDerCorput(i) {
  let x = 0, w = 0.5;
  while (i > 0) { if (i & 1) x += w; i >>= 1; w /= 2; }
  return x;
}

/**
 * Quasi-Monte Carlo: the same average on the points v₁ … v_N (starting at index 1).
 * Category: quasi-Monte Carlo. For f of bounded variation the error is ≤ V(f)·D*_N
 * (Koksma–Hlawka 📌) with discrepancy D*_N = O(log N / N): nearly 1/N instead of 1/√N.
 * No error estimate comes with it (the points are not random).
 */
export function qmc(fn, N) {
  const L = fn.b - fn.a;
  let s = 0;
  for (let i = 1; i <= N; i++) s += fn.eval(fn.a + vanDerCorput(i) * L);
  return { value: (L * s) / N, evals: N };
}

/** Exact volume of the unit d-ball, π^{d/2}/Γ(d/2 + 1). */
export const ballVolume = (d) => Math.exp((d / 2) * Math.log(Math.PI) - lnGamma(d / 2 + 1));

/**
 * The d-ball volume by Monte Carlo: 2^d × the fraction of N uniform points of [−1, 1]^d
 * with |x| ≤ 1. Category: Monte Carlo in d dimensions. SE = 2^d √(p(1 − p)/N), p the
 * fraction: its relative size grows as the ball fills less of the cube (p ≈ 0.0025 at
 * d = 10), but not exponentially in N's exponent, as a grid's cost does: a grid with k points
 * per axis needs k^d evaluations.
 */
export function ballMC(d, N, rng) {
  let inside = 0;
  for (let i = 0; i < N; i++) {
    let r2 = 0;
    for (let j = 0; j < d; j++) { const u = 2 * rng.float() - 1; r2 += u * u; }
    if (r2 <= 1) inside++;
  }
  const p = inside / N, cube = 2 ** d;
  return { value: cube * p, se: cube * Math.sqrt((p * (1 - p)) / N), exact: ballVolume(d), d, N };
}

/**
 * Q(5) = P(Z > 5) ≈ 2.87·10⁻⁷ by sampling.
 * Category: Monte Carlo for a rare event.
 *   plain: the fraction of N standard normals above 5. With N = 10⁶, about 0.3 hits:
 *          usually 0, relative SE ≈ 1/√(N·Q) ≈ 1900 %.
 *   importance sampling: draw X ~ N(5, 1), where the event is common, and weight each hit by
 *          the likelihood ratio φ(x)/φ(x − 5) = e^{−5x + 12.5}. Unbiased; relative variance per
 *          sample E[w²1]/Q² − 1 ≈ 5.68, against 1/Q ≈ 3.5·10⁶ for plain sampling.
 */
export function rareEvent(N, rng, a = 5) {
  let hits = 0, mean = 0, S = 0;
  for (let i = 1; i <= N; i++) {
    if (normal(rng) > a) hits++;
    const x = a + normal(rng), w = x > a ? Math.exp(-a * x + 0.5 * a * a) : 0;
    const d = w - mean; mean += d / i; S += d * (w - mean);
  }
  const p = hits / N, varIS = S / (N - 1);
  return {
    plain: { value: p, se: Math.sqrt((p * (1 - p)) / N), hits },
    is: { value: mean, se: Math.sqrt(varIS / N), relVar: varIS / (mean * mean) },
    N,
  };
}

/** The exact relative variance per sample of the importance-sampling estimator above:
 *  E[w²·1{X > a}] = ∫_a^∞ φ(x)²/φ(x − a) dx = e^{a²} Q(2a) (complete the square), so
 *  relVar = e^{a²} Q(2a)/Q(a)² − 1 = 5.677 at a = 5. Category: variance (exact). */
export const isRelVarExact = (a, Q) => Math.exp(a * a) * Q(2 * a) / Q(a) ** 2 - 1;

/** SD of the plain-MC summand π·sin(πU) for ∫₀^π sin: √(π²/2 − 4) = 0.9668517 (exact). */
export const sinSummandSD = Math.sqrt((Math.PI * Math.PI) / 2 - 4);
