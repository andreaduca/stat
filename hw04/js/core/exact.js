/* exact.js — the exact finite-n answers the simulations are compared with:
   the law of Sₙ (a relabelled binomial), its tails down to 10⁻³⁰⁰, the LLN
   tail probability, the exact distance between the standardised sum and the
   normal, the running maximum and hitting times (reflection principle),
   gambler's ruin, the expected maximum of m normals, and the Beta-binomial
   law of heterogeneous attackers.
   On every plot these form the middle layer: simulation ↔ EXACT ↔ limit.
   The gap simulation–exact is Monte Carlo noise; exact–limit is the error of
   the theorem at this n (note 01 §4). Pure functions, no DOM. */

import { lnGamma } from '../../../assets/js/core/stats.js';
import { normCdf, normPdf, simpson } from './numeric.js';

/* ---------- the binomial in log space ---------- */

/** ln C(n, k). */
const lnChoose = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);

/** ln P(B = k) for B ~ Binomial(n, p).
 *  Category: exact distribution. Formula: ln C(n,k) + k ln p + (n − k) ln(1 − p).
 *  Why logs: at n = 10⁴ the binomial coefficient alone overflows a double
 *  (C(10⁴, 5000) ≈ 10³⁰⁰⁸), and tail probabilities underflow long before the
 *  LLN page stops caring about them. [[Bernoulli and binomial distributions]] lemma 3. */
export function logBinomPmf(k, n, p) {
  if (k < 0 || k > n) return -Infinity;
  if (p === 0) return k === 0 ? 0 : -Infinity;
  if (p === 1) return k === n ? 0 : -Infinity;
  return lnChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p);
}

/** The most likely count, ⌊(n + 1)p⌋: the pmf rises up to it and falls after. */
const mode = (n, p) => Math.min(n, Math.floor((n + 1) * p));

/** ln of Σ P(B = k) for k = from, from + dir, … until the terms stop mattering.
 *  Only ever called moving AWAY from the mode, where the terms decrease, so the
 *  first term is the largest and the sum can stop once a term is 10⁻¹⁷ of it.
 *  Terms after the first come from the ratio of neighbours,
 *  P(k+1)/P(k) = (n − k)/(k + 1) · p/(1 − p), relative to the first term —
 *  no Γ function inside the loop, which keeps the sample-size search fast. */
function logSumOutward(n, p, from, dir) {
  const first = logBinomPmf(from, n, p);
  if (first === -Infinity) return -Infinity;
  const odds = p / (1 - p);
  let s = 1, t = 1;
  for (let k = from; k + dir >= 0 && k + dir <= n; k += dir) {
    t *= dir > 0 ? ((n - k) / (k + 1)) * odds : (k / (n - k + 1)) / odds;
    s += t;
    if (t < 1e-17 * s) break;
  }
  return first + Math.log(s);
}

/** ln P(B ≥ k), B ~ Binomial(n, p).
 *  Category: exact distribution (a tail).
 *  Method: if k is above the mode, sum the decreasing terms k, k+1, … (in logs);
 *  otherwise take the complement of the lower tail P(B ≤ k − 1), which is then
 *  the small side. Either way no small number is ever computed as 1 − (≈1). */
export function logUpperTail(n, p, k) {
  if (k <= 0) return 0;
  if (k > n) return -Infinity;
  if (k > mode(n, p)) return logSumOutward(n, p, k, +1);
  return Math.log1p(-Math.exp(logLowerTail(n, p, k - 1)));
}

/** ln P(B ≤ k), B ~ Binomial(n, p). Mirror image of logUpperTail. */
export function logLowerTail(n, p, k) {
  if (k >= n) return 0;
  if (k < 0) return -Infinity;
  if (k < mode(n, p)) return logSumOutward(n, p, k, -1);
  return Math.log1p(-Math.exp(logUpperTail(n, p, k + 1)));
}

/* ---------- the law of Sₙ and of the three quantities ---------- */

/** The exact law of Sₙ for a step model: support and probabilities.
 *  Category: exact distribution.
 *  Bernoulli: Sₙ = B ~ Binomial(n, p) on {0, …, n}.
 *  Rademacher: Sₙ = 2B − n on {−n, −n + 2, …, n} (the parity of n).
 *  Sₙ/n and Sₙ/√n are the same probabilities on the rescaled support
 *  (s/n, s/√n): one law, three views. */
