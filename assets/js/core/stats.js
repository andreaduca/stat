/* stats.js — the statistics toolkit shared by the homeworks: goodness-of-fit
   (χ² with its exact p-value), z-tests, multiple-testing correction, interval
   estimates for proportions, the reference distributions the experiments are
   compared with, and entropy. Pure functions on Numbers, no DOM.
   HMWK 1 note 07 (statistics toolkit); concept notes [[Chi-square goodness-of-fit
   test]], [[Hypothesis testing and p-values]], [[Confidence interval for a
   proportion]], [[Geometric distribution]], [[Shannon entropy]]. */

/* ---------- special functions ---------- */

/** ln Γ(x) for x > 0, Lanczos approximation (g = 7, 9 terms): about 15
 *  correct digits, plenty for p-values. Γ(n) = (n − 1)!, so this also gives
 *  log-factorials for the binomial coefficients below. */
export function lnGamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);   // reflection formula
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a).
 *  It is the tail of the χ² distribution: P(χ²_k ≥ s) = Q(k/2, s/2), and also
 *  of |Z| for a standard normal: P(|Z| ≥ z) = Q(1/2, z²/2).
 *  Computed by the power series of P = 1 − Q when x < a + 1 (it converges
 *  fast there) and by Lentz's continued fraction for Q otherwise. */
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  const front = Math.exp(-x + a * Math.log(x) - lnGamma(a));
  if (x < a + 1) {
    // P(a, x) = e^−x x^a / Γ(a+1) · Σ xⁿ / ((a+1)(a+2)…(a+n))
    let term = 1 / a, sum = term;
    for (let n = 1; n < 1000 && Math.abs(term) > Math.abs(sum) * 1e-15; n++) { term *= x / (a + n); sum += term; }
    return Math.max(0, 1 - sum * front);
  }
  // Q(a, x) = e^−x x^a / Γ(a) · 1/(x + 1 − a − 1·(1−a)/(x + 3 − a − 2·(2−a)/(x + 5 − a − …)))
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < 1e-15) break;
  }
  return Math.min(1, front * h);
}

/* ---------- tests ---------- */

/** Pearson's χ² goodness of fit: s = Σ (Oᵢ − Eᵢ)² / Eᵢ, df = categories − 1.
 *  Under H₀ ("the counts come from the expected distribution") s follows χ²
 *  with df degrees of freedom; the p-value is its upper tail. A tiny p means
 *  the counts are too far from expectation; a p near 1 means suspiciously close.
 *  @param {number[]} observed  counts per category
 *  @param {number[]} [expected] defaults to uniform over the categories */
export function chiSquare(observed, expected = null) {
  const total = observed.reduce((s, o) => s + o, 0);
  const exp = expected ?? observed.map(() => total / observed.length);
  const stat = observed.reduce((s, o, i) => s + (o - exp[i]) ** 2 / exp[i], 0);
  const df = observed.length - 1;
  return { stat, df, p: gammaQ(df / 2, stat / 2) };
}

/** Two-sided p-value of a standard-normal statistic: P(|Z| ≥ |z|). */
export const zPValue = (z) => gammaQ(0.5, (z * z) / 2);

/** Monobit test: k ones among n bits. Under fair, independent bits
 *  k ~ Binomial(n, ½), so z = (k − n/2) / √(n/4) is approximately N(0, 1). */
export function monobit(ones, n) {
  const z = (ones - n / 2) / Math.sqrt(n / 4);
  return { proportion: ones / n, z, p: zPValue(z) };
}

/** Bonferroni: running m tests at level α, compare each p with α/m — or,
 *  equivalently, report min(1, m·p). Keeps the chance of ANY false alarm ≤ α. */
export const bonferroni = (p, m) => Math.min(1, p * m);

/** The two-sided normal quantile for a Bonferroni-corrected family:
 *  the |z| a single test must exceed so that m tests together stay at level α.
 *  Found by bisection on zPValue (monotone). */
