/* privacy.js — publishing a group's mean and variance without exposing any
   single score: clipping to the known range, the global sensitivities (which
   Welford's recurrence proves), the Laplace mechanism, the split of the
   budget ε between the two releases, and the free post-processing. Also the
   attack that motivates it: two exact summaries one record apart reveal that
   record. A SIMULATION of the mechanism with the seeded generator; a real
   deployment needs a CSPRNG and floating-point-safe noise (Mironov, CCS 2012)
   and accounting over repeated releases. Pure, no DOM.
   HW5 note 06 §3–4; [[Differential privacy and the Laplace mechanism]],
   [[Merging summary statistics (Chan)]] (Lemma: what a summary reveals). */

/** Clip a value into [lo, hi].
 *  Category: privacy. Without a known range one record can move the mean
 *  arbitrarily far (infinite sensitivity, no finite noise works): clipping is
 *  part of the privacy argument, not a cosmetic step. */
export const clip = (x, lo = 0, hi = 10) => Math.min(hi, Math.max(lo, x));

/** Global sensitivities on data in [lo, hi] with n fixed and public (replace-one neighbours):
 *    Δx̄ = (hi − lo)/n,   Δs² = (hi − lo)²/n.
 *  Category: privacy (exact formula, Lemma of the DP note). The variance bound
 *  comes from Welford: with the other n − 1 records summarised as (n−1, M′, S′),
 *    s² = S′/(n − 1) + (v − M′)²/n,
 *  and only the last term depends on the replaced record v; it lies in
 *  [0, (hi − lo)²/n]. For scores in [0, 10] and n = 50: 0.2 and 2. */
export const sensitivities = (n, lo = 0, hi = 10) => ({ mean: (hi - lo) / n, variance: (hi - lo) ** 2 / n });

/** One draw of Lap(b): density e^{−|y|/b}/(2b), mean 0, variance 2b².
 *  Category: sampler (inverse CDF). With U uniform on (−½, ½):
 *    Y = −b·sign(U)·ln(1 − 2|U|).
 *  U = −½ exactly (a uniform of 0) would give ln 0, so it is redrawn. */
export function laplace(rng, b) {
  let u;
  do { u = rng.float(); } while (u === 0);
  const U = u - 0.5;
  return -b * Math.sign(U) * Math.log(1 - 2 * Math.abs(U));
}

/** Noise SD of the Laplace mechanism: √2·b. Category: exact formula. */
export const laplaceSD = (b) => Math.SQRT2 * b;

/** Largest possible sample variance on [lo, hi] with n values:
 *  half the values at each end gives SS = n(hi − lo)²/4, so s² ≤ (hi − lo)²/4·n/(n − 1)
 *  (Popoviciu's inequality for the plug-in variance). The clamp for the noisy release. */
export const maxS2 = (n, lo = 0, hi = 10) => ((hi - lo) ** 2 / 4) * (n / (n - 1));

/**
 * Release a group's mean and variance with ε-differential privacy.
 * Category: privacy (Laplace mechanism, Theorem 1; sequential composition,
 * Theorem 2; post-processing, Theorem 3 of the DP note).
 *  - ε = ε₁ + ε₂ with ε₁ = split·ε for the mean, ε₂ = (1 − split)·ε for the variance;
 *  - mean + Lap(Δx̄/ε₁), variance + Lap(Δs²/ε₂);
 *  - then clamp to the possible range ([lo, hi] for the mean, [0, maxS2] for
 *    the variance): any function of a private output is private, for free.
 * @param {{n: number, mean: number, s2: number}} truth  the exact summary of the clipped scores
 * @returns the raw and clamped noisy values and the two noise scales b
 */
export function release(truth, { eps = 1, split = 0.5, lo = 0, hi = 10 }, rng) {
  const { mean: dMean, variance: dVar } = sensitivities(truth.n, lo, hi);
  const bMean = dMean / (split * eps), bVar = dVar / ((1 - split) * eps);
  const noisyMean = truth.mean + laplace(rng, bMean), noisyS2 = truth.s2 + laplace(rng, bVar);
  return {
    bMean, bVar, noisyMean, noisyS2,
    mean: clip(noisyMean, lo, hi),
    s2: clip(noisyS2, 0, maxS2(truth.n, lo, hi)),
  };
}

/** The differencing attack: the summary of a group (n, M) and of the same
 *  group plus one record (n + 1, M′) give that record exactly,
 *    x = (n + 1)·M′ − n·M.
 *  Category: privacy (the reason aggregation alone is not privacy, trap T8). */
export const recoverRecord = (before, after) => after.n * after.mean - before.n * before.mean;
