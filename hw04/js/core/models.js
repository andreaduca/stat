/* models.js — the step models of the homework as small classes: what one step
   Xᵢ can be, its mean and variance, and how the total Sₙ relates to a
   binomial count. Every exact curve and every simulation starts from one of
   these objects. Pure, no DOM.
   HMWK4 note 01 §2; [[Bernoulli and binomial distributions]],
   [[Rademacher distribution and simple random walk]], note 04 §5 (Beta). */

/** One i.i.d. step: Bernoulli(p) on {0, 1} or Rademacher on {−1, +1}.
 *  Both are driven by a fair-or-biased coin with success probability `coin`;
 *  B = number of successes among n steps is Binomial(n, coin), and
 *    Bernoulli:  Sₙ = B
 *    Rademacher: Sₙ = 2B − n       (lemma 1 of the Rademacher note: R = 2·Ber(½) − 1)
 *  so every exact law in exact.js is a binomial on a relabelled support. */
export class StepModel {
  /** @param {{kind: 'bernoulli'|'rademacher', p?: number}} o */
  constructor({ kind, p = 0.5 }) {
    if (kind !== 'bernoulli' && kind !== 'rademacher') throw new Error(`unknown model ${kind}`);
    if (kind === 'bernoulli' && !(p > 0 && p < 1)) throw new Error('p must be strictly between 0 and 1');
    this.kind = kind;
    this.p = kind === 'rademacher' ? 0.5 : p;
  }

  /** Success probability of the underlying coin (½ for Rademacher). */
  get coin() { return this.p; }

  /** μ = E[X]: p for Bernoulli, 0 for Rademacher. */
  get mean() { return this.kind === 'bernoulli' ? this.p : 0; }

  /** σ² = Var X: p(1 − p) for Bernoulli, 1 for Rademacher. */
  get variance() { return this.kind === 'bernoulli' ? this.p * (1 - this.p) : 1; }

  get sd() { return Math.sqrt(this.variance); }

  /** The two values a step can take. */
  get values() { return this.kind === 'bernoulli' ? [0, 1] : [-1, 1]; }

  /** Width of the step range (b − a): 1 for Bernoulli, 2 for Rademacher.
   *  It is the only property of the step Hoeffding's inequality uses. */
  get range() { return this.kind === 'bernoulli' ? 1 : 2; }

  /** Sₙ from the number of successes B among n steps. */
  total(successes, n) { return this.kind === 'bernoulli' ? successes : 2 * successes - n; }

  /** Spacing of the lattice Sₙ lives on: 1 for Bernoulli, 2 for Rademacher
   *  (a Rademacher total always has the parity of n). */
  get lattice() { return this.kind === 'bernoulli' ? 1 : 2; }

  /** Skewness of one step, E[(X − μ)³]/σ³ = (1 − 2p)/√(p(1 − p)); 0 for Rademacher.
   *  For the standardised sum it shrinks like 1/√n — the reason small p
   *  converges slowly in the CLT (note 02 §4). */
  get skewness() { return this.kind === 'bernoulli' ? (1 - 2 * this.p) / Math.sqrt(this.p * (1 - this.p)) : 0; }

  /** Excess kurtosis of one step: (1 − 6p(1 − p))/(p(1 − p)) for Bernoulli,
   *  −2 for Rademacher (a ±1 coin is as "un-tailed" as a law can be).
   *  For the standardised sum it is this divided by n. */
  get excessKurtosis() {
    const v = this.p * (1 - this.p);
    return this.kind === 'bernoulli' ? (1 - 6 * v) / v : -2;
  }

  /** ρ/σ³ with ρ = E|X − μ|³: the step's factor in the Berry–Esseen bound.
   *  Bernoulli: (p² + (1 − p)²)/√(p(1 − p)); Rademacher: 1.
   *  [[Central limit theorem]], rate of convergence. */
  get berryEsseenRatio() {
    const p = this.p;
    return this.kind === 'bernoulli' ? (p * p + (1 - p) * (1 - p)) / Math.sqrt(p * (1 - p)) : 1;
  }

  /** Short label for legends and captions. */
  label() { return this.kind === 'bernoulli' ? `Bernoulli(${this.p})` : 'Rademacher'; }

  /** What one step means for the attacker (the modelling choice of note 01 §2). */
  reading() {
    return this.kind === 'bernoulli'
      ? '1 = the system is penetrated, 0 = the attempt fails'
      : '+1 = the attacker gains ground, −1 = the defender pushes back';
  }
}

/** Heterogeneous attackers: attacker j first draws its own skill pⱼ ~ Beta(α, β),
 *  then its steps are i.i.d. Bernoulli(pⱼ). Across attackers the steps are no
 *  longer independent of each other within one path: they share pⱼ.
 *  Note 04 §5; [[Expectation and variance of sums]], corollary "equicorrelated terms". */
export class HeterogeneousBernoulli extends StepModel {
  /** @param {{alpha: number, beta: number}} o */
  constructor({ alpha, beta }) {
    if (!(alpha > 0 && beta > 0)) throw new Error('α and β must be positive');
    super({ kind: 'bernoulli', p: alpha / (alpha + beta) });
    this.heterogeneous = true;
    this.alpha = alpha;
    this.beta = beta;
  }

  /** Var(pⱼ) = αβ / ((α + β)²(α + β + 1)): how much attackers differ. */
  get varP() {
    const s = this.alpha + this.beta;
    return (this.alpha * this.beta) / (s * s * (s + 1));
  }

  /** Correlation between two steps of the same attacker, ρ = 1/(α + β + 1).
   *  Proof sketch: Cov(Xᵢ, Xₖ) = Var(pⱼ) for i ≠ k (law of total covariance),
   *  and Var Xᵢ = p̄(1 − p̄); their ratio simplifies to 1/(α + β + 1). */
  get rho() { return 1 / (this.alpha + this.beta + 1); }

  /** Var(Sₙ/n) = p̄(1 − p̄)·(1/n + (n − 1)ρ/n): the equicorrelated-sum formula.
   *  As n → ∞ it tends to p̄(1 − p̄)ρ = Var(pⱼ), not to 0: averaging over more
   *  systems cannot remove the difference between attackers. */
  varianceOfMean(n) {
    const v = this.p * (1 - this.p);
    return v * (1 / n + ((n - 1) / n) * this.rho);
  }

  label() { return `Beta(${this.alpha}, ${this.beta}) attackers`; }
}

/** The model a page is looking at, from its URL parameters
 *  (?model=rad | ber & p=0.1; ?model=beta & a=2 & b=18). */
export function modelFrom({ model = 'rad', p = 0.5, a = 2, b = 18 } = {}) {
  if (model === 'beta') return new HeterogeneousBernoulli({ alpha: Number(a), beta: Number(b) });
  return new StepModel({ kind: model === 'ber' ? 'bernoulli' : 'rademacher', p: Number(p) });
}
