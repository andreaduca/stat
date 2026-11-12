/* pathological.js — the functions where Riemann and Lebesgue part ways (note 02):
   P1 Dirichlet, with symbolic tags because floating point has no irrationals;
   P2 Thomae, in exact integer arithmetic; P3 the indicator of a fat Cantor set;
   P4 sin x/x on [0, ∞), improper Riemann but not Lebesgue; P5 the Cantor function.
   Pure, no DOM. [[Riemann integral]] Thms 4–5; [[Lebesgue measure and null sets]];
   [[Riemann vs Lebesgue integrability]]. */

import { toFraction } from './fparith.js';

/* ================= P1 · Dirichlet: 1 on the rationals, 0 on the irrationals ================= */

/**
 * A tag that knows whether it is rational: {kind: 'rational', p, q} is p/q;
 * {kind: 'irrational', p, q, r: [r0, r1]} is p/q + (r0/r1)·√2 with r0 ≠ 0, irrational
 * because √2 is. Category: exact (symbolic) arithmetic.
 * Why symbolic: a double is always a dyadic rational (fparith.toFraction), so
 * "pick an irrational tag" cannot be done with numbers — only with their names.
 */
export const rationalTag = (i, N) => ({ kind: 'rational', p: i, q: N });
/** The irrational tag (i − 1 + √2)/N, which lies inside the cell [i/N, (i+1)/N] since 1 < √2 < 2. */
export const irrationalTag = (i, N) => ({ kind: 'irrational', p: i - 1, q: N, r: [1, N] });
/** A tag's position, for drawing only. */
export const tagValue = (t) => t.p / t.q + (t.kind === 'irrational' ? (t.r[0] / t.r[1]) * Math.SQRT2 : 0);

/** The Dirichlet function on a symbolic tag. Category: pathological function. */
export const dirichlet = (tag) => (tag.kind === 'rational' ? 1 : 0);

/** The Dirichlet function on a double: always 1, because every finite double is p/2^k.
 *  Category: pathological function (and a floating-point lesson, note 02 §1). */
export const dirichletFloat = (x) => (Number.isFinite(x) && toFraction(x) ? 1 : 0);

/**
 * Riemann sum of Dirichlet's function on N equal cells of [0, 1].
 *    rational tags i/N        → every term 1 → sum = 1
 *    irrational tags          → every term 0 → sum = 0
 *    float tags i/N           → every term 1 (dyadic rationals) → sum = 1
 * Two choices of tags, two different limits: not Riemann integrable [T].
 * The Lebesgue integral is 1·λ(ℚ ∩ [0,1]) + 0·λ(rest) = 0, since ℚ is countable, a null set.
 * @param {'rational'|'irrational'|'float'} kind
 */
export function dirichletSum(N, kind) {
  let s = 0;
  for (let i = 0; i < N; i++) {
    s += kind === 'float' ? dirichletFloat(i / N) : dirichlet(kind === 'rational' ? rationalTag(i, N) : irrationalTag(i, N));
  }
  return s / N;
}

/* ================= P2 · Thomae: f(p/q) = 1/q in lowest terms, f(irrational) = 0 ================= */

/** Greatest common divisor of non-negative integers (Euclid). */
export function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Thomae's function at p/q (integers, q > 0): 1/(q/gcd). Category: pathological function. */
export const thomae = (p, q) => 1 / (q / gcd(Math.abs(p), q));

/**
 * Left-tag Riemann sum of Thomae on N cells, exactly.
 * Category: Riemann rule, in integer arithmetic.
 * Tag i/N = (i/g)/(N/g) with g = gcd(i, N), so f(i/N) = g/N (and f(0) = 1 = N/N), hence
 *    S_N = (1/N) Σ_{i=0}^{N−1} gcd(i, N)/N = (1/N²) Σ_{i=1}^{N} gcd(i, N)
 * (gcd(0, N) = N = gcd(N, N)). Pillai's function Σ gcd(i, N) grows like N^{1+ε}, so S_N → 0;
 * it is largest for N with many divisors and smallest for primes (2/N − 1/N²). [[Riemann integral]] Thm 5.
 * @returns {{num: number, den: number, value: number}}
 */
