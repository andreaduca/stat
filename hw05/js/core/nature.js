/* nature.js — small simulations behind the "manifestations in nature" page:
   photon counts (shot noise), diffusing particles (Brownian motion and the
   mean squared displacement), ion-channel current fluctuations (inference of
   hidden numbers from a mean and a variance), and a heavy-tailed stream whose
   sample variance never settles. Each one illustrates one property of note
   05: averages are unbiased (P1), their noise falls like 1/√N (P2), and a
   variance is itself a measurement (P3). Pure, no DOM; seeded generators.
   HW5 note 05; [[Sample mean]], [[Variance of the sample variance]]. */

import { normal } from '../../../assets/js/core/samplers.js';
import { linFit } from '../../../assets/js/core/numeric.js';
import { RunningStats } from './running.js';

/** One Poisson(λ) count.
 *  Category: sampler.
 *  Knuth's method: multiply uniforms until the product falls below e^{−λ}; the
 *  number of factors minus one is Poisson(λ). It needs e^{−λ} to be
 *  representable and about λ uniforms, so a large λ is split into chunks of at
 *  most 30: a sum of independent Poisson counts is Poisson with the summed
 *  rate, so the result is exact in law for every λ.
 *  Photon counts are Poisson: mean λ, variance λ, so the signal-to-noise ratio
 *  of one pixel is λ/√λ = √λ (note 05, P2). */
export function poisson(rng, lambda) {
  let total = 0, rest = lambda;
  while (rest > 0) {
    const l = Math.min(30, rest), limit = Math.exp(-l);
    let k = -1, p = 1;
    do { k++; p *= rng.float(); } while (p > limit);
    total += k;
    rest -= l;
  }
  return total;
}

/** The brightness pattern of the shot-noise picture, in [0.04, 1]: a padlock
 *  (a body and a shackle) on a dark background, w × h pixels. The body's
 *  interior is uniform at 1, which is where the SNR is measured. */
export function padlock(w = 48, h = 48) {
  const f = new Float64Array(w * h), body = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = x - w / 2 + 0.5, inBody = y >= 0.5 * h && y < 0.9 * h && Math.abs(cx) < 0.3 * w;
    const r = Math.hypot(cx, y - 0.5 * h), inShackle = y < 0.5 * h && r > 0.15 * w && r < 0.24 * w;
    const keyhole = Math.hypot(cx, y - 0.64 * h) < 0.05 * w || (Math.abs(cx) < 0.02 * w && y > 0.64 * h && y < 0.78 * h);
    f[y * w + x] = keyhole ? 0.04 : inBody ? 1 : inShackle ? 0.75 : 0.04;
    if (inBody && !keyhole && y > 0.52 * h && y < 0.88 * h && Math.abs(cx) < 0.27 * w) body.push(y * w + x);
  }
  return { w, h, f, body };
}

/** One exposure: every pixel counts Poisson(exposure × brightness) photons.
 *  Category: experiment. Returns the counts and, over the uniform body pixels,
 *  their mean, SD and SNR = mean/SD (theory: √exposure). */
export function exposure(rng, pattern, level) {
  const counts = new Float64Array(pattern.f.length);
  for (let i = 0; i < counts.length; i++) counts[i] = poisson(rng, level * pattern.f[i]);
  const s = new RunningStats();
  for (const i of pattern.body) s.push(counts[i]);
  return { counts, mean: s.mean, sd: s.std(), snr: s.mean / s.std() };
}

/** Diffusing particles: W walkers, each step N(0, 2D) (unit time step).
 *  Category: experiment (P3). The displacement after t steps has variance 2Dt,
 *  so the SAMPLE variance of the W displacements at each t estimates 2Dt, and
 *  a line through them estimates D: Einstein's relation, with which Perrin
 *  measured Avogadro's number. Returns [t, sample variance] at every t. */
export function brownian(rng, { walkers = 400, steps = 200, D = 0.5 } = {}) {
  const x = new Float64Array(walkers), sd = Math.sqrt(2 * D), out = [];
  for (let t = 1; t <= steps; t++) {
    const s = new RunningStats();
    for (let j = 0; j < walkers; j++) { x[j] += sd * normal(rng); s.push(x[j]); }
    out.push([t, s.variance(1)]);
  }
  const fit = linFit(out.map((p) => p[0]), out.map((p) => p[1]));
  return { points: out, Dhat: fit.slope / 2, D };
}

/** Noise analysis of ion channels: N channels, each open with probability p
 *  and passing current i when open, so the current is I = i·Binomial(N, p),
 *  with mean Nip and variance i·I − I²/N.
 *  Category: experiment + inference (P3; Sigworth 1980, to be checked).
 *  For each p, `trials` currents are recorded; their sample mean and variance
 *  give one point of the variance–mean parabola. Since σ²/I = i − I/N is linear
 *  in I, a straight-line fit recovers the hidden single-channel current i and
 *  the channel count N, which nobody can see directly. */
export function ionChannels(rng, { N = 500, i = 1.2, ps = [0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9], trials = 300 } = {}) {
  const points = ps.map((p) => {
    const s = new RunningStats();
    for (let r = 0; r < trials; r++) {
      let open = 0;
      for (let c = 0; c < N; c++) if (rng.float() < p) open++;
      s.push(i * open);
    }
    return [s.mean, s.variance(1)];
  });
  const fit = linFit(points.map((q) => q[0]), points.map((q) => q[1] / q[0]));
  return { points, iHat: fit.intercept, Nhat: -1 / fit.slope, N, i };
}

/** Running sample variance of a stream from a Pareto(α) law (x ≥ 1,
 *  P(X > x) = x^{−α}) and from Exp(1), recorded at log-spaced k.
 *  Category: experiment (P3, the limitation). For α ≤ 2 the variance is
 *  infinite and s² never settles: each rare huge value resets it. For α in
 *  (2, 4] the variance is finite but μ₄ is not, so s² converges without a
 *  normal error bar. */
export function heavyTail(rng, { alpha = 1.8, K = 100000 } = {}) {
  const a = new RunningStats(), b = new RunningStats(), out = [];
  let next = 10;
  for (let k = 1; k <= K; k++) {
    a.push((1 - rng.float()) ** (-1 / alpha));
    b.push(-Math.log(1 - rng.float()));
    if (k >= next) { out.push([k, a.variance(1), b.variance(1)]); next = Math.ceil(k * 1.05); }
  }
  return { alpha, points: out };
}
