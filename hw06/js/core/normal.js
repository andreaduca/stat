/* normal.js — the standard normal CDF Φ(x) = ∫_{−∞}^x φ(t) dt, φ(t) = e^{−t²/2}/√(2π),
   computed eight ways (M1–M8), from naive quadrature to the production hybrid, each
   returning its value and its cost. JavaScript has no Math.erf: everything here is
   built from Math.exp and arithmetic. Pure, no DOM.
   Note 03 (methods §2, accuracy §4, conditioning §5); [[Normal distribution and Phi]],
   [[Error function]], [[Condition number of a function]], [[Polynomial and rational approximation]].

   The rule that organises the file: Φ in the LOWER TAIL must be computed with small
   RELATIVE error. Φ(−10) ≈ 7.6·10⁻²⁴; a method that returns 1 − 0.9999…9 gets 0 or a
   multiple of 1.1·10⁻¹⁶, i.e. 100 % wrong, though its absolute error is tiny. So every
   good method computes the small tail Q(a) = Φ(−a) directly and never subtracts from 1
   (note 03 §1). */

import CHEB from '../../data/chebyshev.js';

const SQRT2PI = 2.5066282746310002;        // √(2π) to the nearest double
const INV_SQRT2PI = 0.3989422804014327;    // 1/√(2π)
const LN_SQRT2PI = 0.9189385332046728;     // ln √(2π)

/* ======================= the density ======================= */

/** φ(x) = e^{−x²/2}/√(2π), naive. Category: special function.
 *  For large |x| the rounding of x² (relative error u) becomes an absolute error
 *  x²u/2 in the exponent, i.e. a relative error ≈ x²u/2 in φ: about 3·10⁻¹³ at x = 37. */
export const pdf = (x) => INV_SQRT2PI * Math.exp(-0.5 * x * x);

/**
 * φ(x) without the x² rounding: the exact-square split.
 * Category: special function (accurate). With a = |x|, a_h = ⌊16a⌋/16 (a few bits, so a_h²
 * is exact) and a_l = a − a_h (exact), a² = a_h² + a_l(a_h + a), so
 *    φ(a) = e^{−a_h²/2} · e^{−a_l(a_h + a)/2} / √(2π),
 * where the first exponent is exact and the second is small: its rounding error is
 * tiny in absolute terms. Recovers ≈ 2 digits at x ≈ −35 (note 03 §4, "avoidable error";
 * the same trick as Cody 1969 / glibc).
 */
export function pdfAccurate(x) {
  const a = Math.abs(x), ah = Math.floor(16 * a) / 16, al = a - ah;
  return Math.exp(-0.5 * ah * ah) * Math.exp(-0.5 * al * (ah + a)) * INV_SQRT2PI;
}

/* ======================= M1, M2 · quadrature from 0 ======================= */

/** ∫₀^a φ by a Newton–Cotes rule on N cells. */
function quad0(a, N, simpson) {
  if (simpson && N % 2) N += 1;
  const h = a / N;
  let s = pdf(0) + pdf(a);
  if (!simpson) s /= 2;
  for (let i = 1; i < N; i++) s += (simpson ? (i % 2 ? 4 : 2) : 1) * pdf(i * h);
  return { int: simpson ? (s * h) / 3 : s * h, evals: N + 1 };
}

/**
 * M1 trapezoid / M2 Simpson: Φ(x) = ½ ± ∫₀^{|x|} φ(t) dt.
 * Category: Riemann rule (applied to Ex. 2). Error O(N⁻²) / O(N⁻⁴) in ABSOLUTE terms.
 * For x < 0 the lower tail is ½ − ∫: a subtraction of two numbers close to ½, so the
 * relative error explodes as Φ(x) → 0 (Φ(−8) ≈ 6·10⁻¹⁶: no digit survives). Intended:
 * it is the failure E7 shows (note 03 §2 M1–M2).
 */
export function trapezoid(x, N = 1000) {
  const { int, evals } = quad0(Math.abs(x), N, false);
  return { value: x >= 0 ? 0.5 + int : 0.5 - int, cost: evals };
}
export function simpson(x, N = 100) {
  const { int, evals } = quad0(Math.abs(x), N, true);
  return { value: x >= 0 ? 0.5 + int : 0.5 - int, cost: evals };
}

