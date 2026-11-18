/* interpret.js — step 10 of the procedure: the decision and what it means, as the
   "result triple" every test on these pages reports (draft §6.0):
     1. evidence — χ², df, p (and log₁₀ p);
     2. strength — Cramér's V, and Î in bits next to its bias baseline;
     3. meaning  — one sentence on what the result does and does not say.
   The sentences never use causal verbs: a χ² test establishes association, and says
   nothing about which way, or whether, one variable acts on the other (note 04 §1).
   Interpretation rules: note 03 §2. Plain strings, no DOM. */

import { sup } from '../../../assets/js/ui/format.js';
import { detectableW } from './tests.js';

/** A p-value as text, exact even when p underflows: from log₁₀ p, "7.8 × 10⁻²²". */
export function pText({ p, log10p }) {
  if (p >= 1e-4) return p >= 0.995 ? p.toFixed(3) : String(Number(p.toPrecision(2)));
  const e = Math.floor(log10p), mant = 10 ** (log10p - e);
  return mant >= 9.95 ? `10${sup(e + 1)}` : `${mant.toFixed(1)} × 10${sup(e)}`;
}

/**
 * A word for the size of V, from Cohen's conventional thresholds for w (0.1 small, 0.3 medium,
 * 0.5 large; V = w for a 2 × 2 table). Category: interpretation. These are conventions, not
 * laws [O]: a V of 0.05 is negligible in a survey and alarming in a cipher.
 */
export function strengthWord(V) {
  return V < 0.1 ? 'negligible' : V < 0.3 ? 'weak' : V < 0.5 ? 'moderate' : 'strong';
}

/**
 * The result triple of a χ² test of independence.
 * Category: interpretation.
 * Rules (note 03 §2): reject → "evidence of association", then how strong and where;
 * do not reject → "no evidence at this sample size", never "independent", with the effect the
 * test could have detected (80 % power); large N → effect size decides relevance.
 * @param {{chi2, df, p, log10p, N, r, c}} test  from tests.chiSquare
 * @param {{cramerV}} eff  from tests.effectSizes
 * @param {{mutualInfoBits, biasBits}} g  from tests.gTest
 * @param {number} alpha
 * @returns {{reject: boolean, evidence: string, strength: string, meaning: string}}
 */
export function resultTriple(test, eff, g, alpha) {
  const reject = test.p <= alpha;
  const V = eff.cramerV, word = strengthWord(V);
  const evidence = `χ² = ${Number(test.chi2.toPrecision(5))} on ${test.df} df, p = ${pText(test)}: ${reject ? 'reject' : 'do not reject'} independence at α = ${alpha}.`;
  const strength = `V = ${V.toFixed(3)} (${word}); Î = ${g.mutualInfoBits.toPrecision(3)} bits, against ${g.biasBits.toPrecision(2)} bits expected from noise alone.`;
  let meaning;
  if (reject) {
    meaning = `Evidence of association; the association is ${word} (V = ${V.toFixed(2)}).`
      + (word === 'negligible' ? ' With this many observations even a negligible association is significant: significance is not importance.' : '')
      + ' By itself this says nothing about cause: the same table arises if X acts on F, F on X, or both follow a third variable.';
  } else {
    const w80 = detectableW({ df: test.df, N: test.N, alpha }), m = Math.min(test.r, test.c) - 1;
    meaning = `No evidence of association at this sample size. That is not proof of independence: with N = ${test.N}, this test has 80 % power only against effects with V ≥ ${(w80 / Math.sqrt(m)).toFixed(2)}.`;
  }
  return { reject, evidence, strength, meaning };
}
