/* lab/s5b.js — S5(b), the same weak generator attacked: pick a victim seed,
   publish only its address, then enumerate seeds 0, 1, 2, … until one gives
   that address. Expected cost: half the 2^b seeds; each candidate is one
   SHA-256, one kG and one Keccak. The extrapolation to 32 bits is the real
   Profanity / Milk Sad case. */

import { SeededRng } from '../../../../assets/js/core/rng.js';
import { bytesToHex } from '../bytes.js';
import { weakAddress } from './s5a.js';

export async function run({ bits = 16, seed = 1 }, progress = () => {}) {
  const rng = new SeededRng(seed);
  const space = 2 ** bits;
  const victim = rng.int(space);
  const target = bytesToHex(weakAddress(victim));
  const t0 = performance.now();
  let found = null, tried = 0;
  for (let s = 0; s < space; s++) {
    tried++;
    if (bytesToHex(weakAddress(s)) === target) { found = s; break; }
    if (s % 256 === 255) progress(s / space);
  }
  const ms = performance.now() - t0;
  return { victim, target, found, tried, space, ms, rate: tried / (ms / 1000) };
}
