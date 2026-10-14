/* curve.js — the group E: y² = x³ + ax + b over F_p, and the two operations
   the homework is about: point addition (chord and tangent) and scalar
   multiplication (naive vs double-and-add). Both can record a trace, which
   is what the visualiser animates. Pure BigInt, no DOM. */

import { divisors } from './field.js';

export class Point {
  constructor(x, y) {
    this.x = BigInt(x);
    this.y = BigInt(y);
    Object.freeze(this);              // points are values, never mutated
  }
  get isInfinity() { return false; }
  eq(Q) { return !!Q && !Q.isInfinity && this.x === Q.x && this.y === Q.y; }
  toString() { return `(${this.x}, ${this.y})`; }
}

/** The identity O, a single frozen object. It is deliberately NOT (0,0):
 *  (0,0) can be an ordinary curve point, so using it would corrupt the group. */
export const INFINITY = Object.freeze({
  isInfinity: true,
  eq(Q) { return !!Q && Q.isInfinity === true; },
  toString() { return '𝒪'; },
});

export class EllipticCurve {
  /** @param {PrimeField} field @param {bigint} a @param {bigint} b */
  constructor(field, a, b, name = '') {
    this.F = field;
    this.a = field.mod(a);
    this.b = field.mod(b);
    this.name = name;
    this.groupOps = 0;                // counts real chord/tangent steps
    this._points = null;
    this._order = null;
  }

  get p() { return this.F.p; }

  get equation() {
    const a = this.a, b = this.b;
    const terms = ['x³'];
    if (a !== 0n) terms.push(a === 1n ? 'x' : `${a}x`);
    if (b !== 0n) terms.push(`${b}`);
    return `y² = ${terms.join(' + ')} mod ${this.p}`;
  }

  /** 4a³ + 27b² — the discriminant. Zero means the curve has a cusp or a
   *  self-crossing, the tangent is undefined there and the group law breaks. */
  discriminant() {
    const F = this.F;
    return F.add(F.mul(4n, F.pow(this.a, 3n)), F.mul(27n, F.mul(this.b, this.b)));
  }

  isNonSingular() { return this.discriminant() !== 0n; }

  /** The right-hand side x³ + ax + b. */
  rhs(x) {
    const F = this.F;
    return F.add(F.add(F.mul(F.mul(x, x), x), F.mul(this.a, x)), this.b);
  }

  contains(P) {
    if (!P) return false;
    if (P.isInfinity) return true;
    return this.F.mul(P.y, P.y) === this.rhs(P.x);
  }

  /** -P is the mirror image across y = p/2, because y and p-y are the two
   *  roots of the same y². This is the symmetry visible in the scatter plot. */
  neg(P) { return P.isInfinity ? P : new Point(P.x, this.F.neg(P.y)); }

  /** P + Q by chord (P != Q) or tangent (P = Q).
   *
   *      λ = (y₂-y₁)/(x₂-x₁)        chord
   *      λ = (3x₁²+a)/(2y₁)         tangent
   *      x₃ = λ² - x₁ - x₂,   y₃ = λ(x₁-x₃) - y₁
   *
   *  Special cases, in this order: O as operand; a vertical line (x₁ = x₂ with
   *  y₁ = -y₂, which also covers doubling a point with y = 0) giving O; then
   *  tangent; then chord. Pass `step` to record the geometry for the visualiser.
   */
  add(P, Q, step = null) {
    const F = this.F;
    const record = (fields) => { if (step) Object.assign(step, { P, Q, lambda: null, nu: null, inverse: null, R3: null, special: null, ...fields }); };

    if (P.isInfinity) { record({ special: 'identity', result: Q }); return Q; }
    if (Q.isInfinity) { record({ special: 'identity', result: P }); return P; }

    if (P.x === Q.x && F.add(P.y, Q.y) === 0n) {
      // the line through P and -P is vertical: its third intersection is O
      record({ special: 'vertical', result: INFINITY });
      return INFINITY;
    }

    this.groupOps++;
    const doubling = P.eq(Q);
    const numerator   = doubling ? F.add(F.mul(3n, F.mul(P.x, P.x)), this.a) : F.sub(Q.y, P.y);
    const denominator = doubling ? F.mul(2n, P.y)                            : F.sub(Q.x, P.x);
    const inverse = F.inv(denominator);            // division in F_p = times the inverse
    const lambda  = F.mul(numerator, inverse);
    const nu      = F.sub(P.y, F.mul(lambda, P.x)); // the line is y = λx + ν

    const x3 = F.sub(F.sub(F.mul(lambda, lambda), P.x), Q.x);
    const y3 = F.sub(F.mul(lambda, F.sub(P.x, x3)), P.y);
    const result = new Point(x3, y3);

    // R3 is where the line meets the curve a third time; the sum is its mirror
    record({ doubling, lambda, nu, inverse: { of: denominator, value: inverse }, R3: new Point(x3, F.neg(y3)), result });
    return result;
  }

