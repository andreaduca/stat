/* functions.js — the collection of integrands of Ex. 1 (f1–f8, f3′) and the two
   pathological ones that still make sense in floating point (P3 fat Cantor
   indicator, P5 Cantor function). Each one carries what both kinds of numerics
   need: f itself (every call counted), the exact integral, the range, the exact
   distribution function t ↦ λ{f > t} where it is known, the monotone pieces
   (for root finding and for Darboux bounds). Pure, no DOM.
   Note 01 §2 (the collection and why each member is there); note 02 (P3, P5);
   [[Layer-cake formula]]. */

import { brent } from './roots.js';
import { inFatCantor, fatCantorCellMeets, cantorFunction, cantorInverse } from './pathological.js';

const PI = Math.PI;

/**
 * An integrand on [a, b] with what Riemann and Lebesgue numerics need.
 * Category: data structure (the "function object" of draft §4.1).
 *
 * @property {string} id, label (TeX), why (one sentence: what it tests)
 * @property {(x:number)=>number} f   the function itself (not counted; use eval)
 * @property {number} a, b            the domain; open: {a, b} flags an open end where f is undefined/infinite
 * @property {number} exact           ∫_a^b f, exactly (closed form or a constant known to 20 digits)
 * @property {[number, number]} range [m, M] (M = Infinity for f5)
 * @property {(t)=>number} [muGt]     λ{x : f(x) > t}, exact (the "analytic" measure)
 * @property {(t)=>number} [muGeq]    λ{x : f(x) ≥ t}; equal to muGt except at levels of positive measure (steps)
 * @property {object[]} pieces        monotone pieces {lo, hi, dir: 'inc'|'dec'|'const', fLo, fHi}
 *                                    with fLo, fHi the one-sided limits of f at the ends (may be ±∞)
 */
export class Integrand {
  constructor(o) {
    Object.assign(this, { open: { a: false, b: false }, muGeq: null, ...o });
    if (!this.muGeq) this.muGeq = this.muGt;
    this.n = 0;
  }
  /** f(x), counted: the cost of every method is measured in evaluations. */
  eval(x) { this.n++; return this.f(x); }
  get evals() { return this.n; }
  resetCount() { this.n = 0; }
  get length() { return this.b - this.a; }

  /** inf and sup of f on the closed cell [l, r] (for Darboux sums), from the
   *  monotone pieces: on a monotone piece the extremes sit at the ends, so the
   *  candidates are f at l and r, the one-sided limits at every piece boundary
   *  inside, and f at those boundaries. Not counted as evaluations: this is
   *  analysis of f, not a numerical method. Overridden where pieces are infinite (f8) or absent (P3). */
  bounds(l, r) {
    let inf = Infinity, sup = -Infinity;
    const take = (v) => { if (v < inf) inf = v; if (v > sup) sup = v; };
    for (const p of this.pieces) {
      const lo = Math.max(p.lo, l), hi = Math.min(p.hi, r);
      if (lo > hi) continue;
      take(lo === p.lo ? p.fLo : this.f(lo));
      take(hi === p.hi ? p.fHi : this.f(hi));
      if (lo === p.lo && lo > this.a) take(this.f(lo));   // the value at a jump point itself
    }
    return { inf, sup };
  }
}

/* ---------- f7 and f8 need a little analysis of their own ---------- */

const sinc = (x) => (x === 0 ? 1 : Math.sin(x) / x);

/** λ{sin x/x > t} on [0, π]: sin x/x decreases from 1 to 0, so the set is [0, r)
 *  with sinc r = t. The "exact" measure is r itself, found to full precision by
 *  Brent (not counted: it stands for the closed form f7 does not have). */
function muSinc(t) {
  if (t >= 1) return 0;
  if (t < 0) return PI;
  if (t === 0) return PI;
  return brent(sinc, t, 0, PI, 1e-16).root;
}

/**
 * λ{x ∈ (0, 1] : sin(1/x) > t}, by the series of draft §4.3.
 * Category: measure (exact up to a truncated tail).
 * With u = 1/x ∈ [1, ∞), a = arcsin t, b = π − a: sin u > t exactly on the
 * intervals (a + 2πk, b + 2πk), whose images under x = 1/u are (1/(b + 2πk), 1/(a + 2πk)).
 * Clipped to u ≥ 1 (x ≤ 1):
 *    λ = Σ_{k≥0} (1/max(1, a + 2πk) − 1/(b + 2πk))⁺,
 * summed to kmax, plus the tail Σ_{k>kmax} ≈ (b − a)/(4π² kmax) (each term ≈ (b − a)/(2πk)²).
 */
export function muSinInv(t, kmax = 100000) {
  if (t >= 1) return 0;
  if (t < -1) return 1;
  const a = Math.asin(t), b = PI - a;
  let s = 0;
  for (let k = 0; k <= kmax; k++) {
    const lo = Math.max(1, a + 2 * PI * k), hi = b + 2 * PI * k;
    if (hi > lo) s += 1 / lo - 1 / hi;
  }
  return s + (b - a) / (4 * PI * PI * kmax);
}

