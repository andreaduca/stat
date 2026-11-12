/* fparith.js — what a binary64 number really is: its exact value as a fraction
   (BigInt), the gap to its neighbour (ulp), and the error measures every table of
   hw06 prints. Pure, no DOM. Note 02 §1 (every float is rational), note 03 §4
   (relative error, ulps). */

/**
 * The exact rational value of a finite double, as num/den with den a power of 2.
 * Category: exact arithmetic.
 *
 * A double is ±1.f × 2^(e−1023) (normal) or ±0.f × 2^(−1022) (subnormal), with a
 * 52-bit fraction f: so it is an integer times a power of two — always rational,
 * and its denominator is a power of 2 (at most 2¹⁰⁷⁴). This is why the Dirichlet
 * function evaluated in floating point returns 1 everywhere (note 02 §1, P1):
 * 0.1 is not one tenth but 3602879701896397 / 2⁵⁵.
 *
 * @param {number} x  a finite double
 * @returns {{num: bigint, den: bigint, exp2: number}}  in lowest terms; den = 2^exp2
 */
export function toFraction(x) {
  if (!Number.isFinite(x)) throw new Error('toFraction: not a finite number');
  if (x === 0) return { num: 0n, den: 1n, exp2: 0 };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0), lo = view.getUint32(4);
  const sign = hi >>> 31 ? -1n : 1n;
  const biased = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;                                     // x = mant · 2^e
  if (biased === 0) e = -1074;               // subnormal: no implicit leading 1
  else { mant |= 1n << 52n; e = biased - 1075; }
  while (e < 0 && (mant & 1n) === 0n) { mant >>= 1n; e++; }   // lowest terms
  return e >= 0
    ? { num: sign * (mant << BigInt(e)), den: 1n, exp2: 0 }
    : { num: sign * mant, den: 1n << BigInt(-e), exp2: -e };
}

/** The gap between |x| and the next larger double (the unit in the last place).
 *  Category: floating point. ulp(1) = 2⁻⁵² ≈ 2.2·10⁻¹⁶ = machine epsilon. */
export function ulp(x) {
  x = Math.abs(x);
  if (!Number.isFinite(x)) return NaN;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0) - x;
}

/** Relative error |approx − ref| / |ref|; the absolute error when ref = 0.
 *  Category: error measure. A probability in a tail must be judged relatively:
 *  an absolute error of 10⁻¹⁶ is perfect at Φ = 0.5 and 100 % wrong at Φ = 10⁻¹⁶ (note 03 §1). */
export const relErr = (approx, ref) => (ref === 0 ? Math.abs(approx) : Math.abs(approx - ref) / Math.abs(ref));

/** Absolute error |approx − ref|. */
export const absErr = (approx, ref) => Math.abs(approx - ref);

/** Machine epsilon of binary64, u = 2⁻⁵³ is the unit roundoff (half of it). */
export const EPS = Number.EPSILON;
