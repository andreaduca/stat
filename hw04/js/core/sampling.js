/* sampling.js — turning the 32-bit words of the seeded generator into the
   random quantities the simulation needs: counts of 1-bits (32 fair steps at
   once), geometric gaps (skip straight to the next success), standard
   normals, Gamma and Beta draws (each heterogeneous attacker's own skill).
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

/** One standard normal by Box–Muller: √(−2 ln U₁)·cos(2πU₂).
 *  Category: simulation. The polar pair gives two independent normals; only one
 *  is used, which keeps the stream order simple (one call = two uniforms). */
export function normal(rng) {
  const u1 = 1 - rng.float(), u2 = rng.float();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Gamma(shape, 1) by Marsaglia & Tsang (2000): with d = shape − ⅓, c = 1/√(9d),
 *  propose v = (1 + cZ)³ for a normal Z and accept d·v when
 *  ln U < Z²/2 + d − dv + d ln v. About 1.03 proposals per draw for shape ≥ 1.
 *  For shape < 1 use the boost Gamma(a) = Gamma(a + 1)·U^(1/a).
 *  Category: simulation. */
export function gamma(rng, shape) {
  if (shape < 1) return gamma(rng, shape + 1) * Math.pow(1 - rng.float(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const z = normal(rng);
    const t = 1 + c * z;
    if (t <= 0) continue;
    const v = t * t * t, u = 1 - rng.float();
    if (Math.log(u) < 0.5 * z * z + d - d * v + d * Math.log(v)) return d * v;
  }
}

/** Beta(α, β) as X/(X + Y) with X ~ Gamma(α), Y ~ Gamma(β) independent.
 *  Category: simulation. The skill pⱼ of a heterogeneous attacker (note 04 §5). */
export function beta(rng, a, b) {
  const x = gamma(rng, a), y = gamma(rng, b);
  return x / (x + y);
}
