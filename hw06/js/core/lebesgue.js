/* lebesgue.js — integration by cutting the RANGE: K levels t_k, and for each level
   the measure of its preimage λ{f > t_k}. The layer-cake formula
        ∫_Ω f = m·λ(Ω) + ∫_m^M λ{f > t} dt          (m = inf f)
   turns Lebesgue's integral into an ordinary 1-D integral over heights, so any
   Riemann rule in t gives a Lebesgue-style method. What remains is the real cost:
   computing λ{f > t}. Four measure providers do it four ways, each counting its cost.
   Pure, no DOM. Note 01 §2–4; [[Lebesgue integral]]; [[Layer-cake formula]]. */

import { brent } from './roots.js';

/* ======================= measure providers: t ↦ λ{f > t} ======================= */

/**
 * Exact measure from the integrand's own formula (draft §4.1 table).
 * Category: measure (analytic). Cost: no evaluations of f, one formula per level — the
 * best case for Lebesgue, and the one that hides the work: someone inverted f by hand.
 */
export class AnalyticMeasure {
  constructor(fn) { this.fn = fn; this.calls = 0; this.name = 'analytic'; }
  mu(t) { this.calls++; return this.fn.muGt(t); }
  muGeq(t) { this.calls++; return this.fn.muGeq(t); }
  get cost() { return 0; }
}

/**
 * Measure by root finding on every monotone piece.
 * Category: measure (numerical). On a piece where f increases from f(lo) to f(hi),
 * {f > t} is (r, hi] with f(r) = t: one Brent solve, ≈ 6–10 evaluations. Pieces entirely
 * above or below t cost nothing (their end values are known). Steps (const pieces) cost
 * nothing either. Cost = evaluations of f, counted.
 * f8 has infinitely many pieces: the first 2000 are solved, the rest (0, x₂₀₀₀], a set of
 * length ≈ 1.6·10⁻⁴, gets the equidistribution estimate x₂₀₀₀ · (π − 2 arcsin t)/(2π).
 */
export class RootFindingMeasure {
  constructor(fn, tol = 1e-14) { this.fn = fn; this.tol = tol; this.name = 'root finding'; this.start = fn.evals; }
  _mu(t, geq) {
    const fn = this.fn, f = (x) => fn.eval(x);
    const above = geq ? (v) => v >= t : (v) => v > t;
    let s = 0;
    for (const p of fn.pieces) {
      const len = p.hi - p.lo;
      if (p.dir === 'const') { if (above(p.fLo)) s += len; continue; }
      const top = p.dir === 'inc' ? p.fHi : p.fLo, bottom = p.dir === 'inc' ? p.fLo : p.fHi;
      if (t >= top) continue;                       // the whole piece is at or below t
      if (t < bottom) { s += len; continue; }       // the whole piece is above t
      const r = brent(f, t, p.lo, p.hi, this.tol).root;
      s += p.dir === 'inc' ? p.hi - r : r - p.lo;
    }
    if (fn.rest && t > -1 && t < 1) s += (fn.rest * (Math.PI - 2 * Math.asin(t))) / (2 * Math.PI);
    else if (fn.rest && t <= -1) s += fn.rest;
    return s;
  }
  mu(t) { return this._mu(t, false); }
  muGeq(t) { return this._mu(t, true); }
  get cost() { return this.fn.evals - this.start; }
}

/** Number of entries of a sorted array that are > t (or ≥ t), by binary search. */
function countAbove(sorted, t, geq) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (geq ? sorted[mid] < t : sorted[mid] <= t) lo = mid + 1; else hi = mid;
  }
  return sorted.length - lo;
}

/** A measure read off a finite sample of values of f (sorted once): the common part
 *  of the Monte Carlo and grid providers. */
class SampleMeasure {
  constructor(fn, values, cost, name) {
    this.fn = fn; this.values = values.sort(); this.n = values.length; this._cost = cost; this.name = name;
  }
  mu(t) { return (this.fn.length * countAbove(this.values, t, false)) / this.n; }
  muGeq(t) { return (this.fn.length * countAbove(this.values, t, true)) / this.n; }
  get cost() { return this._cost; }
}

/**
 * Measure by Monte Carlo: λ{f > t} ≈ λ(Ω) · #{i : f(Uᵢ) > t}/n for n uniform points.
 * Category: measure (Monte Carlo). One sample is shared by all levels and sorted once, so
 * each level is a binary search. Cost: n evaluations. Error O(1/√n) per level, in any
 * dimension: this is Monte Carlo integration seen as Lebesgue (note 06 §4).
 */
export class MonteCarloMeasure extends SampleMeasure {
  constructor(fn, rng, n) {
    const start = fn.evals, values = new Float64Array(n);
    for (let i = 0; i < n; i++) values[i] = fn.eval(fn.a + rng.float() * fn.length);
    super(fn, values, fn.evals - start, 'Monte Carlo');
  }
}

/**
 * Measure by counting grid points: λ{f > t} ≈ λ(Ω) · #{i : f(xᵢ) > t}/N on the N midpoints.
 * Category: measure (grid). Used only to SHOW that it is not a new method: integrating its
 * distribution function exactly gives back the midpoint Riemann sum, term for term
 * rearranged (layerCakeExact; note 01 §2 "when Lebesgue numerics are secretly Riemann").
 */
