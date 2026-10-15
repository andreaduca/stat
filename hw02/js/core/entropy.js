/* entropy.js — the only step of the pipeline that creates secrecy: KEY
   GENERATION. Everything after it is deterministic and cannot add entropy,
   H(f(X)) ≤ H(X). Two honest sources are offered here; the seeded PRNG used
   by the simulations (assets/js/core/rng.js) is deliberately NOT one of them.
   Note 01 §1, [[Cryptographically secure randomness]], [[Shannon entropy]]. */

import { utf8 } from './bytes.js';
import { sha256 } from './sha256.js';

/** The test vector: all-zero entropy. 16 bytes give "abandon ×11 about",
 *  32 bytes give "abandon ×23 art". Public: never a real wallet. */
export const testEntropy = (bytes) => new Uint8Array(bytes);

/** CSPRNG: the operating system's generator through crypto.getRandomValues. */
export function randomEntropy(bytes) {
  return globalThis.crypto.getRandomValues(new Uint8Array(bytes));
}

/** Entropy carried by n fair dice rolls: n·log₂6 ≈ 2.585n bits.
 *  50 rolls ≈ 129 bits (enough for 12 words), 99 rolls ≈ 256 bits (24 words). */
export const diceBits = (rolls) => rolls * Math.log2(6);

/** Rolls needed for a given number of bits: ⌈bits / log₂6⌉. */
export const rollsFor = (bits) => Math.ceil(bits / Math.log2(6));

/** Dice → entropy, as hardware wallets do it (Coldcard among them): hash the
 *  string of digits with SHA-256 and keep the first 16 or 32 bytes. The hash
 *  spreads the ≈2.585 bits per roll evenly over the output; it cannot add any.
 *  Only digits 1–6 are kept. */
export function diceEntropy(rolls, bytes) {
  const digits = String(rolls).replace(/[^1-6]/g, '');
  return { digits, entropy: sha256(utf8(digits)).slice(0, bytes) };
}