/** The monotone pieces of sin(1/x) on (0, 1]: between consecutive critical
 *  points x_j = 1/(π/2 + πj). Only the first J are listed; the rest, all in
 *  (0, x_J], are left to `rest` (root finding uses an equidistribution estimate there). */
function sinInvPieces(J = 2000) {
  const pieces = [];
  const xs = (j) => 1 / (PI / 2 + PI * j);
  pieces.push({ lo: xs(0), hi: 1, dir: 'dec', fLo: 1, fHi: Math.sin(1) });
  for (let j = 1; j <= J; j++) {
    const lo = xs(j), hi = xs(j - 1), top = j % 2 === 1;          // odd j: from −1 up to +1 as x grows
    pieces.push({ lo, hi, dir: top ? 'inc' : 'dec', fLo: top ? -1 : 1, fHi: top ? 1 : -1 });
  }
  pieces.reverse();
  return { pieces, rest: xs(J) };
}

/** sup and inf of sin(1/x) on [l, r]: ±1 when the cell holds a peak 1/(π/2 + 2πk)
 *  or a trough 1/(3π/2 + 2πk); otherwise f is monotone there and the ends decide. */
function sinInvBounds(l, r) {
  if (l <= 0) return { inf: -1, sup: 1 };
  const u0 = 1 / r, u1 = 1 / l;
  const holds = (phase) => Math.floor((u1 - phase) / (2 * PI)) >= Math.ceil((u0 - phase) / (2 * PI));
  const fl = Math.sin(1 / l), fr = Math.sin(1 / r);
  return { inf: holds(1.5 * PI) ? -1 : Math.min(fl, fr), sup: holds(0.5 * PI) ? 1 : Math.max(fl, fr) };
}

/* ---------- the collection ---------- */

const step = (c) => new Integrand({
  id: c === 0.5 ? 'f3' : 'f3p',
  label: c === 0.5 ? String.raw`1 \text{ then } 3 \text{ from } x = \tfrac{1}{2}` : String.raw`1 \text{ then } 3 \text{ from } x = 1/\sqrt{2}`,
  why: c === 0.5 ? 'a jump that falls on the grid: the layer cake is exact, the midpoint rule too.'
    : 'the same jump off the grid: Riemann pays O(1/N) for the cell that straddles it; the layer cake does not care where the jump is.',
  f: (x) => (x < c ? 1 : 3), a: 0, b: 1, exact: 3 - 2 * c, range: [1, 3],
  muGt: (t) => (t < 1 ? 1 : t < 3 ? 1 - c : 0),
  muGeq: (t) => (t <= 1 ? 1 : t <= 3 ? 1 - c : 0),
  pieces: [{ lo: 0, hi: c, dir: 'const', fLo: 1, fHi: 1 }, { lo: c, hi: 1, dir: 'const', fLo: 3, fHi: 3 }],
});