export class GridCountMeasure extends SampleMeasure {
  constructor(fn, N) {
    const start = fn.evals, h = fn.length / N, values = new Float64Array(N);
    for (let i = 0; i < N; i++) values[i] = fn.eval(fn.a + (i + 0.5) * h);
    super(fn, values, fn.evals - start, 'grid count');
  }
}

/** A provider by name. */
export function measure(name, fn, { rng = null, n = 10000, N = 1000 } = {}) {
  if (name === 'analytic') return new AnalyticMeasure(fn);
  if (name === 'root') return new RootFindingMeasure(fn);
  if (name === 'mc') return new MonteCarloMeasure(fn, rng, n);
  if (name === 'grid') return new GridCountMeasure(fn, N);
  throw new Error(`unknown measure provider ${name}`);
}

/* ======================= Lebesgue rules ======================= */

/**
 * Lower simple-function sum: L_K = m·λ(Ω) + Δ Σ_{k=1}^{K} λ{f ≥ m + kΔ},  Δ = (M − m)/K.
 * Category: Lebesgue rule. It is ∫ of the simple function φ_K = m + Δ·⌊(f − m)/Δ⌋ ≤ f,
 * Lebesgue's own definition from below; error ≤ Δ λ(Ω) = O(1/K), and exact for steps whose
 * heights fall on the levels (f3, f6).
 */
export function lowerSum(fn, P, K) {
  const [m, M] = fn.range, d = (M - m) / K;
  let s = 0;
  for (let k = 1; k <= K; k++) s += P.muGeq(m + k * d);
  return { value: m * fn.length + d * s, cost: P.cost };
}

/**
 * Layer-cake midpoint: C_K = m·λ(Ω) + Δ Σ_{k=0}^{K−1} λ{f > m + (k + ½)Δ}.
 * Category: Lebesgue rule (the midpoint rule applied to the distribution function).
 * Error: O(K⁻²) where μ(t) = λ{f > t} is smooth; but at a critical value of f (a flat
 * top or bottom, f′ = 0) μ has a square-root cusp, μ(t) ≈ c√(M − t), and the rate drops
 * to K^{−3/2} (note 01 §3: f1, f2, f7). Exact when μ is linear (f4) or a step (f3, f6).
 */
export function layerCakeMidpoint(fn, P, K) {
  const [m, M] = fn.range, d = (M - m) / K;
  let s = 0;
  for (let k = 0; k < K; k++) s += P.mu(m + (k + 0.5) * d);
  return { value: m * fn.length + d * s, cost: P.cost };
}

/** A geometric grid t₀ < t₁ < … < t_K = T (constant ratio): equal room per decade, for
 *  unbounded f where λ{f > t} decays like a power of t. */
export const geometricGrid = (t0, T, K) => Array.from({ length: K + 1 }, (_, k) => t0 * (T / t0) ** (k / K));

/**
 * Layer cake on any t-grid, with an optional analytic tail:
 *    t₀ λ(Ω) + Σ_k (t_{k+1} − t_k) λ{f > t̂_k} + ∫_T^∞ λ{f > t} dt,
 * t̂_k the arithmetic or geometric (√(t_k t_{k+1})) midpoint. Requires t₀ ≤ inf f.
 * Category: Lebesgue rule for unbounded f. For f5 = x^{−1/2}, λ{f > t} = t⁻², the geometric
 * midpoint is exact on every cell — (t_{k+1} − t_k)/(t_k t_{k+1}) both ways — and the tail
 * ∫_T^∞ t⁻² dt = 1/T closes it: exact at K = 10, where the midpoint rule in x needs N ≈ 10¹⁰
 * for the same accuracy.
 */
export function layerCakeGrid(fn, P, tGrid, { geometric = true, tail = null } = {}) {
  let s = tGrid[0] * fn.length;
  for (let k = 0; k + 1 < tGrid.length; k++) {
    const a = tGrid[k], b = tGrid[k + 1];
    s += (b - a) * P.mu(geometric ? Math.sqrt(a * b) : (a + b) / 2);
  }
  if (tail) s += tail(tGrid[tGrid.length - 1]);
  return { value: s, cost: P.cost };
}

/**
 * The layer cake of a sampled distribution, integrated exactly: with the sample values
 * sorted v₍₁₎ ≤ … ≤ v₍ₙ₎, the empirical μ(t) is a staircase, so
 *    ∫ = λ(Ω) [ v₍₁₎ + Σ_{j≥2} (v₍ⱼ₎ − v₍ⱼ₋₁₎) (n − j + 1)/n ].
 * Category: Lebesgue rule on a step function. Summation by parts shows it equals
 * λ(Ω)·(1/n) Σ vⱼ: on the grid provider that is the midpoint Riemann sum, on the Monte
 * Carlo provider the plain MC estimate. Same numbers, added in another order (Lebesgue's
 * coins: sorted by value instead of counted in order of arrival).
 */
export function layerCakeExact(P) {
  const v = P.values, n = v.length;
  let s = v[0];
  for (let j = 1; j < n; j++) s += (v[j] - v[j - 1]) * (n - j) / n;
  return { value: P.fn.length * s, cost: P.cost };
}

/** The Lebesgue rules by name. */
export const LEBESGUE_RULES = {
  lower: { run: lowerSum, label: 'lower simple sum', order: 1 },
  layercake: { run: layerCakeMidpoint, label: 'layer-cake midpoint', order: 1.5 },
};
