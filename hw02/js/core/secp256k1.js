/* secp256k1.js — the curve y² = x³ + 7 over F_p with the SEC 2 parameters,
   and Q = kG at full size. Same group law as hw01's toy curves (whose Point,
   𝒪 and field code are reused), but in Jacobian coordinates so that a 256-bit
   multiplication needs one inversion instead of hundreds. Category:
   public-key cryptography. Note 04 §1, HMWK 1 notes 03–05,
   [[Digital signatures and ECDSA]], [[Discrete logarithm problem]].

   The parameters (SEC 2, §2.4.1):
     p = 2²⁵⁶ − 2³² − 977         the field: arithmetic mod a 78-digit prime
     y² = x³ + 7                  a = 0, b = 7 — hw01's curve C1, mod p instead of 17
     G = (Gx, Gy)                 the fixed base point everyone uses
     n ≈ 2²⁵⁶ − 4.3·10³⁸          the order of G, a prime; the cofactor is 1,
                                  so every point except 𝒪 generates the group
   A private key is a number 1 ≤ k < n; the public key is the point Q = kG.
   Forward costs ~256 doublings + ~128 additions; backward (the ECDLP) costs
   about √n ≈ 2¹²⁸ group operations with the best known generic attack.

   Why Jacobian coordinates: hw01's affine formulas divide (λ = Δy/Δx), and a
   division mod a 256-bit prime is an extended-Euclid inversion, ~100× a
   multiplication. Writing a point as (X, Y, Z) meaning (X/Z², Y/Z³) moves all
   the divisions into Z; the one inversion happens at the end, in toAffine.

   EDUCATIONAL: not constant-time. The loop in mul() branches on the bits of
   k, so its timing depends on the key — a side channel. Real wallets use
   libsecp256k1, which avoids every secret-dependent branch and memory access. */

import { PrimeField } from '../../../assets/js/core/field.js';
import { Point, INFINITY } from '../../../assets/js/core/curve.js';

export const P = 2n ** 256n - 2n ** 32n - 977n;
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;   // order of G, prime
export const B = 7n;
export const G = new Point(
  0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
);

const F = new PrimeField(P);
const mod = (a) => { const r = a % P; return r < 0n ? r + P : r; };

export const isOnCurve = (pt) => pt.isInfinity || mod(pt.y * pt.y) === mod(pt.x * pt.x * pt.x + B);

/* ---- Jacobian coordinates: (X, Y, Z) stands for (X/Z², Y/Z³); Z = 0 is 𝒪 ---- */

const J_INF = { X: 1n, Y: 1n, Z: 0n };
const toJ = (pt) => (pt.isInfinity ? J_INF : { X: pt.x, Y: pt.y, Z: 1n });

function toAffine({ X, Y, Z }) {
  if (Z === 0n) return INFINITY;
  const zi = F.inv(Z);                       // the single inversion
  const zi2 = mod(zi * zi);
  return new Point(mod(X * zi2), mod(Y * zi2 * zi));
}

/** 2P: the tangent rule with a = 0, rewritten without division
 *  (formulas "dbl-2009-l" of the Explicit-Formulas Database):
 *    A = X², B = Y², C = B², D = 2((X + B)² − A − C), E = 3A, F = E²
 *    X₃ = F − 2D,  Y₃ = E(D − X₃) − 8C,  Z₃ = 2YZ
 *  Y = 0 means a vertical tangent, so 2P = 𝒪 (cannot happen on secp256k1,
 *  whose order is odd, but the group law demands the case). */
function jDouble({ X, Y, Z }) {
  if (Z === 0n || Y === 0n) return J_INF;
  const A = mod(X * X), Bq = mod(Y * Y), C = mod(Bq * Bq);
  const D = mod(2n * (mod((X + Bq) * (X + Bq)) - A - C));
  const E = mod(3n * A), Fq = mod(E * E);
  const X3 = mod(Fq - 2n * D);
  return { X: X3, Y: mod(E * (D - X3) - 8n * C), Z: mod(2n * Y * Z) };
}

/** P + Q: the chord rule, rewritten without division.
 *  Bring both points to a common denominator:
 *    U₁ = X₁Z₂², U₂ = X₂Z₁²  (the x's)      S₁ = Y₁Z₂³, S₂ = Y₂Z₁³  (the y's)
 *    H = U₂ − U₁ (the "Δx"),  R = S₂ − S₁ (the "Δy"), so λ = R / (H·Z₁Z₂)
 *    X₃ = R² − H³ − 2U₁H²,  Y₃ = R(U₁H² − X₃) − S₁H³,  Z₃ = H·Z₁·Z₂
 *  H = 0 means equal x: the same point (double it) or P + (−P) = 𝒪. */