export function lawOfTotal(model, n) {
  const s = new Int32Array(n + 1), prob = new Float64Array(n + 1);
  for (let k = 0; k <= n; k++) {
    s[k] = model.total(k, n);
    prob[k] = Math.exp(logBinomPmf(k, n, model.coin));
  }
  return { n, s, prob };
}

/** P(Sₙ = s), exactly. 0 off the lattice. */
export function probTotal(model, n, s) {
  const k = model.kind === 'bernoulli' ? s : (s + n) / 2;
  return Number.isInteger(k) ? Math.exp(logBinomPmf(k, n, model.coin)) : 0;
}

/* ---------- the LLN tail ---------- */

/* The band |Sₙ/n − μ| ≤ ε has edges n(μ ± ε), which are often integers in
   exact arithmetic (n = 100, p = ½, ε = 0.05 → 55) but not in floating point
   (100 · 0.55 = 55.000000000000007). A strict inequality must not depend on
   that rounding, so an edge within 1e−9 of an integer counts as that integer. */
const near = (t) => Math.abs(t - Math.round(t)) < 1e-9 * Math.max(1, Math.abs(t));
const firstAbove = (t) => (near(t) ? Math.round(t) + 1 : Math.ceil(t));
const lastBelow = (t) => (near(t) ? Math.round(t) - 1 : Math.floor(t));

/** The integer edges of "outside the band": Sₙ ≥ hi or Sₙ ≤ lo means
 *  |Sₙ/n − μ| > ε (strict, as in the definition of convergence in probability).
 *  Shared by the exact tail below and by the simulated hit count, so both
 *  count exactly the same outcomes. */
export function bandEdges(model, n, eps) {
  return { hi: firstAbove(n * (model.mean + eps)), lo: lastBelow(n * (model.mean - eps)) };
}

/** qₙ(ε) = P(|Sₙ/n − μ| > ε), exactly, with its logarithm.
 *  Category: exact distribution (the LLN page's black curve).
 *  Formula: P(Sₙ ≥ hi) + P(Sₙ ≤ lo), each a binomial tail through B:
 *  Bernoulli B = Sₙ; Rademacher B = (Sₙ + n)/2.
 *  Reference (§8.1): Rademacher, ε = 0.1: 0.75391 (n = 10), 0.27125 (100),
 *  1.3917e−3 (1 000), 1.2666e−23 (10 000). Note 02 §1. */
export function llnTail(model, n, eps) {
  const { hi, lo } = bandEdges(model, n, eps);
  const toK = (s, up) => (model.kind === 'bernoulli' ? s : up ? Math.ceil((s + n) / 2) : Math.floor((s + n) / 2));
  const lu = logUpperTail(n, model.coin, toK(hi, true));
  const ll = logLowerTail(n, model.coin, toK(lo, false));
  const M = Math.max(lu, ll);
  const log = M === -Infinity ? -Infinity : M + Math.log(Math.exp(lu - M) + Math.exp(ll - M));
  return { q: Math.exp(log), log };
}

/* ---------- the CLT: exact distance to the normal ---------- */

/** D_n = sup_x |Fₙ(x) − Φ(x)| for the standardised sum Zₙ = (Sₙ − nμ)/(σ√n).
 *  Category: exact distribution (the CLT page's exact line).
 *  Method: Fₙ is a step function and Φ is increasing, so the supremum is
 *  reached at an atom zₖ, either just after the jump (Fₙ(zₖ)) or just before it
 *  (Fₙ(zₖ⁻)). Both are checked at every atom.
 *  Reference (§8.1): Rademacher 0.12305 (n = 10), 0.03979 (100), 0.01261 (1 000),
 *  0.00399 (10 000); odd n = 11 → 0.11849. For even n the largest gap sits at
 *  the atom at 0, of mass P(Sₙ = 0) ≈ √(2/(πn)): half of it, ≈ 0.399/√n, is
 *  a floor no lattice law can beat ([[Central limit theorem]] lemma B). */