export function thomaeLeftSum(N) {
  let num = 0;
  for (let i = 1; i <= N; i++) num += gcd(i, N);
  return { num, den: N * N, value: num / (N * N) };
}

/** Midpoint-tag sum: tags (2i+1)/(2N), f = gcd(2i+1, 2N)/(2N), so
 *  S = (1/(2N²)) Σ_{i=0}^{N−1} gcd(2i + 1, 2N). */
export function thomaeMidSum(N) {
  let num = 0;
  for (let i = 0; i < N; i++) num += gcd(2 * i + 1, 2 * N);
  return { num, den: 2 * N * N, value: num / (2 * N * N) };
}

/**
 * Upper Darboux sum of Thomae on N cells, exactly.
 * Category: Darboux sum, integer arithmetic.
 * The sup on the closed cell [i/N, (i+1)/N] is 1/q for the smallest q such that some p/q
 * lies in the cell: i/N ≤ p/q ≤ (i+1)/N ⇔ ⌈iq/N⌉ ≤ ⌊(i+1)q/N⌋. q = N always works, so the
 * search ends. U_N = (1/N) Σ_i 1/q_i → 0 (the lower sums are 0: every cell holds irrationals),
 * which is the proof that Thomae is Riemann integrable with integral 0, made numerical.
 * Cost: Σ q_i, about N^{3/2}.
 */
export function thomaeUpper(N, onProgress = null) {
  let s = 0;
  for (let i = 0; i < N; i++) {
    let q = 1;
    while (Math.ceil((i * q) / N) > Math.floor(((i + 1) * q) / N)) q++;
    s += 1 / q;
    if (onProgress && (i & 4095) === 0) onProgress(i / N);
  }
  return s / N;
}

/** The points (p/q, 1/q) of Thomae's graph for q ≤ qMax, in lowest terms. */
export function thomaePoints(qMax = 60) {
  const pts = [];
  for (let q = 1; q <= qMax; q++) for (let p = 0; p <= q; p++) if (gcd(p, q) === 1) pts.push([p / q, 1 / q]);
  return pts;
}

/* ================= P3 · a fat Cantor set (Smith–Volterra–Cantor) ================= */

/**
 * Membership in the fat Cantor set S ⊂ [0, 1].
 * Category: pathological function (an indicator).
 * Construction: at step n remove, from the middle of each of the 2^{n−1} pieces left,
 * an open interval of length 4^{−n}. Removed in total Σ 2^{n−1} 4^{−n} = ½, so λ(S) = ½:
 * S is closed, nowhere dense (no interval inside), yet has positive measure. Its indicator
 * is discontinuous at every point of S, a set of measure ½ > 0, so by Lebesgue's
 * criterion it is not Riemann integrable [T]; its Lebesgue integral is λ(S) = ½.
 * In doubles the construction is exact up to step ≈ 26 (the gaps reach the spacing of doubles).
 * @returns {0|1}
 */
export function inFatCantor(x, depth = 30) {
  if (x < 0 || x > 1) return 0;
  let lo = 0, hi = 1;
  for (let n = 1; n <= depth; n++) {
    const mid = (lo + hi) / 2, half = 4 ** -n / 2;
    if (x > mid - half && x < mid + half) return 0;     // in the removed open interval
    if (x <= mid - half) hi = mid - half; else lo = mid + half;
  }
  return 1;
}

/**
 * Does the closed cell [l, r] meet S? (For the upper Darboux sum: sup 1_S = 1 iff yes.)
 * Category: exact set computation.
 * The endpoints of every piece belong to S (they are never removed). So: if the cell
 * holds an endpoint of the current piece, yes; if it lies inside the piece's removed
 * gap, no; otherwise it lies inside one of the two sub-pieces: descend.
 */
