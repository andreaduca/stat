/* ecdsa.js — ECDSA on secp256k1, kept small so that its ALGEBRA is visible:
   signing is one linear equation in the private key d, and that is exactly
   why a repeated (or related) nonce gives d away. Category: public-key
   cryptography. [[Digital signatures and ECDSA]], note 06 §5.
   EDUCATIONAL: the nonce is chosen by the caller (real wallets derive it
   deterministically, RFC 6979), nothing is constant-time, and the message
   hash is a plain Keccak-256 of the text — not an Ethereum transaction. */

import { PrimeField } from '../../../assets/js/core/field.js';
import { bytesToBigInt, utf8 } from './bytes.js';
import { keccak256 } from './keccak.js';
import { N, mulG, mul, add } from './secp256k1.js';

const Fn = new PrimeField(N);          // arithmetic mod the group order n (a prime)

/** z = Keccak-256(message) read as a number mod n. */
export const messageHash = (text) => Fn.mod(bytesToBigInt(keccak256(utf8(text))));

/** Sign:  R = kG,  r = R.x mod n,  s = k⁻¹ (z + r·d) mod n.
 *  The secret d enters LINEARLY: s·k = z + r·d. */
export function sign(z, d, k) {
  const r = Fn.mod(mulG(k).x);
  const s = Fn.mul(Fn.inv(k), Fn.add(z, Fn.mul(r, d)));
  if (r === 0n || s === 0n) throw new Error('degenerate signature: choose another nonce');
  return { r, s };
}

/** Verify with the public key Q = dG:  w = s⁻¹,  X = (z·w)G + (r·w)Q,  valid ⇔ X.x ≡ r.
 *  Works because (z·w)G + (r·w)dG = s⁻¹(z + r·d)G = kG = R. */
export function verify(z, Q, { r, s }) {
  if (r <= 0n || r >= N || s <= 0n || s >= N) return false;
  const w = Fn.inv(s);
  const X = add(mulG(Fn.mul(z, w)), mul(Fn.mul(r, w), Q));
  return !X.isInfinity && Fn.mod(X.x) === r;
}

/** Nonce reuse: the same k for two messages gives the same r and
 *    s₁k = z₁ + r·d,   s₂k = z₂ + r·d.
 *  Subtracting removes d:  k = (z₁ − z₂) / (s₁ − s₂);  then d = (s₁k − z₁) / r. */
export function recoverFromReusedNonce(z1, sig1, z2, sig2) {
  const k = Fn.mul(Fn.sub(z1, z2), Fn.inv(Fn.sub(sig1.s, sig2.s)));
  const d = Fn.mul(Fn.sub(Fn.mul(sig1.s, k), z1), Fn.inv(sig1.r));
  return { k, d };
}

/** Related nonces k and k + δ (δ known): different r, but still two linear equations
 *    s₁k = z₁ + r₁d,   s₂(k + δ) = z₂ + r₂d.
 *  From the first, k = (z₁ + r₁d)/s₁; substituting:
 *    d = (z₂ − s₂δ − s₂z₁/s₁) / (s₂r₁/s₁ − r₂). */
export function recoverFromRelatedNonces(z1, sig1, z2, sig2, delta = 1n) {
  const q = Fn.mul(sig2.s, Fn.inv(sig1.s));                       // s₂ / s₁
  const num = Fn.sub(Fn.sub(z2, Fn.mul(sig2.s, delta)), Fn.mul(q, z1));
  const den = Fn.sub(Fn.mul(q, sig1.r), sig2.r);
  const d = Fn.mul(num, Fn.inv(den));
  const k = Fn.mul(Fn.add(z1, Fn.mul(sig1.r, d)), Fn.inv(sig1.s));
  return { k, d };
}
