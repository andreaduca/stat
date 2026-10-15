/* lamport.js — Lamport one-time signatures (1979) over an m-bit hash: the
   simplest signature built from a hash function alone, i.e. with no algebraic
   structure at all. [[Hash-based signatures]], note 06 §5.
     key     2m random secrets x[i][0], x[i][1]; public key = their hashes
     sign    for each bit i of H(message), reveal x[i][bit]
     verify  hash every revealed secret and compare with the public key
   Its fragility is STATE, not algebra: each signature reveals half the
   secrets, so after t signatures a forger knows, for each bit position, one or
   both secrets, and can sign any message whose hash bits are all covered:
   probability (1 − 2^−t)^m for a random message. */

import { sha256 } from './sha256.js';
import { utf8 } from './bytes.js';

/** The message hash, truncated to m bits (the "toy hash"), as an array of bits. */
export function hashBits(message, m) {
  const h = sha256(typeof message === 'string' ? utf8(message) : message);
  return Array.from({ length: m }, (_, i) => (h[i >> 3] >> (7 - (i & 7))) & 1);
}

/** @param {(n: number) => Uint8Array} randomBytes  the secrets' source */
export function keygen(m, randomBytes) {
  const secret = Array.from({ length: m }, () => [randomBytes(32), randomBytes(32)]);
  const pub = secret.map(([s0, s1]) => [sha256(s0), sha256(s1)]);
  return { m, secret, pub };
}

export const sign = (key, message) => hashBits(message, key.m).map((bit, i) => key.secret[i][bit]);

export function verify(pub, message, signature) {
  const bits = hashBits(message, pub.length);
  return bits.every((bit, i) => {
    const h = sha256(signature[i]), p = pub[i][bit];
    return h.every((byte, j) => byte === p[j]);
  });
}
