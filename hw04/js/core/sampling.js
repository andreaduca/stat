/* sampling.js — turning the 32-bit words of the seeded generator into the
   random quantities the simulation needs: counts of 1-bits (32 fair steps at
   once) and geometric gaps (skip straight to the next success). The normal,
   Gamma and Beta draws (each heterogeneous attacker's own skill) are in the
   shared assets/js/core/samplers.js since hw05 needed them too.
   Every function takes the generator as an argument: nothing here is global,
   so a run is fully determined by its seed. Pure, no DOM.
   HMWK4 note 03 §3; [[Monte Carlo estimation]] (requirements on the random numbers). */

/** Number of 1-bits in a 32-bit word (SWAR popcount: add bits in pairs, then
 *  nibbles, then bytes, then sum the four bytes with one multiplication).
 *  Category: simulation. One word = 32 fair coin flips, so for Rademacher the
 *  sum of 32 steps is 2·popcount(w) − 32 in a handful of operations. */
export function popcount32(w) {
  w -= (w >>> 1) & 0x55555555;
  w = (w & 0x33333333) + ((w >>> 2) & 0x33333333);
  w = (w + (w >>> 4)) & 0x0f0f0f0f;
  return Math.imul(w, 0x01010101) >>> 24;
}

/** Number of failures before the next success of a p-coin: Geometric(p) on {0, 1, …}.
 *  Category: simulation (inverse-CDF sampling).
 *  Formula: G = ⌊ln(1 − U)/ln(1 − p)⌋ with U uniform in [0, 1), because
 *  P(G ≥ g) = (1 − p)^g = P(ln(1 − U) ≤ g ln(1 − p)).
 *  Why: for p = 0.01 one uniform replaces about 100 coin flips, exactly in law.
 *  (1 − U ∈ (0, 1], so the logarithm is always finite.) */
export function geometricGap(rng, logq) {
  return Math.floor(Math.log(1 - rng.float()) / logq);
}
