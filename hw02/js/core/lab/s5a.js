/* lab/s5a.js — S5(a), weak entropy is invisible (note 07 §5). Keys come from
   a b-bit seed, k = SHA-256(seed) mod (n − 1) + 1 — a scaled-down Profanity /
   Milk Sad / Trust Wallet bug — and their addresses get the same battery of
   tests as S3. They pass: the tests see the output distribution, not the
   2^b-element input space an attacker would enumerate (S5b). */

import { SeededRng } from '../../../../assets/js/core/rng.js';
import { bytesToBigInt, hexToBytes, ser32 } from '../bytes.js';
import { sha256 } from '../sha256.js';
import { N, mulG, ethereumHex } from '../secp256k1.js';
import { keccak256 } from '../keccak.js';
import { addressTests } from './common.js';

/** The weak generator: a b-bit seed stretched by SHA-256 into a key. */
export const weakKey = (s) => (bytesToBigInt(sha256(ser32(s))) % (N - 1n)) + 1n;
export const weakAddress = (s) => keccak256(hexToBytes(ethereumHex(mulG(weakKey(s))))).slice(12);

export async function run({ bits = 16, n = 4000, seed = 1 }, progress = () => {}) {
  const rng = new SeededRng(seed);
  const addresses = [], seeds = new Set();
  for (let i = 0; i < n; i++) {
    const s = rng.int(2 ** bits);
    seeds.add(s);
    addresses.push(weakAddress(s));
    if (i % 100 === 99) progress((i + 1) / n);
  }
  return { tests: addressTests(addresses), distinctSeeds: seeds.size, space: 2 ** bits };
}
