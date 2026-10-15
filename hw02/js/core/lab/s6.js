/* lab/s6.js — S6, waiting times for vanity and look-alike addresses (note 07 §7).
   Each run searches for an address whose first k hex characters equal a random
   target, counting the tries. Every try hashes a fresh 64-byte input with
   Keccak-256 and keeps the last 20 bytes — the address step, with random bytes
   standing in for public keys (a uniform input gives the same law, and avoids
   one kG per try). Each try succeeds with p = 16^−k, so the count is
   Geometric(p): mean 16^k, median ≈ 16^k·ln 2. */

import { SeededRng } from '../../../../assets/js/core/rng.js';
import { keccak256 } from '../keccak.js';

/** Do the first k hex characters (nibbles) of `addr` equal those of `target`? */
function prefixMatches(addr, target, k) {
  for (let i = 0; i < k; i++) {
    const a = (addr[i >> 1] >> (i & 1 ? 0 : 4)) & 15, b = (target[i >> 1] >> (i & 1 ? 0 : 4)) & 15;
    if (a !== b) return false;
  }
  return true;
}

export async function run({ k = 3, runs = 300, seed = 1 }, progress = () => {}) {
  const rng = new SeededRng(seed);
  const tries = [];
  const input = rng.bytes(64);
  for (let r = 0; r < runs; r++) {
    const target = rng.bytes(20);
    let count = 0;
    for (;;) {
      count++;
      // a fresh input: a new 32-bit counter in the first four bytes of a random block
      const c = rng.u32();
      input[0] = c; input[1] = c >>> 8; input[2] = c >>> 16; input[3] = c >>> 24;
      if (prefixMatches(keccak256(input).subarray(12), target, k)) break;
    }
    tries.push(count);
    progress((r + 1) / runs);
  }
  return { tries };
}
