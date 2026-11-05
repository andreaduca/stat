/* variance-algos.js — three ways to compute the same sample variance, run in
   a chosen floating-point precision, and the exact answer to judge them by:
   the naive one-pass formula (Σx² − (Σx)²/n), the two-pass formula (mean
   first, then Σ(x − x̄)²) and Welford's recurrence; plus exact rational
   arithmetic on the stored doubles (BigInt) and the condition number K.
   This is the evidence of Ex. 1's "why bother" (stability).
   Pure, no DOM. HW5 note 01 §4; [[Floating-point cancellation]];
   [[Sampling statistics - examples, traps and limitations]] E3–E4. */

/** Precision of every arithmetic operation: binary64 (a JS number, a C double)
 *  does nothing; binary32 (a C float) rounds each result to the nearest float
 *  with Math.fround — the round-to-nearest of IEEE 754 applied after EVERY
 *  operation, which is what a float computation does (note: [[Floating-point
 *  cancellation]], "standard model", u = 2⁻²⁴ instead of 2⁻⁵³). */
export const PRECISION = {
  binary64: (x) => x,
  binary32: Math.fround,
};

/** The data as the given precision would store them (each value rounded once).
 *  The exact reference must be computed on THESE values, not on the decimal
 *  ones typed or drawn: the algorithms never see anything else. */
export const storeAs = (xs, round) => Float64Array.from(xs, (x) => round(x));

/** Naive one-pass variance: (Σx² − (Σx)²/n)/(n − 1).
 *  Category: algorithm (the "computational formula", [[Sum of squares and sample variance]] Corollary 1).
 *  Mathematically right, numerically dangerous: Σx² and (Σx)²/n are both about
 *  n(x̄² + σ²) while their difference is about nσ², so when the mean is large
 *  compared with the spread they agree in almost every digit and the
 *  subtraction keeps only the rounding errors. Relative error ~ n·u·K²
 *  (Chan–Golub–LeVeque), and the result can even be NEGATIVE:
 *  10⁹ + {4, 7, 13, 16} gives −170.67 instead of 30 in binary64.
 *  Order of operations fixed (draft §8.1): accumulate in the given order,
 *  divide the square of the sum by n, subtract, divide by n − 1. */
export function naiveVariance(xs, round = PRECISION.binary64) {
  const n = xs.length;
  let s = 0, q = 0;
  for (let i = 0; i < n; i++) {
    s = round(s + xs[i]);
    q = round(q + round(xs[i] * xs[i]));
  }
  return round(round(q - round(round(s * s) / n)) / (n - 1));
}

/** Two-pass variance: x̄ = Σx/n, then Σ(x − x̄)²/(n − 1).
 *  Category: algorithm. Subtracting the mean BEFORE squaring removes the large
 *  common part, so nothing cancels: relative error ~ n·u + n²u²K², the most
 *  accurate of the three. Its price: the data must be read twice (stored, or
 *  re-read from disk), impossible on a stream that never ends. */
export function twoPassVariance(xs, round = PRECISION.binary64) {
  const n = xs.length;
  let s = 0;
  for (let i = 0; i < n; i++) s = round(s + xs[i]);
  const mean = round(s / n);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = round(xs[i] - mean);
    ss = round(ss + round(d * d));
  }
  return round(ss / (n - 1));
}

/** Welford's one-pass variance, every operation rounded to the precision.
 *  Category: algorithm (the same three statements as RunningStats.push).
 *  It subtracts the RUNNING mean before multiplying, so it gets most of the
 *  two-pass benefit in one pass: relative error ~ n·u·K. And S only ever grows
 *  by d·(x − M) = (k−1)/k·d² ≥ 0, so it can never go negative. */
export function welfordVariance(xs, round = PRECISION.binary64) {
  let mean = 0, ss = 0;
  for (let k = 1; k <= xs.length; k++) {
    const x = xs[k - 1];
    const d = round(x - mean);
    mean = round(mean + round(d / k));
    ss = round(ss + round(d * round(x - mean)));
  }
  return round(ss / (xs.length - 1));
}

/* ---------- the exact answer ---------- */

const MANT = (1n << 52n) - 1n;

/* A finite double as an exact integer times a power of two: x = m·2ᵉ
   (m a signed BigInt). Read straight from the 64 bits of the IEEE encoding. */
function decompose(x) {
  if (x === 0) return { m: 0n, e: 0 };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const sign = bits >> 63n ? -1n : 1n;
  const expBits = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & MANT;
  return expBits === 0
    ? { m: sign * frac, e: -1074 }                              // subnormal
    : { m: sign * (frac | (1n << 52n)), e: expBits - 1075 };    // normal: implicit leading 1
}

/* x·2ᵏ without overflowing the intermediate power of two. */
function ldexp(x, k) {
  while (k > 1000) { x *= 2 ** 1000; k -= 1000; }
  while (k < -1000) { x *= 2 ** -1000; k += 1000; }
  return x * 2 ** k;
}

const bitLength = (v) => (v < 0n ? -v : v).toString(2).length;

/** The sample variance of the stored doubles, computed exactly and rounded once.
 *  Category: exact formula (the reference for the stability plots).
 *  Every double is an integer times a power of two, so after rescaling to the
 *  smallest exponent E all values are integers Xᵢ and
 *    s² = (n·ΣXᵢ² − (ΣXᵢ)²) / (n(n − 1)) · 2^{2E}
 *  is a ratio of exact integers (BigInt). The division keeps ≥ 80 extra bits
 *  before the final conversion, so the result is the correctly rounded double
 *  (up to a tie, which does not happen with these data). */
export function exactVariance(xs) {
  const n = xs.length;
  if (n < 2) return NaN;
  const parts = Array.from(xs, decompose);
  const E = Math.min(...parts.filter((p) => p.m !== 0n).map((p) => p.e), 0);
  let sum = 0n, sq = 0n;
  for (const { m, e } of parts) {
    const X = m << BigInt(e - E);
    sum += X; sq += X * X;
  }
  const N = BigInt(n) * sq - sum * sum, D = BigInt(n) * BigInt(n - 1);
  if (N === 0n) return 0;
  const shift = Math.max(0, 80 - (bitLength(N) - bitLength(D)));
  const q = (N << BigInt(shift)) / D;
  return ldexp(Number(q), 2 * E - shift);
}

/** Condition number of the sample variance, K = √(1 + n·x̄²/SS).
 *  Category: exact formula (Chan, Golub & LeVeque 1983). It measures how much
 *  the data's offset (mean) dwarfs their spread: K ≈ |x̄|/s·√(n/(n−1)) when the
 *  mean is large. The algorithms' errors grow like u·K² (naive), u·K (Welford),
 *  u (two-pass). Computed from the two-pass mean and SS in binary64. */
export function conditionNumber(xs) {
  const n = xs.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += xs[i];
  const mean = s / n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (xs[i] - mean) ** 2;
  return Math.sqrt(1 + (n * mean * mean) / ss);
}

/** |computed − exact| / |exact|; Infinity when the exact value is 0 and the computed is not. */
export const relativeError = (got, exact) => (exact === 0 ? (got === 0 ? 0 : Infinity) : Math.abs(got - exact) / Math.abs(exact));
