/* causal.js — association without causation, simulated from small causal graphs
   (DAGs): a common cause (fork), a mediator (chain), a selection on a common effect
   (collider); what randomisation and the back-door adjustment do; and the base-rate
   arithmetic of a detector. Every model is synthetic and says so; the numbers are
   chosen to make each mechanism visible, not taken from real data.
   [[Causal graphs - confounders, mediators, colliders]], [[Bayes theorem and base rates]]. */

import { ContingencyTable } from './table.js';

const YN = ['yes', 'no'];
const bern = (rng, p) => rng.float() < p;
/* a 2 × 2 table (rows: X yes/no, cols: Y yes/no) */
const table2 = (rowName, colName) => {
  const t = new ContingencyTable(YN.map((v) => `${rowName} ${v}`), YN.map((v) => `${colName} ${v}`));
  t.rowName = rowName; t.colName = colName;
  return t;
};
const put = (t, x, y) => t.add(x ? 0 : 1, y ? 0 : 1);

/**
 * Collider (Berkson's paradox): two independent alarms X, Y ~ Bernoulli(p); only the cases
 * where at least one fired are kept (S = X ∨ Y). Category: causal.
 * In the whole population X ⊥ Y; among the selected, P(Y | X, S) = p but P(Y | ¬X, S) = 1
 * (if X did not fire, Y must have); the selected table is (p², p(1−p) / p(1−p), 0) up to scale, so
 * φ = −p²(1−p)² / (p²(1−p)) = −(1 − p) = −0.7 for p = 0.3, and χ² = N_S φ² ≈ 0.49·N_S
 * (Lemma 2). The dependence is created by the selection, not by any link between X and Y.
 */
export function collider(rng, { p = 0.3, N = 100000 } = {}) {
  const all = table2('X', 'Y'), selected = table2('X', 'Y');
  for (let n = 0; n < N; n++) {
    const x = bern(rng, p), y = bern(rng, p);
    put(all, x, y);
    if (x || y) put(selected, x, y);
  }
  return { all, selected };
}

/**
 * Confounder (fork X ← Z → Y), with no arrow X → Y. Category: causal.
 * Default story (synthetic): Z = "legacy device" ~ Bernoulli(0.4); X = "old OS" with
 * P(X | Z) = 0.8 vs 0.2; Y = "infected" with P(Y | Z) = 0.3 vs 0.05, whatever X is.
 * Marginally X and Y are associated (both follow Z); within each stratum of Z they are
 * independent (Lemma 1: P(x, y | z) = P(x | z) P(y | z)).
 * randomised: X is set by a fair coin instead (an experiment), cutting the arrow Z → X;
 * then X ⊥ Z and the association disappears (Lemma 3).
 * @returns {{marginal: ContingencyTable, strata: ContingencyTable[], pZ: number}}
 */
export function confounder(rng, { N = 20000, pZ = 0.4, pX = [0.2, 0.8], pY = [0.05, 0.3], randomised = false } = {}) {
  const marginal = table2('old OS', 'infected');
  const strata = [table2('old OS', 'infected'), table2('old OS', 'infected')];   // Z = no, Z = yes
  let nz = 0;
  for (let n = 0; n < N; n++) {
    const z = bern(rng, pZ);
    const x = randomised ? bern(rng, 0.5) : bern(rng, pX[+z]);
    const y = bern(rng, pY[+z]);
    nz += z;
    put(marginal, x, y); put(strata[+z], x, y);
  }
  strata[0].stratum = 'no legacy device'; strata[1].stratum = 'legacy device';
  return { marginal, strata, pZ: nz / N };
}

/**
 * Mediator (chain X → M → Y). Category: causal.
 * Default story (synthetic): X = "clicked a phishing link" ~ Bernoulli(0.3); M = "credentials
 * stolen" with P(M | X) = 0.6 vs 0.05; Y = "account misused" with P(Y | M) = 0.5 vs 0.02.
 * X and Y are associated, and X does affect Y — through M. Within a stratum of M the
 * association vanishes: conditioning on a mediator removes the effect that flows through it
 * (the direct effect here is zero, the total effect is not).
 */
export function mediator(rng, { N = 20000, pX = 0.3, pM = [0.05, 0.6], pY = [0.02, 0.5] } = {}) {
  const marginal = table2('clicked', 'misused');
  const strata = [table2('clicked', 'misused'), table2('clicked', 'misused')];   // M = no, M = yes
  for (let n = 0; n < N; n++) {
    const x = bern(rng, pX), m = bern(rng, pM[+x]), y = bern(rng, pY[+m]);
    put(marginal, x, y); put(strata[+m], x, y);
  }
  strata[0].stratum = 'credentials not stolen'; strata[1].stratum = 'credentials stolen';
  return { marginal, strata };
}

/** P(Y = yes | X = yes) and P(Y = yes | X = no) from a 2 × 2 table (rows X yes/no, cols Y yes/no). */
export function rates(t) {
  const [a, b, c, d] = t.O;
  return { yes: a / (a + b), no: c / (c + d) };
}

/**
 * Back-door adjustment over the strata of Z: P(Y | do(X = x)) = Σ_z P(Y | X = x, Z = z) P(Z = z).
 * Category: causal (the back-door formula, Pearl 📌: valid when Z blocks every path into X and
 * is not a descendant of X). For the confounder model both values are ≈ P(Y): the causal effect
 * of the old OS is zero, although the raw rates differ.
 * @param {ContingencyTable[]} strata  one 2 × 2 table per value of Z
 */
export function backdoor(strata) {
  const n = strata.map((t) => t.N), N = n.reduce((s, v) => s + v, 0);
  const r = strata.map(rates);
  return {
    yes: r.reduce((s, ri, z) => s + ri.yes * (n[z] / N), 0),
    no: r.reduce((s, ri, z) => s + ri.no * (n[z] / N), 0),
  };
}

/**
 * Positive predictive value of a detector, by Bayes' theorem.
 * Category: causal / Bayes. PPV = P(target | alarm) = sπ / (sπ + (1 − t)(1 − π)), with
 * sensitivity s, specificity t, prevalence π ([[Bayes theorem and base rates]], Corollary).
 * s = t = 0.99: PPV = 0.5 at π = 10⁻², 0.0902 at 10⁻³, 0.00099 at 10⁻⁵.
 */
export const ppv = ({ s, t, pi }) => (s * pi) / (s * pi + (1 - t) * (1 - pi));

/** The expected 2 × 2 table (target yes/no × alarm yes/no) for a population, rounded to people. */
export function baseRateTable({ s, t, pi, population = 1e6 }) {
  const targets = population * pi, others = population - targets;
  return ContingencyTable.fromCounts(['target', 'not a target'], ['alarm', 'no alarm'], [
    [Math.round(targets * s), Math.round(targets * (1 - s))],
    [Math.round(others * (1 - t)), Math.round(others * t)],
  ]);
}