export function fatCantorCellMeets(l, r, depth = 30) {
  let lo = 0, hi = 1;
  if (r < lo || l > hi) return false;
  for (let n = 1; n <= depth; n++) {
    if (l <= lo || r >= hi) return true;                 // holds an endpoint of the piece (l ≤ lo ≤ r or l ≤ hi ≤ r)
    const mid = (lo + hi) / 2, half = 4 ** -n / 2, g0 = mid - half, g1 = mid + half;
    if (l > g0 && r < g1) return false;                  // inside the gap
    if (l <= g0 && r >= g0) return true;                 // holds g0, the right end of the left sub-piece
    if (l <= g1 && r >= g1) return true;
    if (r < g0) hi = g0; else lo = g1;
  }
  return true;
}

/** Upper Darboux sum of 1_S on N cells: the fraction of cells that meet S. Lower sums are 0. */
export function fatCantorUpper(N) {
  let k = 0;
  for (let i = 0; i < N; i++) if (fatCantorCellMeets(i / N, (i + 1) / N)) k++;
  return k / N;
}

/** The pieces left after each of the first `steps` steps, for the construction picture. */
export function fatCantorSteps(steps = 6) {
  const out = [[[0, 1]]];
  for (let n = 1; n <= steps; n++) {
    const next = [];
    for (const [lo, hi] of out[n - 1]) {
      const mid = (lo + hi) / 2, half = 4 ** -n / 2;
      next.push([lo, mid - half], [mid + half, hi]);
    }
    out.push(next);
  }
  return out;
}

/* ================= P4 · sin x / x on [0, ∞) ================= */

const sinc = (x) => (x === 0 ? 1 : Math.sin(x) / x);

/** Simpson on [a, b] with m (even) cells. */
function simpsonOn(f, a, b, m = 16) {
  const h = (b - a) / m;
  let s = f(a) + f(b);
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/**
 * The two partial integrals of P4 at each T: I(T) = ∫₀^T sin x/x dx and A(T) = ∫₀^T |sin x|/x dx.
 * Category: Riemann rule (Simpson per period [kπ, (k+1)π], where the integrand has one sign).
 * I(T) → π/2 (improper Riemann integral, conditionally convergent; the value is the Dirichlet
 * integral 📌); A(T) ≈ (2/π) ln T + const → ∞, so sin x/x is not Lebesgue integrable on [0, ∞):
 * Lebesgue needs ∫|f| < ∞ (note 02 §5).
 * @param {number[]} Ts increasing
 * @returns {[number, number, number][]}  rows [T, I(T), A(T)]
 */
export function p4Partials(Ts) {
  const out = [];
  let k = 0, I = 0, A = 0;                 // integrals over the full periods [0, kπ]
  for (const T of Ts) {
    while ((k + 1) * Math.PI <= T) {
      const v = simpsonOn(sinc, k * Math.PI, (k + 1) * Math.PI);
      I += v; A += Math.abs(v); k++;
    }
    const part = T > k * Math.PI ? simpsonOn(sinc, k * Math.PI, T) : 0;
    out.push([T, I + part, A + Math.abs(part)]);
  }
  return out;
}

/* ================= P5 · the Cantor function (devil's staircase) ================= */

/**
 * C(x) from the base-3 digits of x: digits 0/2 become binary digits 0/1, and the
 * first digit 1 ends the expansion with a binary 1.
 * Category: pathological function. Continuous, increasing, C(0) = 0, C(1) = 1, yet
 * C′ = 0 almost everywhere (constant on every removed middle third): the fundamental
 * theorem of calculus fails for it. ∫₀¹ C = ½ by the symmetry C(1 − x) = 1 − C(x).
 */
export function cantorFunction(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let y = 0, w = 0.5;
  for (let k = 0; k < 60; k++) {
    x *= 3;
    const d = Math.floor(x);
    x -= d;
    if (d === 1) return y + w;
    if (d === 2) y += w;
    w /= 2;
  }
  return y;
}

/** sup{x : C(x) ≤ t}: binary digits of t become ternary digits 0/2. So λ{C > t} = 1 − this. */
export function cantorInverse(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let x = 0, w = 2 / 3;
  for (let k = 0; k < 60 && t > 0; k++) {
    t *= 2;
    if (t >= 1) { x += w; t -= 1; }
    w /= 3;
  }
  return x;
}