export function ksToNormal(model, n) {
  const mu = n * model.mean, sd = Math.sqrt(n * model.variance);
  let before = 0, D = 0, at = 0;
  for (let k = 0; k <= n; k++) {
    const z = (model.total(k, n) - mu) / sd;
    const mass = Math.exp(logBinomPmf(k, n, model.coin));
    const after = before + mass;
    const phi = normCdf(z);
    const gap = Math.max(Math.abs(after - phi), Math.abs(before - phi));
    if (gap > D) { D = gap; at = z; }
    before = after;
  }
  return { D, at };
}

/* ---------- first passage: running maximum and hitting times ---------- */

/** P(Mₙ ≥ a), where Mₙ = max over k ≤ n of Sₖ: "the attacker reached level a
 *  at some point within n steps".
 *  Category: exact distribution.
 *  Rademacher (reflection principle): P(Mₙ ≥ a) = 2P(Sₙ > a) + P(Sₙ = a).
 *  Every path that touches a and ends below it is matched, by flipping the
 *  steps after the first visit, with one that ends above it.
 *  Bernoulli: the path never goes down, so Mₙ = Sₙ and it is P(Sₙ ≥ a).
 *  Reference (§8.1): Rademacher n = 20, a = 4 → 0.3833103180; n = 100, a = 20 → 0.0460441.
 *  [[First passage and the reflection principle]] lemma 1, corollary 1. */
export function probMaxAtLeast(model, n, a) {
  if (a <= 0) return 1;
  if (model.kind === 'bernoulli') return Math.exp(logUpperTail(n, model.p, a));
  // Sₙ > a  ⇔  B > (n + a)/2
  const above = Math.exp(logUpperTail(n, 0.5, Math.floor((n + a) / 2) + 1));
  return Math.min(1, 2 * above + probTotal(model, n, a));
}

/** P(Tₐ = n): the first time the score reaches a is exactly step n.
 *  Category: exact distribution.
 *  Rademacher (hitting-time theorem): (a/n)·P(Sₙ = a).
 *  Bernoulli: the a-th success at step n, a negative binomial:
 *  C(n − 1, a − 1) pᵃ (1 − p)ⁿ⁻ᵃ.
 *  Reference (§8.1): Rademacher a = 3: 0.125, 0.09375, 0.0703125 for n = 3, 5, 7;
 *  Bernoulli(0.1), a = 3: P(T = 30) = 0.0236088. */
export function hitTimePmf(model, a, n) {
  if (n < a) return 0;
  if (model.kind === 'bernoulli') {
    const p = model.p;
    return Math.exp(lnChoose(n - 1, a - 1) + a * Math.log(p) + (n - a) * Math.log1p(-p));
  }
  return (a / n) * probTotal(model, n, a);
}

/** P(Tₐ > n) = P(Mₙ < a): still no breach after n steps.
 *  Rademacher: P(−a ≤ Sₙ ≤ a − 1), summed directly (it is small for large n).
 *  Asymptotically ≈ a√(2/(πn)): it decays like n^(−1/2), so slowly that
 *  E[Tₐ] = Σ P(Tₐ > n) diverges — "certain, but with infinite expected time"
 *  ([[First passage and the reflection principle]] theorems 1–2).
 *  Reference (§8.1): a = 1: 0.079589 (n = 100), 0.025225 (1 000), 0.0079786 (10⁴). */
export function hitTimeSurvival(model, a, n) {
  if (model.kind === 'bernoulli') return Math.exp(logLowerTail(n, model.p, a - 1));
  let s = 0;
  for (let k = Math.ceil((n - a) / 2); k <= Math.floor((n + a - 1) / 2); k++) s += Math.exp(logBinomPmf(k, n, 0.5));
  return Math.min(1, s);
}

/** The large-n approximation of P(Tₐ > n) for the symmetric walk: a√(2/(πn)). */
export const hitTimeSurvivalAsymptotic = (a, n) => a * Math.sqrt(2 / (Math.PI * n));

/** Bernoulli(p) hitting time of level a: mean a/p and variance a(1 − p)/p².
 *  It is a sum of a independent Geometric(p) waits. [[First passage…]] lemma 2. */
export const hitTimeMoments = (p, a) => ({ mean: a / p, variance: (a * (1 - p)) / (p * p) });

