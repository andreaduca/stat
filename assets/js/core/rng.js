/* rng.js — a SEEDED pseudo-random generator for simulations, so that every
   experiment can be rerun exactly from its seed. NEVER for keys: anyone who
   knows the seed knows every output — that is the whole point here, and
   exactly what went wrong in the weak-wallet incidents (note 05, note 09).
   Keys come from crypto.getRandomValues (hw02/js/core/entropy.js).

   Generator: xoshiro128** (Blackman & Vigna, 2018), 128 bits of state,
   period 2¹²⁸ − 1, passes the standard statistical batteries. Seeded through
   splitmix32 so that nearby seeds (1, 2, 3…) give unrelated streams.
   [[Monte Carlo method]], [[Cryptographically secure randomness]]. */

const rotl = (x, k) => (x << k) | (x >>> (32 - k));

/** splitmix32: one well-mixed 32-bit value per call, used only for seeding. */
function splitmix32(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class SeededRng {
  /** @param {number} seed any 32-bit integer; shown next to every result */
  constructor(seed) {
    this.seed = seed >>> 0;
    const sm = splitmix32(this.seed);
    this.s = new Uint32Array([sm(), sm(), sm(), sm()]);
  }

  /** xoshiro128**: output = rotl(s1·5, 7)·9, then the linear state update. */
  u32() {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Uniform in [0, 1), with 32 bits of resolution. */
  float() { return this.u32() / 4294967296; }

  /** Uniform integer in [0, n), n ≤ 2³², without modulo bias: values from the
   *  incomplete last block of 2³² mod n are rejected and redrawn. */
  int(n) {
    const limit = 4294967296 - (4294967296 % n);
    let x;
    do { x = this.u32(); } while (x >= limit);
    return x % n;
  }

  /** n pseudo-random bytes. */
  bytes(n) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 4) {
      const x = this.u32();
      for (let j = 0; j < 4 && i + j < n; j++) out[i + j] = (x >>> (8 * j)) & 255;
    }
    return out;
  }
}