/**
 * M2′ tail quadrature: Q(a) = ∫₀^L φ(a + s) ds by Simpson, for a = |x|, with L chosen so
 * that φ(a + L) < 10⁻³⁰ φ(a): aL + L²/2 = 69, L = √(a² + 138) − a.
 * Category: Riemann rule on the tail. No subtraction, so the relative error stays
 * bounded in the tail; but the mass sits in a layer of width ≈ 1/a next to a, so a fixed
 * N resolves it worse and worse as a grows. Uses the accurate φ.
 */
export function tailSimpson(x, N = 100) {
  const a = Math.abs(x), L = Math.sqrt(a * a + 138) - a;
  if (N % 2) N += 1;
  const h = L / N;
  let s = pdfAccurate(a) + pdfAccurate(a + L);
  for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * pdfAccurate(a + i * h);
  const q = (s * h) / 3;
  return { value: x < 0 ? q : 1 - q, cost: N + 1 };
}

/* ======================= M3, M4 · series ======================= */

/**
 * M3 alternating Taylor series of erf: erf z = (2/√π) Σ (−1)ⁿ z^{2n+1}/(n!(2n+1)), z = x/√2,
 * and Φ(x) = ½(1 + erf z).
 * Category: series. Converges for every z (erf is entire), but the terms grow to
 * ≈ e^{z²}/√(2πz²) before they shrink: at x = 8 the largest is ≈ 10^{11.7}, and the
 * rounding of those huge terms (≈ 10^{11.7}·u ≈ 10⁻⁴) swamps a sum that should be ≈ 1.
 * Then the lower tail is formed as ½(1 + erf), a second cancellation (note 03 §2 M3).
 * Stops when |term| < 10⁻¹⁷|sum| or n > 2000. Reports the largest |term|.
 */
export function taylorErf(x) {
  const z = x / Math.SQRT2, z2 = z * z;
  let p = z, s = z, maxTerm = Math.abs(z), n = 0;   // p = z^{2n+1}/n!
  while (n < 2000) {
    n++;
    p *= -z2 / n;
    const term = p / (2 * n + 1);
    s += term;
    if (Math.abs(term) > maxTerm) maxTerm = Math.abs(term);
    if (Math.abs(term) < 1e-17 * Math.abs(s)) break;
  }
  const erf = (2 / Math.sqrt(Math.PI)) * s;
  return { value: 0.5 * (1 + erf), cost: n + 1, maxTerm: (2 / Math.sqrt(Math.PI)) * maxTerm };
}

/**
 * Φ(a) − ½ for a ≥ 0 by the positive series:
 *    Φ(a) − ½ = φ(a) Σ_{n≥0} a^{2n+1}/(2n+1)!!   (each term = previous · a²/(2n+1)).
 * Category: series. Every term is positive: no cancellation inside the sum, relative
 * error ≈ (number of terms)·u. It comes from integrating e^{t²/2}·φ term by term
 * ([[Error function]] Thm 3; Marsaglia 2004). Summed until adding a term changes nothing.
 * @returns {{h: number, terms: number}}
 */
export function positiveHalf(a, accuratePdf = true) {
  let term = a, s = a, n = 0;
  for (;;) {
    n++;
    term *= (a * a) / (2 * n + 1);
    const next = s + term;
    if (next === s) break;
    s = next;
  }
  return { h: (accuratePdf ? pdfAccurate(a) : pdf(a)) * s, terms: n };
}

/**
 * M4: Φ(x) = ½ ± h(|x|) with the positive series.
 * Category: series. Excellent for |x| ≲ 3 (Φ near ½); for x ≪ 0 the result is ½ − h with
 * h → ½: the subtraction loses everything, and the number of terms grows like x²
 * (15 at x = 1, ≈ 89 at x = 8).
 */
export function positiveSeries(x) {
  const { h, terms } = positiveHalf(Math.abs(x));
  return { value: x >= 0 ? 0.5 + h : 0.5 - h, cost: terms };
}

/* ======================= M5 · Laplace's continued fraction ======================= */

/**
 * The continued fraction CF(a) = a + 1/(a + 2/(a + 3/(a + …))), so that Q(a) = φ(a)/CF(a)
 * for a > 0 (Laplace 1805; note 03 §2 M5).
 * Category: continued fraction, evaluated forward by the modified Lentz algorithm:
 *    f = a, C = a, D = 0;  for k = 1, 2, …:  D = 1/(a + kD), C = a + k/C, δ = CD, f ← fδ,
 *    stop when |δ − 1| < 10⁻¹⁶.
 * Converges fast for large a (≈ 7 steps at a = 30) and slowly for small a (≈ 400 at a = 1):
 * the complement of the series. All quantities positive: no cancellation.
 * @returns {{f: number, iters: number}}
 */
