/* lab/s11.js — S11, smooth numbers (note 06 §6). Index calculus — the attack
   that makes RSA and finite-field Diffie–Hellman need 3072-bit numbers —
   needs many integers that factor completely over small primes ("B-smooth").
   For a random x the chance is about Dickman's ρ(u), u = ln x / ln B.
   Elliptic-curve points have no notion of "factoring into small points",
   which is why curves can use 256-bit numbers. Here: draw random b-bit
   integers, test B-smoothness by trial division, compare with ρ. */

import { SeededRng } from '../../../../assets/js/core/rng.js';

const primesUpTo = (B) => {
  const sieve = new Uint8Array(B + 1), out = [];
  for (let i = 2; i <= B; i++) if (!sieve[i]) { out.push(i); for (let j = i * i; j <= B; j += i) sieve[j] = 1; }
  return out;
};

/** Divide out every prime ≤ B; smooth iff nothing is left. */
function isSmooth(x, primes) {
  for (const p of primes) { while (x % p === 0) x /= p; if (x === 1) return true; }
  return x === 1;
}

export async function run({ n = 4000, B = 1000, seed = 1 }, progress = () => {}) {
  const rng = new SeededRng(seed);
  const primes = primesUpTo(B);
  const rows = [];
  const sizes = [20, 25, 30, 35, 40, 45, 50];
  sizes.forEach((bits, s) => {
    let smooth = 0;
    for (let i = 0; i < n; i++) {
      // uniform b-bit integer in [2^(b−1), 2^b), built exactly from two 32-bit draws (b ≤ 53)
      const low = bits - 1;
      const r = low > 32 ? (rng.u32() % 2 ** (low - 32)) * 4294967296 + rng.u32() : rng.u32() % 2 ** low;
      const x = 2 ** low + r;
      if (isSmooth(x, primes)) smooth++;
    }
    rows.push({ bits, n, smooth });
    progress((s + 1) / sizes.length);
  });
  return { rows, B };
}