  /** kP, by repeated addition or by double-and-add.
   *  naive:          k-1 additions, so cost grows like k.
   *  double-and-add: one doubling per bit of k plus one addition per 1-bit,
   *                  so cost grows like log k. This gap is why the forward
   *                  direction is cheap while inverting it is not.
   *  Pass `trace` (an array) to collect one entry per group operation. */
  mul(k, P, { method = 'double-and-add', trace = null } = {}) {
    let n = BigInt(k);
    let base = P;
    if (n < 0n) { n = -n; base = this.neg(P); }        // (-k)P = k(-P)
    if (n === 0n || base.isInfinity) return INFINITY;

    const push = (op, bit, before, after, step) => {
      if (trace) trace.push({ op, bit, multipleBefore: before, multipleAfter: after, ...step });
    };

    if (method === 'naive') {
      let R = base, m = 1n;
      while (m < n) {
        const step = {};
        R = this.add(R, base, step);
        push('A', null, m, m + 1n, step);
        m += 1n;
      }
      return R;
    }

    // left to right over the bits of k, starting after the leading 1
    let R = base, m = 1n;
    for (const bit of n.toString(2).slice(1)) {
      let step = {};
      R = this.add(R, R, step);
      push('D', Number(bit), m, m * 2n, step);
      m *= 2n;
      if (bit === '1') {
        step = {};
        R = this.add(R, base, step);
        push('A', 1, m, m + 1n, step);
        m += 1n;
      }
    }
    return R;
  }

  /** Every affine point, found by tabulating the squares of F_p once and
   *  reading off the y with y² = rhs(x). O is not in the list. */
  points() {
    if (this._points) return this._points;
    if (this.p > 5000n) throw new RangeError('enumeration is limited to p <= 5000');
    const roots = new Map();
    for (let y = 0n; y < this.p; y++) {
      const square = this.F.mod(y * y);
      if (!roots.has(square)) roots.set(square, []);
      roots.get(square).push(y);
    }
    const out = [];
    for (let x = 0n; x < this.p; x++) for (const y of roots.get(this.rhs(x)) ?? []) out.push(new Point(x, y));
    return (this._points = out);
  }

  /** #E = 1 + Σ_x #{y : y² = rhs(x)}, counted with Euler's criterion:
   *  0 contributes one y, a non-zero square two, a non-square none. */
  order() {
    if (this._order !== null) return this._order;
    let count = 1n;                                    // the identity O
    for (let x = 0n; x < this.p; x++) {
      const r = this.rhs(x);
      count += r === 0n ? 1n : (this.F.isSquare(r) ? 2n : 0n);
    }
    return (this._order = count);
  }

  /** Hasse's theorem: #E can only land within 2√p of p+1. A sanity check on
   *  the count above, and the reason #E is always "about p". */
  hasse() {
    const p = Number(this.p);
    const radius = 2 * Math.sqrt(p);
    return { centre: p + 1, radius, lo: Math.ceil(p + 1 - radius), hi: Math.floor(p + 1 + radius) };
  }

  /** The smallest m with mP = O. By Lagrange it divides #E, so only the
   *  divisors need testing instead of every m up to #E. */
  pointOrder(P) {
    if (P.isInfinity) return 1n;
    for (const d of divisors(this.order())) if (this.mul(d, P).isInfinity) return d;
    return this.order();
  }

  /** P generates the whole group iff its order is #E. */
  isGenerator(P) { return this.pointOrder(P) === this.order(); }

  /** order -> how many points have it. If the largest order is below #E the
   *  group is not cyclic: no single point reaches everything. */
  orderHistogram() {
    const tally = new Map([[1n, 1]]);                  // O has order 1
    for (const P of this.points()) {
      const d = this.pointOrder(P);
      tally.set(d, (tally.get(d) ?? 0) + 1);
    }
    return new Map([...tally].sort((x, y) => (x[0] < y[0] ? -1 : 1)));
  }
}

/** Run kP while counting work: group operations, inversions, multiplications.
 *  Resetting first is what keeps the keygen counters comparable. */
export function measure(curve, k, P, method) {
  curve.groupOps = 0;
  curve.F.resetOps();
  const trace = [];
  const Q = curve.mul(k, P, { method, trace });
  return { Q, trace, ops: { group: curve.groupOps, inv: curve.F.ops.inv, mul: curve.F.ops.mul } };
}
