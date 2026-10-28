/* bounds.js — upper bounds and approximations for the LLN tail
   qₙ(ε) = P(|Sₙ/n − μ| > ε), and the number of observations each one says is
   enough to push qₙ below δ. Bounds are guarantees for every n; the CLT
   approximation is not a bound (it can be far off, relatively, in the tails).
   The exact value comes from exact.js; the gap between the two is what each
   inequality throws away. Pure functions, no DOM.
   HMWK4 note 02 §1, note 04 §4; [[Markov and Chebyshev inequalities]],
   [[Chernoff bound and Hoeffding inequality]]. */

import { erfc, normInv } from './numeric.js';
import { llnTail } from './exact.js';

/** Chebyshev: P(|Sₙ/n − μ| ≥ ε) ≤ σ²/(nε²).
 *  Category: bound. Uses only the variance, so it decays only like 1/n —
 *  the proof of the weak law in one line, but far too pessimistic to plan with.
 *  Reference (§8.1): Bernoulli ½, ε = 0.05, n = 1000 → 0.1. */
export const chebyshev = (model, n, eps) => Math.min(1, model.variance / (n * eps * eps));

/** Hoeffding: for steps in an interval of width w,
 *  P(|Sₙ/n − μ| ≥ ε) ≤ 2·exp(−2nε²/w²).
 *  Category: bound. Bernoulli (w = 1): 2e^(−2nε²); Rademacher (w = 2): 2e^(−nε²/2).
 *  Exponential in n: the right shape, with a constant that ignores the variance.
 *  Reference (§8.1): Bernoulli ½, ε = 0.05, n = 1000 → 0.013476.
 *  [[Chernoff bound and Hoeffding inequality]] theorems 1–2. */
export const hoeffding = (model, n, eps) => Math.min(1, 2 * Math.exp((-2 * n * eps * eps) / model.range ** 2));

/** Kullback–Leibler divergence between coins, D(q‖p) = q ln(q/p) + (1 − q) ln((1 − q)/(1 − p)).
 *  The exact exponential rate at which a p-coin looks like a q-coin. */
export function kl(q, p) {
  const t = (a, b) => (a === 0 ? 0 : a * Math.log(a / b));
  return t(q, p) + t(1 - q, 1 - p);
}

/** Chernoff bound in KL form for the fraction of successes B/n of a p-coin:
 *  P(B/n ≥ p + ε) ≤ e^(−n D(p+ε‖p)),  P(B/n ≤ p − ε) ≤ e^(−n D(p−ε‖p)).
 *  Category: bound — the tightest of the three, and the right exponent (Cramér).
 *  A term is omitted when p ± ε falls outside (0, 1): that side is then impossible.
 *  Rademacher goes through B = (Sₙ + n)/2: |Sₙ/n| > ε ⇔ |B/n − ½| > ε/2.
 *  Reference (§8.1): Bernoulli 0.1, ε = 0.05, n = 1000: upper term 4.857e−6, lower 5.552e−8.
 *  [[Chernoff bound and Hoeffding inequality]] theorem 3. */
export function klChernoff(model, n, eps) {
  const p = model.coin, e = model.kind === 'bernoulli' ? eps : eps / 2;
  const upper = p + e < 1 ? Math.exp(-n * kl(p + e, p)) : 0;
  const lower = p - e > 0 ? Math.exp(-n * kl(p - e, p)) : 0;
  return { bound: Math.min(1, upper + lower), upper, lower };
}

/** CLT approximation: qₙ(ε) ≈ 2(1 − Φ(ε√n/σ)) = erfc(ε√n/(σ√2)).
 *  Category: approximation, NOT a bound. Good near the centre, but in the far
 *  tails its relative error is large in either direction (no lattice, no skew).
 *  Reference (§8.1): Bernoulli ½, ε = 0.05, n = 1000 → 1.5654e−3. */
export const cltApprox = (model, n, eps) => erfc((eps * Math.sqrt(n)) / (model.sd * Math.SQRT2));

/* ---------- sample sizes: how many observations until qₙ ≤ δ ---------- */

/** Observations each method says are enough for P(|Sₙ/n − μ| > ε) ≤ δ.
 *  Category: sample-size calculator (the concentration calculator, E6).
 *    Chebyshev  n ≥ σ²/(δε²)                — cost ∝ 1/δ
 *    Hoeffding  n ≥ w²·ln(2/δ)/(2ε²)        — cost ∝ ln(1/δ)/ε²
 *    KL         smallest n with the KL bound ≤ δ (it decreases in n: bisection)
 *    CLT        n ≈ (σ·Φ⁻¹(1 − δ/2)/ε)²   — an estimate, not a guarantee
 *    exact      the true answer, by scanning n with the exact tail.
 *  Because the lattice makes qₙ wobble, the exact search reports two numbers:
 *  the first n with qₙ ≤ δ, and the n from which it does not rise above δ again.
 *  The scan covers [0.8·n_CLT, 1.25·n_CLT] around the CLT estimate, after checking
 *  that the tail is above δ at the start (else the scan starts at n = 1) and below
 *  δ at the end (else it is widened up to the Hoeffding n). Beyond n_CLT = 50 000
 *  the exact scan is skipped (exactFirst = null): it would take seconds, and there
 *  the CLT estimate is within about 1 % of the exact answer. This keeps the
 *  calculator interactive.
 *  Reference (§8.1): Hoeffding, ε = δ = 0.01, steps in [0, 1] → 26 492. Note 04 §4. */
export function sampleSizes(model, eps, delta) {
  const hoeff = Math.ceil((model.range ** 2 * Math.log(2 / delta)) / (2 * eps * eps));
  let lo = 1, hi = hoeff;
  if (klChernoff(model, hi, eps).bound > delta) hi = 4 * hoeff;   // never: KL ≤ Hoeffding (Pinsker)
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (klChernoff(model, mid, eps).bound <= delta) hi = mid; else lo = mid + 1;
  }
  const clt = Math.ceil(((model.sd * normInv(1 - delta / 2)) / eps) ** 2);
  const sizes = { chebyshev: Math.ceil(model.variance / (delta * eps * eps)), hoeffding: hoeff, kl: lo, clt };
  if (clt > 50000) return { ...sizes, exactFirst: null, exactFrom: null, scanned: null };
  let from = Math.max(1, Math.floor(0.8 * clt));
  if (llnTail(model, from, eps).q <= delta) from = 1;
  let to = Math.min(hoeff, Math.max(Math.ceil(1.25 * clt), from + 10));
  if (llnTail(model, to, eps).q > delta) to = hoeff;
  let first = null, lastAbove = from - 1;
  for (let n = from; n <= to; n++) {
    if (llnTail(model, n, eps).q <= delta) { if (first === null) first = n; }
    else lastAbove = n;
  }
  return { ...sizes, exactFirst: first, exactFrom: lastAbove + 1, scanned: [from, to] };
}