export function laplaceCF(a, maxIter = 100000) {
  const TINY = 1e-300;
  let f = a, C = a, D = 0, k = 0;
  if (C === 0) C = TINY;
  while (k < maxIter) {
    k++;
    D = a + k * D; D = D === 0 ? 1 / TINY : 1 / D;
    C = a + k / C; if (C === 0) C = TINY;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return { f, iters: k };
}

/** M5: the tail Q(|x|) = φ(|x|)/CF(|x|); Φ = Q for x < 0, 1 − Q for x > 0. */
export function contFrac(x) {
  const a = Math.abs(x);
  if (a === 0) return { value: 0.5, cost: 0 };
  const { f, iters } = laplaceCF(a);
  const q = pdfAccurate(a) / f;
  return { value: x < 0 ? q : 1 - q, cost: iters };
}

/* ======================= M6 · classical rational approximations ======================= */

/**
 * M6a Abramowitz & Stegun 7.1.26 (Hastings 1955): for z ≥ 0,
 *    erfc z ≈ (a₁t + a₂t² + a₃t³ + a₄t⁴ + a₅t⁵) e^{−z²},  t = 1/(1 + pz),
 * p = 0.3275911, a = (0.254829592, −0.284496736, 1.421413741, −1.453152027, 1.061405429).
 * |error of erf| ≤ 1.5·10⁻⁷ (absolute). Category: approximation (fixed cost: 1 exp, 1
 * division, a degree-5 polynomial). It is an approximation of erf, used as one:
 * erf z = 1 − (…)e^{−z²}, then Φ(x) = ½(1 + sign(x)·erf|z|). So the lower tail is ½(1 − erf),
 * a subtraction from 1 (the draft's "lower tail by symmetry"): at x = −8 only the rounding
 * of erf near 1 survives. An approximation of erf is not an approximation of the tail.
 * 📌 coefficients to be verified against the printed handbook.
 */
export function as7126(x) {
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return { value: 0.5 * (1 + (x < 0 ? -erf : erf)), cost: 1 };
}

/**
 * M6b Abramowitz & Stegun 26.2.17 (Zelen & Severo 1964): for a ≥ 0,
 *    Q(a) ≈ φ(a)(b₁t + b₂t² + b₃t³ + b₄t⁴ + b₅t⁵),  t = 1/(1 + pa),
 * p = 0.2316419, b = (0.319381530, −0.356563782, 1.781477937, −1.821255978, 1.330274429).
 * |absolute error| < 7.5·10⁻⁸. Category: approximation (fixed cost). 📌 handbook check.
 */
export function zelenSevero(x) {
  const a = Math.abs(x), t = 1 / (1 + 0.2316419 * a);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const q = pdf(a) * poly;
  return { value: x < 0 ? q : 1 - q, cost: 1 };
}

/* ======================= M7 · the hybrid (production method) ======================= */

/**
 * M7: the series where it is good, the continued fraction where it is good.
 * Category: hybrid (series + continued fraction), the production method of hw06.
 *    a = |x| < s:  Φ = ½ ± h(a)          (M4: Φ near ½, no cancellation that matters)
 *    a ≥ s:        Q = φ(a)/CF(a)  (M5),  Φ = Q (x < 0) or 1 − Q (x > 0)
 * Default switch-over s = 2: about 30 series terms below, about 100 CF steps above.
 * Measured (P1, Node, 2001-point grid on [−37.5, 8.25], 80-digit reference): max relative
 * error of Φ given in docs/plans/hw06.md, ≤ 2·10⁻¹⁴ required.
 * @param {number} [s]  switch-over
 * @param {boolean} [split]  false uses the naive φ (to show the x² rounding, E10)
 * @returns {{value: number, cost: number, q: number, branch: 'series'|'cf'}}  q = the small tail when a ≥ s
 */
export function hybrid(x, s = 2, split = true) {
  const a = Math.abs(x);
  if (a < s) {
    const { h, terms } = positiveHalf(a, split);
    return { value: x >= 0 ? 0.5 + h : 0.5 - h, cost: terms, branch: 'series' };
  }
  const { f, iters } = laplaceCF(a);
  const q = (split ? pdfAccurate(a) : pdf(a)) / f;
  return { value: x < 0 ? q : 1 - q, q, cost: iters, branch: 'cf' };
}

/** Φ(x), the function every other page of hw06 calls (M7, s = 2). */
export const Phi = (x) => hybrid(x).value;

/** Q(x) = 1 − Φ(x) = Φ(−x), the upper tail, computed directly (never as 1 − Φ). */
export const Q = (x) => hybrid(-x).value;

/** Φ(x) − ½ without cancellation near 0 (positive series; = ½ − Q(x) far out). Used by
 *  the statistical distance 2Φ(μ/2) − 1 for small μ (privacy.js). */
export function PhiMinusHalf(x) {
  const a = Math.abs(x);
  const h = a < 2 ? positiveHalf(a).h : 0.5 - hybrid(-a).value;
  return x >= 0 ? h : -h;
}

/**
 * ln Φ(x), defined far beyond the underflow of Φ (Φ(−38.5) ≈ 1.4·10⁻³²⁴ is below the
 * smallest double). Category: special function (log scale).
 *    x < −s:  ln Q(a) = −a²/2 − ln √(2π) − ln CF(a)   (never forms φ, so no underflow)
 *    x > 0:   ln(1 − Q(x)) = log1p(−Q(x))               (accurate when Φ ≈ 1)
 *    else:    ln Φ(x)
 */
export function logPhi(x) {
  if (x < -2) {
    const a = -x;
    return -0.5 * a * a - LN_SQRT2PI - Math.log(laplaceCF(a).f);
  }
  if (x > 0) return Math.log1p(-Q(x));
  return Math.log(Phi(x));
}

/**
 * Φ⁻¹(p), the quantile: Newton's method on ln Φ(x) = ln p (lower half) or on
 * ln Q(x) = ln(1 − p) (upper half), safeguarded by bisection.
 * Category: inverse function (Newton with bracket). Working in logs keeps the step
 * well scaled in the far tail: g(x) = ln Φ(x) − ln p, g′ = φ/Φ ≈ |x| there. Start from
 * the tail asymptote x₀ = −√(−2 ln p). Converges in ≈ 4–6 steps to ≈ 1 ulp.
 * Note: for p > ½ the input itself limits accuracy: 1 − p is rounded (Φ⁻¹(1 − 10⁻²⁰) = Φ⁻¹(1)).
 */
export function PhiInv(p) {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  if (p === 0.5) return 0;
  const upper = p > 0.5, lp = Math.log(upper ? 1 - p : p);   // solve ln Φ(−y) = lp for y ≥ 0, x = ±y
  const g = (y) => logPhi(-y) - lp;                           // increasing… in −y: decreasing in y
  let lo = 0, hi = 40, y = Math.sqrt(-2 * lp);
  for (let k = 0; k < 100; k++) {
    const v = g(y);
    if (v > 0) lo = y; else hi = y;                           // ln Φ(−y) too big → y too small
    const ratio = Math.exp(-0.5 * y * y - LN_SQRT2PI - logPhi(-y));   // φ/Φ at −y, in logs (no underflow)
    let next = y + v / ratio;                                 // Newton: d/dy ln Φ(−y) = −φ/Φ
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;      // safeguard
    if (Math.abs(next - y) <= 1e-16 * Math.max(1, y)) { y = next; break; }
    y = next;
  }
  return upper ? y : -y;
}

/* ======================= M8 · fixed-cost Chebyshev ======================= */

/** Clenshaw's recurrence for Σ c_k T_k(t), t ∈ [−1, 1] (c₀ not halved: done in the fit). */
function clenshaw(c, t) {
  let b1 = 0, b2 = 0;
  for (let k = c.length - 1; k >= 1; k--) { const b0 = 2 * t * b1 - b2 + c[k]; b2 = b1; b1 = b0; }
  return t * b1 - b2 + c[0];
}

/**
 * M8: Φ from two Chebyshev expansions fitted (at 80 digits, hw06/tools/reference.py) once.
 * Category: polynomial approximation, fixed cost (no loop that depends on x).
 *    |x| ≥ s = 2:  Q(a) = φ(a) · g(u)/a,  g = aQ/φ ≈ 1 − 1/a² + …, u = (a − c)/(a + c), c = 4
 *    |x| < s:      Φ(x) − ½ = φ(x) · x · h(x²),  h(v) = Σ vⁿ/(2n+1)!!
 * g is smooth on u ∈ [−⅓, 1) up to u = 1 (a = ∞), so a degree-20 Chebyshev series in u
 * reaches 10⁻¹⁷; h is entire, degree 15 on [0, 4]. Clenshaw evaluates each in ≈ 2 mult-adds
 * per degree; plus one φ (two exp). Op count: see M8_OPS. [[Polynomial and rational approximation]].
 */
export function chebyshev(x) {
  const a = Math.abs(x);
  if (a >= CHEB.s) {
    const u = (a - CHEB.c) / (a + CHEB.c), t = (2 * (u - CHEB.u0)) / (1 - CHEB.u0) - 1;
    const q = (pdfAccurate(a) * clenshaw(CHEB.tail, t)) / a;
    return { value: x < 0 ? q : 1 - q, cost: CHEB.tail.length };
  }
  const t = (2 * a * a) / (CHEB.s * CHEB.s) - 1;
  const h = pdfAccurate(a) * a * clenshaw(CHEB.body, t);
  return { value: x >= 0 ? 0.5 + h : 0.5 - h, cost: CHEB.body.length };
}

/** Degrees and arithmetic of M8, for the cost table. */
export const M8_INFO = { s: CHEB.s, c: CHEB.c, tailTerms: CHEB.tail.length, bodyTerms: CHEB.body.length };

/* ======================= routes compared in E10 ======================= */

/** erfc z = 2Q(z√2), by M7. */
export const erfcHybrid = (z) => 2 * hybrid(-z * Math.SQRT2).value;

/**
 * Φ(x) = ½ erfc(−x/√2): the textbook route through erfc.
 * Category: comparison route. x/√2 is rounded (relative error ≤ u), and Φ amplifies a
 * relative change of its argument by κ ≈ x², so the result carries ≈ x²u of avoidable
 * error: 10⁻¹³ at x = −30 (note 03 §4; SciPy's ndtr shows the same).
 */
export const viaErfc = (x) => 0.5 * erfcHybrid(-x / Math.SQRT2);

/** The naive lower tail 1 − Φ(−x) for x < 0 (and Φ itself for x ≥ 0): what not to do. */
export const naiveLower = (x) => (x < 0 ? 1 - Phi(-x) : Phi(x));

/**
 * Condition number κ_Φ(x) = |x φ(x)/Φ(x)|: the relative change of Φ per relative change of x.
 * Category: conditioning [[Condition number of a function]]. For x < 0, x² < κ < 1 + x²
 * (from the Mills-ratio bounds), so a relative perturbation u of x becomes ≈ x²u in Φ:
 * that part of the error is unavoidable for any method that receives a rounded x.
 * Computed from the CF (φ/Φ = CF(a) in the lower tail) so it survives where Φ underflows.
 */
export function kappa(x) {
  if (x === 0) return 0;
  if (x < -2) return -x * laplaceCF(-x).f;
  return Math.abs((x * pdf(x)) / Phi(x));
}

/* ======================= the registry ======================= */

/**
 * Every method, for the calculator (E6), the accuracy map (E7) and the cost map (E8).
 * `run(x)` returns {value, cost}; `cost` is in the unit named by `unit`.
 */
export const METHODS = [
  { id: 'M1', name: 'trapezoid, N = 1000', short: 'trapezoid', run: (x) => trapezoid(x, 1000), unit: 'evaluations', kind: 'quadrature' },
  { id: 'M2', name: 'Simpson, N = 100', short: 'Simpson', run: (x) => simpson(x, 100), unit: 'evaluations', kind: 'quadrature' },
  { id: "M2'", name: 'tail Simpson, N = 100', short: 'tail Simpson', run: (x) => tailSimpson(x, 100), unit: 'evaluations', kind: 'quadrature' },
  { id: 'M3', name: 'Taylor series of erf', short: 'Taylor erf', run: taylorErf, unit: 'terms', kind: 'series' },
  { id: 'M4', name: 'positive series', short: 'positive series', run: positiveSeries, unit: 'terms', kind: 'series' },
  { id: 'M5', name: 'Laplace continued fraction', short: 'cont. fraction', run: contFrac, unit: 'iterations', kind: 'continued fraction' },
  { id: 'M6a', name: 'A&S 7.1.26', short: 'A&S 7.1.26', run: as7126, unit: 'fixed', kind: 'approximation' },
  { id: 'M6b', name: 'Zelen–Severo (A&S 26.2.17)', short: 'Zelen–Severo', run: zelenSevero, unit: 'fixed', kind: 'approximation' },
  { id: 'M7', name: 'hybrid: series | cont. fraction', short: 'hybrid', run: (x) => hybrid(x), unit: 'terms or iterations', kind: 'hybrid' },
  { id: 'M8', name: 'Chebyshev (fixed cost)', short: 'Chebyshev', run: chebyshev, unit: 'coefficients', kind: 'approximation' },
];

export { SQRT2PI, INV_SQRT2PI };
