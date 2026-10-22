/* toykey.js — the toy key every ECC-related page of hw03 shares: the range
   2^bits and the private key d, both kept in the URL and in the shared memory,
   so the attack page breaks the very key the Toy ECC page made. */

import { keygen, publicFrom } from '../core/elgamal.js';

export const DEFAULT_MSG = 'ATTACK AT DAWN';
export const BITS = { min: 8, max: 40, def: 20 };

export const clampBits = (v) => Math.min(BITS.max, Math.max(BITS.min, Number.parseInt(v, 10) || BITS.def));

/** {msg, bits, d, Q} from the page state; a missing or out-of-range d is
 *  replaced by a fresh one from the CSPRNG and written back. */
export function readKey(state, patch) {
  const msg = state.msg ?? DEFAULT_MSG;
  const bits = clampBits(state.bits);
  let d = null;
  try { d = state.d ? BigInt(state.d) : null; } catch { d = null; }
  if (d === null || d < 1n || d > 2n ** BigInt(bits)) {
    d = keygen(bits).d;
    patch({ d: String(d), bits });
  }
  return { msg, bits, d, Q: publicFrom(d) };
}
