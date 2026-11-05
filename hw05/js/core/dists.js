/* dists.js — the distributions the scores and the Ex. 2 samples come from,
   each with its EXACT moments (mean, variance, skewness, excess kurtosis, and
   the central moments μ₃, μ₄ that the sampling theory needs), its density or
   mass function, its CDF and upper tail, and a sampler driven by the seeded
   generator. The simulations are compared against these exact numbers.
   Pure, no DOM. HW5 notes 02 §1, 03 §2; [[Beta distribution]],
   [[Moments, skewness and kurtosis]], [[Law of total variance]]. */

import { normal as stdNormal, beta as betaDraw } from '../../../assets/js/core/samplers.js';
import { normPdf, normCdf, normSf, betaInc } from '../../../assets/js/core/numeric.js';
import { lnGamma, binomialPmf } from '../../../assets/js/core/stats.js';

/**
 * What every distribution provides. Subclasses set mean, variance, skewness
 * (γ₁ = μ₃/σ³) and exKurtosis (κ = μ₄/σ⁴ − 3), and implement density, cdf,
 * sf and sample. The rest is derived here.
 */
class Distribution {
  discrete = false;
  get sd() { return Math.sqrt(this.variance); }
  /** Third central moment μ₃ = γ₁σ³: sets Cov(x̄, s²) = μ₃/n (the tilt of the (x̄, s²) cloud). */
  get mu3() { return this.skewness * this.variance ** 1.5; }
  /** Fourth central moment μ₄ = (κ + 3)σ⁴: sets Var(s²) (how noisy a sample variance is). */
  get mu4() { return (this.exKurtosis + 3) * this.variance ** 2; }
  /** E[Xᵏ] for k = 1…4, from the central moments by the binomial expansion of
   *  ((X − μ) + μ)ᵏ — used to mix two distributions (a mixture mixes raw moments). */
  raw(k) {
    const m = this.mean, v = this.variance, c3 = this.mu3, c4 = this.mu4;
    return [1, m, v + m * m, c3 + 3 * m * v + m ** 3, c4 + 4 * m * c3 + 6 * m * m * v + m ** 4][k];
  }
  /** P(X > x). Subclasses override it where 1 − cdf would lose digits in the tail. */
  sf(x) { return 1 - this.cdf(x); }
}

/** N(μ, σ²). Category: sampler (Box–Muller, shared samplers.js) + exact formulas.
 *  The reference case of Ex. 2: γ₁ = 0, κ = 0, so (n−1)s²/σ² ~ χ²_{n−1} exactly and
 *  x̄, s² are independent ([[Chi-squared and Student t distributions]]). */
export class Normal extends Distribution {
  constructor(mu = 0, sigma2 = 1) {
    super();
    Object.assign(this, { mu, sigma2, mean: mu, variance: sigma2, skewness: 0, exKurtosis: 0 });
    this.support = [mu - 5 * Math.sqrt(sigma2), mu + 5 * Math.sqrt(sigma2)];
  }
  label() { return this.mu === 0 && this.sigma2 === 1 ? 'N(0, 1)' : `N(${this.mu}, ${this.sigma2})`; }
  density(x) { return normPdf((x - this.mu) / this.sd) / this.sd; }
  cdf(x) { return normCdf((x - this.mu) / this.sd); }
  sf(x) { return normSf((x - this.mu) / this.sd); }
  sample(rng) { return this.mu + this.sd * stdNormal(rng); }
}

/** Exp(λ): μ = 1/λ, σ² = 1/λ², γ₁ = 2, κ = 6. Category: sampler (inverse CDF) + exact formulas.
 *  X = −ln(1 − U)/λ because P(X > x) = e^{−λx} = P(1 − U < e^{−λx}).
 *  The skewed, heavy-ish tail of Ex. 2: its s² is the noisiest of the four. */
export class Exponential extends Distribution {
  constructor(lambda = 1) {
    super();
    Object.assign(this, { lambda, mean: 1 / lambda, variance: 1 / lambda ** 2, skewness: 2, exKurtosis: 6 });
    this.support = [0, 7 / lambda];
  }
  label() { return this.lambda === 1 ? 'Exp(1)' : `Exp(${this.lambda})`; }
  density(x) { return x < 0 ? 0 : this.lambda * Math.exp(-this.lambda * x); }
  cdf(x) { return x <= 0 ? 0 : -Math.expm1(-this.lambda * x); }
  sf(x) { return x <= 0 ? 1 : Math.exp(-this.lambda * x); }
  sample(rng) { return -Math.log(1 - rng.float()) / this.lambda; }
}

/** U(a, b): μ = (a+b)/2, σ² = (b−a)²/12, γ₁ = 0, κ = −1.2. Category: sampler + exact formulas.
 *  Light tails (κ < 0): its s² is the calmest of the four. */
