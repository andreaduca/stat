/* samplers.js — continuous random draws from the seeded generator: standard
   normals (Box–Muller), Gamma (Marsaglia–Tsang) and Beta (ratio of Gammas).
   Every function takes the generator as an argument: nothing here is global,
   so a run is fully determined by its seed. Pure, no DOM.
   Moved here from hw04/js/core/sampling.js when hw05 needed them too (Nov 2026):
   hw04 draws each heterogeneous attacker's skill with them, hw05 its 0–10 scores.
   HMWK4 note 03 §3; HW5 [[Beta distribution]] Lemma 3. */

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