export function criticalZ(alpha = 0.05, m = 1) {
  let lo = 0, hi = 10;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (zPValue(mid) > alpha / m) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/* ---------- interval estimates ---------- */

/** Wilson score interval for a proportion k/n (default 95 %, z = 1.96).
 *  Unlike the textbook p̂ ± z√(p̂(1−p̂)/n) it never leaves [0, 1] and does not
 *  collapse to [0, 0] when k = 0 — essential for rare events such as an EIP-55
 *  typo slipping through:
 *    centre = (p̂ + z²/2n) / (1 + z²/n),  half = z·√(p̂(1−p̂)/n + z²/4n²) / (1 + z²/n). */
export function wilson(k, n, z = 1.96) {
  if (n === 0) return [0, 1];
  const p = k / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Rule of three: after 0 events in n trials, p ≲ 3/n at 95 % (since (1 − 3/n)ⁿ ≈ e⁻³ ≈ 0.05). */
export const ruleOfThree = (n) => 3 / n;

/** Mean, sample standard deviation, and a normal 95 % interval for the mean. */
export function meanCI(values) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));
  const half = 1.96 * sd / Math.sqrt(n);
  return { mean, sd, lo: mean - half, hi: mean + half };
}

/** Median of a list of numbers. */
export function median(values) {
  const v = [...values].sort((a, b) => a - b), m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/* ---------- reference distributions ---------- */

/** Binomial(n, p) probability of exactly k successes, in log space so that
 *  n = 512 does not overflow: C(n, k) pᵏ (1 − p)ⁿ⁻ᵏ. */
export function binomialPmf(n, k, p) {
  if (k < 0 || k > n) return 0;
  const lnC = lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
  return Math.exp(lnC + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/** Geometric waiting time: the number of tries T until the first success when
 *  each try succeeds with probability p. P(T = t) = (1 − p)^(t−1) p,
 *  E[T] = 1/p, median ≈ ln 2 / p (exactly ⌈ln ½ / ln(1 − p)⌉). Brute force,
 *  vanity addresses and address poisoning all follow it. */
export const geometricPmf = (t, p) => (1 - p) ** (t - 1) * p;
export const geometricCdf = (t, p) => 1 - (1 - p) ** t;
export const geometricMedian = (p) => Math.ceil(Math.log(0.5) / Math.log(1 - p));

/** Dickman's ρ(u): the probability that a random integer near x has no prime
 *  factor above x^(1/u) (is "x^(1/u)-smooth"). Defined by ρ = 1 on [0, 1] and
 *  u·ρ'(u) = −ρ(u − 1), i.e. ρ(u) = (1/u) ∫_{u−1}^{u} ρ(t) dt. Solved here on a
 *  grid of step h with the trapezoidal rule; ρ(2) = 1 − ln 2 ≈ 0.307 is a check.
 *  Index calculus attacks on factoring and finite-field logs live on this curve. */
export function dickmanRho(u, h = 1e-3) {
  if (u <= 1) return 1;
  const steps = Math.ceil(u / h), per = Math.round(1 / h);
  const rho = new Float64Array(steps + 1);
  for (let i = 0; i <= Math.min(per, steps); i++) rho[i] = 1;
  for (let i = per + 1; i <= steps; i++) {
    // ρ'(t) = −ρ(t − 1)/t, integrated from the previous point (trapezoid)
    const t0 = (i - 1) * h, t1 = i * h;
    rho[i] = rho[i - 1] - (h / 2) * (rho[i - 1 - per] / t0 + rho[i - per] / t1);
  }
  return rho[steps];
}

/* ---------- entropy ---------- */

/** Shannon entropy H = −Σ pᵢ log₂ pᵢ (bits): the average surprise. */
export const shannonEntropy = (probs) => -probs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);

/** Min-entropy H∞ = −log₂ max pᵢ: the attacker's view — how hard the single
 *  best guess is. Security is set by this, not by Shannon entropy. */
export const minEntropy = (probs) => -Math.log2(Math.max(...probs));