function jAdd(p, q) {
  if (p.Z === 0n) return q;
  if (q.Z === 0n) return p;
  const z1 = mod(p.Z * p.Z), z2 = mod(q.Z * q.Z);
  const u1 = mod(p.X * z2), u2 = mod(q.X * z1);
  const s1 = mod(p.Y * z2 * q.Z), s2 = mod(q.Y * z1 * p.Z);
  const H = mod(u2 - u1), R = mod(s2 - s1);
  if (H === 0n) return R === 0n ? jDouble(p) : J_INF;   // same point, or P + (−P) = 𝒪
  const H2 = mod(H * H), H3 = mod(H2 * H), u1H2 = mod(u1 * H2);
  const X3 = mod(R * R - H3 - 2n * u1H2);
  return { X: X3, Y: mod(R * (u1H2 - X3) - s1 * H3), Z: mod(H * p.Z * q.Z) };
}

/** P + Q for affine points (𝒪 allowed). */
export const add = (a, b) => toAffine(jAdd(toJ(a), toJ(b)));

export const neg = (pt) => (pt.isInfinity ? pt : new Point(pt.x, mod(-pt.y)));

/** kP by double-and-add, left to right over the bits of k (as in hw01):
 *  for each bit, double the running point; if the bit is 1, also add P.
 *  Reading k = 6 = 110₂: 𝒪 → P → 2P + P = 3P → 6P. */
export function mul(k, pt) {
  k = ((k % N) + N) % N;
  if (k === 0n || pt.isInfinity) return INFINITY;
  const base = toJ(pt);
  let R = J_INF;
  for (const bit of k.toString(2)) {
    R = jDouble(R);
    if (bit === '1') R = jAdd(R, base);
  }
  return toAffine(R);
}

/* Fixed-base speed-up for kG. Write k in hex, k = Σ dᵢ·16ⁱ (64 digits dᵢ).
   Then kG = Σ dᵢ·(16ⁱG), and every dᵢ·16ⁱG can be precomputed once:
   TABLE[i][j] = j·16ⁱ·G (64 rows × 16 points). kG is then one table lookup
   per hex digit and at most 64 additions, no doublings — about 5× faster,
   which is what makes the statistics lab's thousands of keys affordable.
   Only a speed-up: the result is the same point mul(k, G) gives. */
let TABLE = null;
function table() {
  if (TABLE) return TABLE;
  TABLE = [];
  let base = toJ(G);
  for (let i = 0; i < 64; i++) {
    const row = [J_INF];
    for (let j = 1; j < 16; j++) row.push(jAdd(row[j - 1], base));
    TABLE.push(row.map((q) => toJ(toAffine(q))));            // affine rows: Z = 1 makes additions cheaper
    base = jAdd(row[15], base);                               // 16^(i+1)·G
  }
  return TABLE;
}

export function mulG(k) {
  k = ((k % N) + N) % N;
  const T = table();
  let R = J_INF;
  const hex = k.toString(16).padStart(64, '0');
  for (let i = 0; i < 64; i++) {
    const digit = parseInt(hex[63 - i], 16);
    if (digit) R = jAdd(R, T[i][digit]);
  }
  return toAffine(R);
}

/** The public key Q = kG. A private key must satisfy 1 ≤ k < n. */
export function publicKey(k) {
  if (k <= 0n || k >= N) throw new RangeError('a private key must lie in [1, n − 1]');
  return mulG(k);
}

const hex32 = (n) => n.toString(16).padStart(64, '0');

/** SEC 1 encodings, as hex: 04‖x‖y (65 bytes), 02/03‖x (33 bytes; prefix = parity of y). */
export const uncompressedHex = (Q) => '04' + hex32(Q.x) + hex32(Q.y);
export const compressedHex = (Q) => (Q.y & 1n ? '03' : '02') + hex32(Q.x);
/** Ethereum's input to the address hash: x‖y, 64 bytes, no prefix. */
export const ethereumHex = (Q) => hex32(Q.x) + hex32(Q.y);

/** Recover y from a compressed key. p ≡ 3 (mod 4), so √a = a^((p+1)/4). */
export function decompress(hex) {
  const x = BigInt('0x' + hex.slice(2));
  let y = F.pow(mod(x * x * x + B), (P + 1n) / 4n);
  if ((y & 1n) !== BigInt(hex.slice(0, 2) === '03')) y = mod(-y);
  const pt = new Point(x, y);
  if (!isOnCurve(pt)) throw new Error('x is not on the curve');
  return pt;
}
