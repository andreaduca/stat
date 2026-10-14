/* curves.js — the curves offered by the pages, plus the validation of a
   custom (p, a, b) and the reading of a curve out of the URL query string.
   The four presets are the ones named in the homework specification. */

import { PrimeField, isPrime } from './field.js';
import { EllipticCurve, Point } from './curve.js';

export const MAX_P = 5000n;   // enumeration limit: every point is listed in the browser

export const PRESETS = [
  {
    id: 'C0', label: 'C0 · worked example',
    p: 17n, a: 2n, b: 2n, base: { x: 5n, y: 1n },
    note: '#E = 19, a prime, so every point except 𝒪 generates the whole group. Handy for checking results by hand.',
  },
  {
    id: 'C1', label: 'C1 · the homework curve',
    p: 17n, a: 0n, b: 7n, base: { x: 1n, y: 5n },
    note: 'The curve of the assignment. Its equation is exactly secp256k1\'s — the curve Bitcoin and Ethereum sign with — but taken modulo 17 rather than a 78-digit prime, which leaves 18 points instead of about 10⁷⁷.',
  },
  {
    id: 'C2', label: 'C2 · mini-secp256k1',
    p: 1051n, a: 0n, b: 7n, base: { x: 3n, y: 385n },
    note: 'Prime number of points and cofactor 1 — the two structural properties that make secp256k1 safe to use, at a size you can still enumerate. Large enough that the outputs start to look shapeless.',
  },
  {
    id: 'C3', label: 'C3 · non-cyclic',
    p: 1009n, a: 0n, b: 7n, base: { x: 1n, y: 131n },
    note: '#E = 1029 = 3·7³, but no point reaches it: the largest order is 147. A group can be commutative without being cyclic.',
  },
];

/** Look up a curve by id among the presets and any extra ones supplied
 *  (the reader's saved curves — see js/pages/saved-curves.js). */
const presetById = (id, extra = []) => [...PRESETS, ...extra].find((c) => c.id === id);

export function buildCurve(spec) {
  return new EllipticCurve(new PrimeField(spec.p), spec.a, spec.b, spec.label ?? 'custom');
}

/** Why a (p, a, b) may be refused — phrased so the refusal teaches something.
 *  @returns {string|null} null when the curve is usable */
export function check(spec) {
  const { p, a, b } = spec;
  if (!p || p < 5n) return 'p must be a prime greater than 3: the formulas for λ divide by 2y and assume characteristic above 3.';
  if (p > MAX_P) return `p must be at most ${MAX_P}, because these pages enumerate every point of the curve in the browser.`;
  if (!isPrime(p)) return `${p} is not prime. With a composite modulus some non-zero numbers have no inverse, λ cannot always be computed, and the points stop forming a group.`;
  const curve = buildCurve({ p, a, b });
  if (!curve.isNonSingular()) return `4a³ + 27b² = 0 mod ${p}: the curve is singular. It has a cusp or crosses itself, the tangent there is undefined, and the group law breaks down.`;
  return null;
}

const toBig = (value) => {
  try { return BigInt(String(value).trim()); } catch { return null; }
};

/** Build the curve and base point described by the query string.
 *  Accepts ?curve=<id> for a preset or a saved curve, or ?p=&a=&b= for one that
 *  has not been saved, with an optional base point ?gx=&gy=. A named curve wins;
 *  p, a and b are the fallback, which is what makes a link to a saved curve still
 *  work in a browser that has never seen it. Returns {error} instead of throwing. */
export function curveFromParams(params = {}, extra = [], fallbackId = 'C1') {
  let spec = params.curve ? presetById(params.curve, extra) : null;
  if (!spec && params.p !== undefined) {
    const p = toBig(params.p), a = toBig(params.a ?? 0), b = toBig(params.b ?? 0);
    if (p === null || a === null || b === null) return { error: 'p, a and b must be whole numbers.', presetId: 'custom' };
    spec = { id: 'custom', label: 'custom curve', p, a, b };
  }
  if (!spec) spec = presetById(fallbackId);

  const error = check(spec);
  if (error) return { error, presetId: spec.id, spec };

  const curve = buildCurve(spec);
  let base = spec.base ? new Point(spec.base.x, spec.base.y) : null;

  const gx = toBig(params.gx ?? ''), gy = toBig(params.gy ?? '');
  if (gx !== null && gy !== null) {
    const picked = new Point(curve.F.mod(gx), curve.F.mod(gy));
    if (curve.contains(picked)) base = picked;
  }
  if (!base || !curve.contains(base)) base = curve.points()[0] ?? null;

  return { curve, base, presetId: spec.id, spec };
}