export class Uniform extends Distribution {
  constructor(a = 0, b = 1) {
    super();
    Object.assign(this, { a, b, mean: (a + b) / 2, variance: (b - a) ** 2 / 12, skewness: 0, exKurtosis: -1.2 });
    this.support = [a, b];
  }
  label() { return `U(${this.a}, ${this.b})`; }
  density(x) { return x < this.a || x > this.b ? 0 : 1 / (this.b - this.a); }
  cdf(x) { return Math.min(1, Math.max(0, (x - this.a) / (this.b - this.a))); }
  sf(x) { return Math.min(1, Math.max(0, (this.b - x) / (this.b - this.a))); }
  sample(rng) { return this.a + (this.b - this.a) * rng.float(); }
}

/** c·Beta(α, β): a score on [0, c].
 *  Category: sampler (Beta = G₁/(G₁ + G₂) with Gamma draws, [[Beta distribution]] Lemma 3) + exact formulas.
 *    μ = c·α/(α+β),  σ² = c²·αβ/((α+β)²(α+β+1))                      (Corollary, Lemma 2)
 *    γ₁ = 2(β−α)√(α+β+1) / ((α+β+2)√(αβ))
 *    κ  = 6[(α−β)²(α+β+1) − αβ(α+β+2)] / (αβ(α+β+2)(α+β+3))
 *  Scaling by c changes μ and σ² but not γ₁ or κ ([[Moments, skewness and kurtosis]] Lemma 1).
 *  Default score 10·Beta(2,5): most attempts score low, a few high (right skew);
 *  μ = 20/7, σ² = 1000/392 ≈ 2.551, γ₁ ≈ 0.596, κ = −0.12 (note 03 §2). */
export class ScaledBeta extends Distribution {
  constructor(c = 10, alpha = 2, beta = 5) {
    super();
    const a = alpha, b = beta, s = a + b;
    Object.assign(this, {
      c, alpha: a, beta: b,
      mean: (c * a) / s,
      variance: (c * c * a * b) / (s * s * (s + 1)),
      skewness: (2 * (b - a) * Math.sqrt(s + 1)) / ((s + 2) * Math.sqrt(a * b)),
      exKurtosis: (6 * ((a - b) ** 2 * (s + 1) - a * b * (s + 2))) / (a * b * (s + 2) * (s + 3)),
    });
    this.lnB = lnGamma(a) + lnGamma(b) - lnGamma(s);
    this.support = [0, c];
  }
  label() { return `${this.c}·Beta(${this.alpha}, ${this.beta})`; }
  density(x) {
    const u = x / this.c;
    if (u <= 0 || u >= 1) return 0;
    return Math.exp((this.alpha - 1) * Math.log(u) + (this.beta - 1) * Math.log1p(-u) - this.lnB) / this.c;
  }
  cdf(x) { return betaInc(x / this.c, this.alpha, this.beta); }
  /** Upper tail by the mirror symmetry I_{1−u}(β, α), so a small tail keeps its digits. */
  sf(x) { return betaInc(1 - x / this.c, this.beta, this.alpha); }
  sample(rng) { return this.c * betaDraw(rng, this.alpha, this.beta); }
}

/** Binomial(N, p): N sub-goals of an attack, each reached with probability p.
 *  Category: sampler (sum of N Bernoulli draws) + exact formulas.
 *    μ = Np, σ² = Np(1−p), γ₁ = (1−2p)/√(Np(1−p)), κ = (1 − 6p(1−p))/(Np(1−p)).
 *  The direct heir of HW4's Bernoulli step: a score is the count of 1s in N
 *  coin flips (note 03 §2). Discrete: it has a mass function, not a density. */
export class Binomial extends Distribution {
  constructor(N = 10, p = 0.3) {
    super();
    const v = N * p * (1 - p);
    Object.assign(this, {
      N, p, discrete: true, mean: N * p, variance: v,
      skewness: (1 - 2 * p) / Math.sqrt(v), exKurtosis: (1 - 6 * p * (1 - p)) / v,
    });
    this.support = [0, N];
  }
  label() { return `Binomial(${this.N}, ${this.p})`; }
  pmf(k) { return binomialPmf(this.N, k, this.p); }
  density(x) { return Number.isInteger(x) ? this.pmf(x) : 0; }
  cdf(x) { let s = 0; for (let k = 0; k <= Math.min(this.N, Math.floor(x)); k++) s += this.pmf(k); return s; }
  sf(x) { let s = 0; for (let k = Math.max(0, Math.floor(x) + 1); k <= this.N; k++) s += this.pmf(k); return s; }
  sample(rng) { let k = 0; for (let i = 0; i < this.N; i++) if (rng.float() < this.p) k++; return k; }
}

