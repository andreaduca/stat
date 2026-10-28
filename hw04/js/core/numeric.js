/* numeric.js — the special functions behind every exact curve in hw04: the
   complementary error function, the standard normal (density, CDF, upper tail,
   quantile), a log-space sum, and a least-squares line. Pure functions on
   Numbers, no DOM; they run in the page, in the worker and under Node.
   The Γ function and its incomplete form come from the shared stats.js
   (Lanczos, g = 7): this file builds on them rather than repeating them.
   HMWK4 note 02 §3; [[Central limit theorem]], [[Monte Carlo estimation]]. */

import { gammaQ } from '../../../assets/js/core/stats.js';

/* ---------- the normal distribution ---------- */

const SQRT2 = Math.SQRT2;
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

/** erfc(x) = 1 − erf(x) = (2/√π) ∫ₓ^∞ e^(−t²) dt.
 *  Category: special function.
 *  Formula: for x ≥ 0, erfc(x) = Q(½, x²), the regularised upper incomplete
 *  gamma function — the same tail that gives χ² p-values (stats.js: power
 *  series for small x, Lentz's continued fraction for large x, both to ~1e−15
 *  relative). For x < 0, erfc(x) = 2 − erfc(−x).
 *  Why erfc and not 1 − erf: in the tails 1 − erf(x) subtracts two numbers
 *  that agree to many digits and returns noise; erfc keeps full relative
 *  precision down to about 1e−300 (x ≈ 26). */
export function erfc(x) {
  if (Number.isNaN(x)) return NaN;
  return x >= 0 ? gammaQ(0.5, x * x) : 2 - gammaQ(0.5, x * x);
}

/** Standard normal density φ(x) = e^(−x²/2) / √(2π).
 *  Category: reference law (the limit layer of every CLT plot). */
export const normPdf = (x) => INV_SQRT_2PI * Math.exp(-0.5 * x * x);

/** Standard normal CDF Φ(x) = P(Z ≤ x) = ½·erfc(−x/√2).
 *  Category: reference law. Accurate in the left tail (no 1 − … there). */
export const normCdf = (x) => 0.5 * erfc(-x / SQRT2);

/** Standard normal upper tail P(Z > x) = 1 − Φ(x) = ½·erfc(x/√2).
 *  Category: reference law. Never computed as 1 − normCdf(x): at x = 8 that
 *  difference is 6·10⁻¹⁶, below the rounding error of 1 − 0.999…, so it would
 *  print 0 (or worse, a random tiny number). The CLT approximation of the LLN
 *  tail on the LLN page lives on this function. */
export const normSf = (x) => 0.5 * erfc(x / SQRT2);

/* Wichura's algorithm AS 241 (PPND16), Applied Statistics 37 (1988) 477–484.
   Three rational approximations: the centre |p − ½| ≤ 0.425, then the tails in
   the variable r = √(−ln min(p, 1 − p)), split at r = 5. */
const A = [3.3871328727963666080e0, 1.3314166789178437745e2, 1.9715909503065514427e3, 1.3731693765509461125e4,
  4.5921953931549871457e4, 6.7265770927008700853e4, 3.3430575583588128105e4, 2.5090809287301226727e3];
const B = [1, 4.2313330701600911252e1, 6.8718700749205790830e2, 5.3941960214247511077e3,
  2.1213794301586595867e4, 3.9307895800092710610e4, 2.8729085735721942674e4, 5.2264952788528545610e3];
const C = [1.42343711074968357734e0, 4.63033784615654529590e0, 5.76949722146069140550e0, 3.64784832476320460504e0,
  1.27045825245236838258e0, 2.41780725177450611770e-1, 2.27238449892691845833e-2, 7.74545014278341407640e-4];
const D = [1, 2.05319162663775882187e0, 1.67638483018380384940e0, 6.89767334985100004550e-1,
  1.48103976427480074590e-1, 1.51986665636164571966e-2, 5.47593808499534494600e-4, 1.05075007164441684324e-9];
const E = [6.65790464350110377720e0, 5.46378491116411436990e0, 1.78482653991729133580e0, 2.96560571828504891230e-1,
  2.65321895265761230930e-2, 1.24266094738807843860e-3, 2.71155556874348757815e-5, 2.01033439929228813265e-7];
const F = [1, 5.99832206555887937690e-1, 1.36929880922735805310e-1, 1.48753612908506148525e-2,
  7.86869131145613259100e-4, 1.84631831751005468180e-5, 1.42151175831644588870e-7, 2.04426310338993978564e-15];

/** Horner evaluation of c₀ + c₁x + … + c₇x⁷. */
const poly = (c, x) => c.reduceRight((acc, ci) => acc * x + ci, 0);

/** Standard normal quantile Φ⁻¹(p): the x with Φ(x) = p.
 *  Category: reference law (the x-axis of the Q-Q plot, critical values).
 *  Method: AS 241, relative accuracy about 1e−16 over (0, 1). */
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (q * poly(A, r)) / poly(B, r);
  }
  let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
  let x;
  if (r <= 5) { r -= 1.6; x = poly(C, r) / poly(D, r); }
  else { r -= 5; x = poly(E, r) / poly(F, r); }
  return q < 0 ? -x : x;
}

/* ---------- sums in log space ---------- */

/** ln(Σ eˣⁱ) without overflow or underflow.
 *  Category: numerical routine.
 *  Formula: ln Σ eˣⁱ = M + ln Σ e^(xᵢ − M) with M = max xᵢ, so the largest
 *  term is exactly 1 and nothing overflows; terms 700 below M vanish harmlessly.
 *  Why: binomial tails at n = 10⁴ reach 10⁻²³ (LLN page) and beyond; each pmf
 *  term is computed as a logarithm and they are only exponentiated at the end. */
export function logSumExp(xs) {
  let M = -Infinity;
  for (const x of xs) if (x > M) M = x;
  if (M === -Infinity) return -Infinity;
  let s = 0;
  for (const x of xs) s += Math.exp(x - M);
  return M + Math.log(s);
}

/* ---------- fitting a line ---------- */

/** Least-squares line y ≈ a + b·x, with the standard error of the slope and R².
 *  Category: estimator (the log-log slopes of the variance page).
 *  Formulas: b = Sxy / Sxx, a = ȳ − b x̄, R² = 1 − SSres / SStot,
 *  SE(b) = √(SSres / (k − 2) / Sxx) for k points.
 *  On log₁₀ Var against log₁₀ n the slope is the exponent of n: +1, −1, 0 for
 *  Sₙ, Sₙ/n, Sₙ/√n (note 02 §2). */
export function linFit(xs, ys) {
  const k = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / k, my = ys.reduce((s, y) => s + y, 0) / k;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < k; i++) {
    sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx, intercept = my - slope * mx;
  const ssRes = Math.max(0, syy - slope * sxy);
  return {
    slope, intercept,
    r2: syy === 0 ? 1 : 1 - ssRes / syy,
    slopeSE: k > 2 ? Math.sqrt(ssRes / (k - 2) / sxx) : NaN,
  };
}

/* ---------- integration ---------- */

/** ∫ₐᵇ f(x) dx by composite Simpson's rule with `steps` (even) panels.
 *  Category: numerical routine. Error O(h⁴) for smooth f; used for the expected
 *  maximum of m normals on the Systems & attackers page. */
export function simpson(f, a, b, steps = 4000) {
  const n = steps + (steps % 2), h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}
