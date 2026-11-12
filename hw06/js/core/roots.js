/* roots.js — Brent's method for f(x) = t on a bracketing interval, counting the
   evaluations of f. The Lebesgue root-finding measure (lebesgue.js) calls it on
   every monotone piece of an integrand, and Φ⁻¹ uses the same safeguarded idea.
   Pure, no DOM. Note 01 §2 ("preimage measures by root finding"). */

/**
 * Brent's method (Brent 1973, "Algorithms for Minimization without Derivatives", ch. 4).
 * Category: numerical root finding.
 *
 * What it computes: a root of g(x) = f(x) − t in [lo, hi], given g(lo) and g(hi) of
 * opposite signs.
 *
 * How: it keeps a bracket [b, c] around the root and, at every step, tries the fast
 * guess — inverse quadratic interpolation through three points, or the secant through
 * two — and accepts it only if it lands well inside the bracket and shrinks it fast
 * enough; otherwise it bisects. So it is never slower than bisection (one bit per
 * evaluation) and usually converges superlinearly (order ≈ 1.8).
 *
 * Why Brent and not Newton: the integrands of Ex. 1 include kinks, jumps and
 * infinite values (f5 at 0); Newton needs f′ and can leave the bracket.
 *
 * Accuracy and cost (measured, P1): on sin x/x and sin x with tol = 10⁻¹⁴, 6–10
 * evaluations per root.
 *
 * Infinite values (f5 = x^{−1/2} at 0) are clamped to ±10³⁰⁰, so interpolation
 * through them gives a useless guess and the safeguard falls back to bisection.
 *
 * @param {(x: number) => number} f  the function (each call counted)
 * @param {number} t   the level
 * @param {number} lo  bracket, with f(lo) − t and f(hi) − t of opposite signs (or zero)
 * @param {number} hi
 * @param {number} [tol]  absolute tolerance on x
 * @returns {{root: number, evals: number}}
 */
export function brent(f, t, lo, hi, tol = 1e-14) {
  let evals = 0;
  const g = (x) => { evals++; const v = f(x) - t; return v > 1e300 ? 1e300 : v < -1e300 ? -1e300 : v; };
  let a = lo, b = hi, fa = g(a), fb = g(b);
  if (fa === 0) return { root: a, evals };
  if (fb === 0) return { root: b, evals };
  if (fa * fb > 0) throw new Error('brent: the interval does not bracket a root');
  let c = a, fc = fa, d = b - a, e = d;
  for (let iter = 0; iter < 200; iter++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }          // keep the root between b and c
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }   // b is the best guess
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + tol / 2, m = (c - b) / 2;
    if (Math.abs(m) <= tol1 || fb === 0) return { root: b, evals };
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      // try interpolation: secant if a = c, inverse quadratic otherwise
      let p, q, r;
      const s = fb / fa;
      if (a === c) { p = 2 * m * s; q = 1 - s; }
      else {
        q = fa / fc; r = fb / fc;
        p = s * (2 * m * q * (q - r) - (b - a) * (r - 1));
        q = (q - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q; else p = -p;
      // accept only if inside the bracket and shrinking at least as fast as two bisections
      if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = m; e = m; }
    } else { d = m; e = m; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (m > 0 ? tol1 : -tol1);
    fb = g(b);
  }
  return { root: b, evals };
}