/**
 * Novices and experts: each hacker belongs to one group for ALL their scores.
 * Category: exact formulas ([[Law of total variance]]) + sampler (pick the group, then score).
 * With prob. π a novice (10·Beta(2,5)), else an expert (10·Beta(5,2)):
 *   within  = E[v(G)]                      = πσ_N² + (1−π)σ_E²
 *   between = Var(m(G))                    = π(1−π)(μ_E − μ_N)²
 *   total   = within + between             (the variance of one random score)
 * and for one hacker's n scores (Corollary):
 *   Var(x̄ⱼ) = between + within/n,  E[sⱼ²] = within.
 * So the average sample variance estimates only the WITHIN part (note 03 §4).
 */
export class Mixture extends Distribution {
  constructor(pi = 0.7, novice = new ScaledBeta(10, 2, 5), expert = new ScaledBeta(10, 5, 2)) {
    super();
    this.pi = pi;
    this.components = [novice, expert];
    this.weights = [pi, 1 - pi];
    this.within = pi * novice.variance + (1 - pi) * expert.variance;
    this.between = pi * (1 - pi) * (expert.mean - novice.mean) ** 2;
    this.mean = pi * novice.mean + (1 - pi) * expert.mean;
    this.variance = this.within + this.between;
    // shape of one random score, from the mixed raw moments
    const r = [1, 2, 3, 4].map((k) => pi * novice.raw(k) + (1 - pi) * expert.raw(k));
    const m = r[0];
    const c3 = r[2] - 3 * m * r[1] + 2 * m ** 3;
    const c4 = r[3] - 4 * m * r[2] + 6 * m * m * r[1] - 3 * m ** 4;
    this.skewness = c3 / this.variance ** 1.5;
    this.exKurtosis = c4 / this.variance ** 2 - 3;
    this.support = [0, Math.max(novice.support[1], expert.support[1])];
  }
  label() { return `mixture: ${Math.round(this.pi * 100)} % novices, ${Math.round((1 - this.pi) * 100)} % experts`; }
  /** Var(x̄ⱼ) for a hacker observed on n systems: between + within/n. */
  varOfMeans(n) { return this.between + this.within / n; }
  density(x) { return this.weights.reduce((s, w, i) => s + w * this.components[i].density(x), 0); }
  cdf(x) { return this.weights.reduce((s, w, i) => s + w * this.components[i].cdf(x), 0); }
  sf(x) { return this.weights.reduce((s, w, i) => s + w * this.components[i].sf(x), 0); }
  /** Which group a hacker is in: 0 novice, 1 expert. */
  pickGroup(rng) { return rng.float() < this.pi ? 0 : 1; }
  /** One score from a random group (an i.i.d. draw from the mixture, NOT one hacker's stream). */
  sample(rng) { return this.components[this.pickGroup(rng)].sample(rng); }
}

/* ---------- named distributions used by the pages ---------- */

export const SCORE_DEFAULTS = { dist: 'beta25', p: 0.3, a: 2, b: 5 };

/** The 0–10 score of a penetration attempt, as chosen in the dock:
 *  beta25 = 10·Beta(2,5) (default), unif = U[0,10], binom = Binomial(10, p),
 *  beta = 10·Beta(α, β) with the reader's α, β. */
export function scoreDist({ dist = 'beta25', p = 0.3, a = 2, b = 5 } = {}) {
  if (dist === 'unif') return new Uniform(0, 10);
  if (dist === 'binom') return new Binomial(10, p);
  if (dist === 'beta') return new ScaledBeta(10, a, b);
  return new ScaledBeta(10, 2, 5);
}

/** The four distributions of Ex. 2: same theory, different shapes (note 02 §1).
 *  The fourth is the hacker score, the bridge to the experiment. */
export const EX2 = ['normal', 'exp', 'unif01', 'score'];
export function ex2Dist(id, score = {}) {
  if (id === 'normal') return new Normal(0, 1);
  if (id === 'exp') return new Exponential(1);
  if (id === 'unif01') return new Uniform(0, 1);
  return scoreDist(score);
}

/** Any distribution of the pages from a plain, serialisable spec (what the
 *  worker receives and the cache keys on): {id, p, a, b, pi}.
 *  ids: normal, exp, unif01 (Ex. 2); beta25, unif, binom, beta (scores); mixture. */
export function makeDist(spec) {
  switch (spec.id) {
    case 'normal': case 'exp': case 'unif01': return ex2Dist(spec.id);
    case 'mixture': return new Mixture(spec.pi ?? 0.7);
    default: return scoreDist({ dist: spec.id, p: spec.p, a: spec.a, b: spec.b });
  }
}
