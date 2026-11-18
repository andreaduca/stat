/* generators.js — dataset D1: four generators of symbols in {0 … k−1} and the
   serial-pair tables built from their outputs. The weak generators are reproduced
   deliberately, for teaching, and are labelled as such everywhere.
   - good:    xoshiro128** (seeded; assets/js/core/rng.js), the top log₂k bits;
   - lcgLow:  the low log₂k bits of x_{n+1} = (1664525 x_n + 1013904223) mod 2³²;
   - lcgHigh: the top log₂k bits of the same LCG;
   - sticky:  with probability ε repeat the previous symbol, else a fresh uniform one.
   [[Randomness testing by independence]], [[Power of the chi-square test]]. Pure, no DOM. */

import { SeededRng } from '../../../assets/js/core/rng.js';
import { ContingencyTable } from './table.js';

export const GENERATORS = {
  good: 'xoshiro128** (good)',
  lcgLow: 'LCG, low bits',
  lcgHigh: 'LCG, high bits',
  sticky: 'sticky (ε)',
};

/** The LCG of Numerical Recipes, a = 1664525, c = 1013904223, m = 2³².
 *  Category: simulation (a deliberately weak generator). uint32 arithmetic: Math.imul gives
 *  the low 32 bits of a·x exactly (a plain JS product would lose bits above 2⁵³).
 *  Seed 12345 gives x₁ = 87628868. */
export function lcg(seed) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x; };
}

/**
 * A source of symbols in {0 … k−1}, k a power of two (2, 4, 8, 16).
 * Category: simulation.
 * Why the LCG's low bits fail: reduction mod 2^j is a ring homomorphism, so the low j bits
 * obey their own LCG y_{n+1} = (a y_n + c) mod 2^j (Lemma 1): period at most 2^j, and each
 * symbol is a function of the previous one. The high bits mix in carries from every lower
 * bit and pass the serial test, yet stay predictable from a few outputs.
 * @param {'good'|'lcgLow'|'lcgHigh'|'sticky'} kind
 * @param {{seed: number, k: number, eps?: number}} o
 * @returns {() => number}
 */
export function source(kind, { seed, k, eps = 0.05 }) {
  const bits = Math.log2(k), shift = 32 - bits;
  if (!Number.isInteger(bits) || bits < 1 || bits > 8) throw new Error('k must be a power of two between 2 and 256');
  if (kind === 'lcgLow') { const g = lcg(seed); return () => g() & (k - 1); }
  if (kind === 'lcgHigh') { const g = lcg(seed); return () => g() >>> shift; }
  const rng = new SeededRng(seed);
  if (kind === 'good') return () => rng.u32() >>> shift;
  if (kind === 'sticky') {
    let prev = rng.u32() >>> shift;   // the symbol before the first one, so the first may repeat too
    return () => { if (rng.float() >= eps) prev = rng.u32() >>> shift; return prev; };
  }
  throw new Error(`unknown generator ${kind}`);
}

const labels = (k) => Array.from({ length: k }, (_, i) => String(i));

/**
 * The serial test's table: N non-overlapping pairs (s₁, s₂), (s₃, s₄), … counted in a k × k table.
 * Category: table. Non-overlapping, so the N pairs are independent draws and the counts are
 * multinomial. (Overlapping pairs (s₁, s₂), (s₂, s₃), … would serve as well for this test of
 * independence, whose margins are estimated from the table: measured mean 224.6, SD 21.1 against
 * 225.1, 21.0 at k = 16 — the Markov-chain test of Anderson & Goodman 1957 📌. Good's 1953
 * warning concerns the goodness-of-fit serial statistic with fixed expected counts N/k².)
 */
export function serialTable(next, N, k) {
  const t = new ContingencyTable(labels(k), labels(k));
  for (let n = 0; n < N; n++) { const a = next(); t.add(a, next()); }
  return t;
}

/** Population effect of the sticky generator: w² = ε²(k − 1) ([[Power of the chi-square test]], Lemma). */
export const stickyW = (eps, k) => eps * Math.sqrt(k - 1);