/** P(at least one of m independent attackers succeeds) = 1 − (1 − q)ᵐ.
 *  Category: exact (independence). Computed as −expm1(m·ln(1 − q)) so that
 *  q = 10⁻¹² and m = 10 still give 10⁻¹¹ and not 0.
 *  Reference (§8.1): q = 0.0460441 → 0.375858 (m = 10), 0.991029 (m = 100). Note 04 §3. */
export const atLeastOne = (q, m) => (q >= 1 ? 1 : -Math.expm1(m * Math.log1p(-q)));

/* ---------- the race between attacker and defender ---------- */

/** Gambler's ruin. Steps +1 with probability r, −1 with 1 − r, from 0;
 *  the game stops at +a (breach) or at −b (the attacker is expelled).
 *  Category: exact (first-step analysis, [[Gambler's ruin]] theorems 1–2).
 *  P(breach): fair r = ½ → b/(a + b);  otherwise, with s = (1 − r)/r,
 *  (1 − sᵇ)/(1 − s^(a+b)).
 *  E[duration]: fair → ab;  otherwise, from i = b on {0, …, N = a + b},
 *  i/(q − r) − (N/(q − r))·(1 − sⁱ)/(1 − sᴺ) with q = 1 − r.
 *  Reference (§8.1): r = ½, a = 5, b = 10 → 2/3 and 50; a = b = 10: r = 0.55 → 0.8814995,
 *  r = 0.45 → 0.1185005. A small edge per step becomes a large edge per race. */
export function race(r, a, b) {
  if (Math.abs(r - 0.5) < 1e-12) return { breach: b / (a + b), duration: a * b };
  const q = 1 - r, s = q / r, N = a + b;
  const reach = (i) => (1 - s ** i) / (1 - s ** N);
  return { breach: reach(b), duration: b / (q - r) - (N / (q - r)) * reach(b) };
}

/** With no lower barrier and a disadvantaged attacker (r < ½), the probability
 *  of EVER climbing a levels is (r/(1 − r))ᵃ; with r ≥ ½ it is 1.
 *  Category: exact ([[Gambler's ruin]], corollary). It is the formula of
 *  Nakamoto's double-spend race (note 05 §4).
 *  Reference (§8.1): r = 0.1, a = 5 → 1.69351e−5; r = 0.3, a = 5 → 0.0144583. */
export const catchUp = (r, a) => (r >= 0.5 ? 1 : (r / (1 - r)) ** a);

/* ---------- the luckiest of m attackers ---------- */

/** E[max of m independent standard normals]
 *  = ∫ x · m φ(x) Φ(x)^(m−1) dx  (the density of the maximum is m φ Φ^(m−1)).
 *  Category: exact (numerical integration, Simpson on [−12, 12]).
 *  It grows only like √(2 ln m), and is well below that at moderate m.
 *  Reference (§8.1): 1.538753 (m = 10), 2.507594 (100), 3.851616 (10⁴). Note 04 §3. */
export function expectedMaxNormal(m) {
  if (m <= 1) return 0;
  const f = (x) => {
    const F = normCdf(x);
    return F <= 0 ? 0 : x * m * normPdf(x) * Math.exp((m - 1) * Math.log(F));
  };
  return simpson(f, -12, 12, 24000);
}

/* ---------- heterogeneous attackers ---------- */

/** ln B(x, y) = ln Γ(x) + ln Γ(y) − ln Γ(x + y). */
const lnBeta = (x, y) => lnGamma(x) + lnGamma(y) - lnGamma(x + y);

/** Beta(α, β) density at x ∈ (0, 1): x^(α−1)(1 − x)^(β−1)/B(α, β).
 *  The large-n limit of the histogram of Sₙ/n when each attacker has its own
 *  pⱼ ~ Beta(α, β): Sₙ/n → pⱼ, so the spread converges to the law of pⱼ. */
export function betaPdf(x, a, b) {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - lnBeta(a, b));
}

/** P(Sₙ = k) for heterogeneous attackers: the Beta-binomial law
 *  C(n, k)·B(k + α, n − k + β)/B(α, β) (average of Binomial(n, p) over p ~ Beta).
 *  Category: exact distribution (the exact layer of the Beta histograms). */
export const betaBinomialPmf = (k, n, a, b) =>
  (k < 0 || k > n ? 0 : Math.exp(lnChoose(n, k) + lnBeta(k + a, n - k + b) - lnBeta(a, b)));
