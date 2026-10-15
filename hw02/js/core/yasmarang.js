/* yasmarang.js — a model of the generator that produced Coldcard seeds from
   2021 to 2026 (note 09). Category: KEY GENERATION — done wrong. Two copies of
   the small Yasmarang PRNG are XORed together; neither has real entropy:
     - MicroPython's fallback rng_get(), seeded once with
         pad = (first word of the chip's unique ID) XOR (SysTick timer value),
         n = RTC->TR, d = RTC->SSR  — both 0 on Mk2/Mk3, whose RTC never started;
     - libngu's own copy, starting from PUBLIC constants
         pad = 0x0a8ce26f, n = 69, d = 233, dat = 0.
   Eight 32-bit words are XORed pairwise, stored little-endian (ARM) as 32
   bytes, and hashed with SHA-256d into the 32 bytes of entropy behind 24 words.
   Simplified, as in note 09 §6: no earlier draws ("draw rank" 0), Mk2/Mk3
   only (no secure-element reseed). Every output looks perfectly random. */

import { sha256d } from './sha256.js';

/** Yasmarang, exactly as in the C source: 32-bit unsigned arithmetic, with
 *  `dat` an 8-bit variable (so it is truncated after every update).
 *    pad += dat + d·n;   pad = rotl(pad, 3);   n = pad | 2;
 *    d ^= (pad << 31) + (pad >> 1);   dat ^= (char)pad ^ (d >> 8) ^ 1;
 *    out = pad ^ (d << 5) ^ (pad >> 18) ^ (dat << 1)                       */
export class Yasmarang {
  constructor({ pad, n, d, dat = 0 }) {
    this.pad = pad >>> 0; this.n = n >>> 0; this.d = d >>> 0; this.dat = dat & 255;
  }

  next() {
    let pad = (this.pad + this.dat + Math.imul(this.d, this.n)) >>> 0;   // mod 2³²
    pad = ((pad << 3) | (pad >>> 29)) >>> 0;                              // rotate left by 3
    this.n = (pad | 2) >>> 0;
    this.d = (this.d ^ ((((pad << 31) >>> 0) + (pad >>> 1)) >>> 0)) >>> 0;
    this.dat = (this.dat ^ (pad & 255) ^ (this.d >>> 8) ^ 1) & 255;      // stored in a uint8_t
    this.pad = pad;
    return (pad ^ (this.d << 5) ^ (pad >>> 18) ^ (this.dat << 1)) >>> 0;
  }
}

/** libngu's copy starts from these public constants on every device. */
export const LIBNGU_START = Object.freeze({ pad: 0x0a8ce26f, n: 69, d: 233, dat: 0 });

/** The whole Mk2/Mk3 seed path for one starting value of MicroPython's pad
 *  (= UID word XOR timer). Returns the 32 raw bytes and the SHA-256d entropy. */
export function coldcardEntropy(pad0) {
  const micropython = new Yasmarang({ pad: pad0, n: 0, d: 0 });   // RTC registers read 0
  const libngu = new Yasmarang(LIBNGU_START);
  const raw = new Uint8Array(32);
  for (let w = 0; w < 8; w++) {
    const word = (micropython.next() ^ libngu.next()) >>> 0;     // "mixing" two deterministic streams
    for (let b = 0; b < 4; b++) raw[4 * w + b] = (word >>> (8 * b)) & 255;   // little-endian
  }
  return { raw, entropy: sha256d(raw) };
}