export const FUNCTIONS = {
  f1: new Integrand({
    id: 'f1', label: String.raw`\sin x`, why: 'smooth, with a flat top: Riemann converges fast, the layer cake slows to K⁻³ᐟ² near the maximum.',
    f: Math.sin, a: 0, b: PI, exact: 2, range: [0, 1],
    muGt: (t) => (t < 0 ? PI : t >= 1 ? 0 : PI - 2 * Math.asin(t)),
    pieces: [{ lo: 0, hi: PI / 2, dir: 'inc', fLo: 0, fHi: 1 }, { lo: PI / 2, hi: PI, dir: 'dec', fLo: 1, fHi: Math.sin(PI) }],
  }),
  f2: new Integrand({
    id: 'f2', label: 'x^2', why: 'a polynomial, flat at 0: Simpson is exact; the layer cake meets a square-root cusp at t = 0.',
    f: (x) => x * x, a: 0, b: 1, exact: 1 / 3, range: [0, 1],
    muGt: (t) => (t < 0 ? 1 : t >= 1 ? 0 : 1 - Math.sqrt(t)),
    pieces: [{ lo: 0, hi: 1, dir: 'inc', fLo: 0, fHi: 1 }],
  }),
  f3: step(0.5),
  f3p: step(Math.SQRT1_2),
  f4: new Integrand({
    id: 'f4', label: String.raw`|x - \tfrac{1}{2}|`, why: 'piecewise linear with a kink: λ{f > t} is linear, so the layer-cake midpoint is exact.',
    f: (x) => Math.abs(x - 0.5), a: 0, b: 1, exact: 0.25, range: [0, 0.5],
    muGt: (t) => (t < 0 ? 1 : Math.max(1 - 2 * t, 0)),
    pieces: [{ lo: 0, hi: 0.5, dir: 'dec', fLo: 0.5, fHi: 0 }, { lo: 0.5, hi: 1, dir: 'inc', fLo: 0, fHi: 0.5 }],
  }),
  f5: new Integrand({
    id: 'f5', label: 'x^{-1/2}', why: 'unbounded at 0 but integrable: Riemann rules crawl at N⁻¹ᐟ²; the layer cake on a geometric t-grid with an analytic tail is exact.',
    f: (x) => 1 / Math.sqrt(x), a: 0, b: 1, open: { a: true, b: false }, exact: 2, range: [1, Infinity],
    muGt: (t) => (t < 1 ? 1 : 1 / (t * t)),
    pieces: [{ lo: 0, hi: 1, dir: 'dec', fLo: Infinity, fHi: 1 }],
    tail: (T) => 1 / T,                                   // ∫_T^∞ λ{f > t} dt = ∫ t⁻² dt
  }),
  f6: new Integrand({
    id: 'f6', label: String.raw`1 \text{ then } 0 \text{ from } x = \tfrac{1}{2}`, why: 'an indicator: the simplest simple function, whose Lebesgue integral is one product (height × measure).',
    f: (x) => (x < 0.5 ? 1 : 0), a: 0, b: 1, exact: 0.5, range: [0, 1],
    muGt: (t) => (t < 0 ? 1 : t < 1 ? 0.5 : 0),
    muGeq: (t) => (t <= 0 ? 1 : t <= 1 ? 0.5 : 0),
    pieces: [{ lo: 0, hi: 0.5, dir: 'const', fLo: 1, fHi: 1 }, { lo: 0.5, hi: 1, dir: 'const', fLo: 0, fHi: 0 }],
  }),
  f7: new Integrand({
    id: 'f7', label: String.raw`\frac{\sin x}{x}`, why: 'no elementary antiderivative (Si): the exact preimage needs root finding, so Lebesgue pays in evaluations.',
    f: sinc, a: 0, b: PI, exact: 1.8519370519824661704, range: [0, 1],
    muGt: muSinc,
    pieces: [{ lo: 0, hi: PI, dir: 'dec', fLo: 1, fHi: 0 }],
    measureNote: 'numerical inverse (Brent to full precision), standing in for a closed form',
  }),
  f8: (() => {
    const { pieces, rest } = sinInvPieces();
    const g = new Integrand({
      id: 'f8', label: String.raw`\sin(1/x)`, why: 'infinitely many oscillations near 0: Riemann errors jump around; the exact preimage is an infinite union of intervals.',
      f: (x) => Math.sin(1 / x), a: 0, b: 1, open: { a: true, b: false }, exact: 0.50406706190692837199, range: [-1, 1],
      muGt: (t) => muSinInv(t), pieces, rest,
    });
    g.bounds = sinInvBounds;
    return g;
  })(),
  P3: (() => {
    const g = new Integrand({
      id: 'P3', label: String.raw`1_S,\ S \text{ a fat Cantor set}`, why: 'not Riemann integrable (discontinuous on a set of measure ½), yet every Riemann sum with point tags converges to the Lebesgue value ½.',
      f: (x) => inFatCantor(x), a: 0, b: 1, exact: 0.5, range: [0, 1],
      muGt: (t) => (t < 0 ? 1 : t < 1 ? 0.5 : 0),
      muGeq: (t) => (t <= 0 ? 1 : t <= 1 ? 0.5 : 0),
      pieces: null,
      measureNote: 'λ(S) = 1 − Σ 2^{n−1} 4^{−n} = ½',
    });
    // a cell of positive length always contains removed points (S has empty interior): inf = 0;
    // sup = 1 exactly when the cell meets S
    g.bounds = (l, r) => ({ inf: r > l ? 0 : inFatCantor(l), sup: fatCantorCellMeets(l, r) ? 1 : 0 });
    return g;
  })(),
  P5: new Integrand({
    id: 'P5', label: String.raw`C(x),\ \text{the Cantor function}`, why: 'continuous and increasing, constant off a null set: Riemann and Lebesgue agree on ½; the distribution function is a mirror image of C.',
    f: cantorFunction, a: 0, b: 1, exact: 0.5, range: [0, 1],
    muGt: (t) => (t < 0 ? 1 : t >= 1 ? 0 : 1 - cantorInverse(t)),
    pieces: [{ lo: 0, hi: 1, dir: 'inc', fLo: 0, fHi: 1 }],
  }),
};

/** The order of the function picker. */
export const FUNCTION_IDS = ['f1', 'f2', 'f3', 'f3p', 'f4', 'f5', 'f6', 'f7', 'f8', 'P3', 'P5'];

/** The Riemann-integrable members (P3 is not; f5 only as an improper integral): the "limit agreement" table of E2. */
export const RIEMANN_INTEGRABLE = ['f1', 'f2', 'f3', 'f3p', 'f4', 'f6', 'f7', 'f8', 'P5'];   // f8: bounded, one discontinuity (at 0)
