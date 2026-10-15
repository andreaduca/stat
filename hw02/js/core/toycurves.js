/* toycurves.js — small elliptic curves on which the structure of k ↦ kP can
   be seen whole: every point, every multiple, the whole 2-D Fourier spectrum.
   Built on the shared group law (assets/js/core/curve.js) used by hw01.
   Note 06 §3. */

import { PrimeField } from '../../../assets/js/core/field.js';
import { EllipticCurve, Point } from '../../../assets/js/core/curve.js';

const make = (p, a, b, name) => new EllipticCurve(new PrimeField(p), a, b, name);

/** The curves of note 06. Both have a PRIME number of points, so every point
 *  other than 𝒪 generates the whole group and k is defined mod n. */
export const TOY_CURVES = {
  C0: { curve: make(17n, 2n, 2n, 'C0'), P: new Point(5n, 1n), n: 19, k: 13, label: 'C0 · y² = x³ + 2x + 2 over F₁₇, n = 19' },
  C5: { curve: make(163n, 0n, 7n, 'C5'), P: new Point(2n, 34n), n: 139, k: 100, label: 'C5 · y² = x³ + 7 over F₁₆₃, n = 139' },
};

/** A WEAK curve, kept only to be named: y² = x³ + 7 over F₁₂₇ has exactly 127
 *  points — as many as the field has elements. Such "anomalous" curves fall to
 *  Smart's attack (1999), which solves the discrete logarithm in polynomial
 *  time by lifting the curve to the p-adic numbers. Same equation as
 *  secp256k1; it is the size and the point count that make a curve safe. */
export const ANOMALOUS = make(127n, 0n, 7n, 'anomalous');
