/* tests.js — the tests and measures computed from a contingency table: Pearson's χ²
   with its residuals, validity check and p-value (in logs too); the 2 × 2 extras
   (shortcut formula, Yates, odds ratio); the effect sizes φ² and Cramér's V; the
   G-test and the mutual information in bits; Cochran–Mantel–Haenszel for a stack of
   2 × 2 tables; Welch's t (for the side-channel comparison); and the power of the χ²
   test, from the noncentral χ² law. Steps 6–9 of the procedure (note 01 §1).
   Pure functions of a ContingencyTable (or of plain numbers); no DOM.
   [[Pearson chi-square test of independence]], [[Effect size - phi and Cramer's V]],
   [[Mutual information and the G-test]], [[Power of the chi-square test]]. */

import { gammaQ, lnGammaQ, lnGamma } from '../../../assets/js/core/stats.js';
import { betaInc, lnBetaInc, chi2Inv } from '../../../assets/js/core/numeric.js';

const LN10 = Math.LN10, LN2 = Math.LN2;

/* ---------- the χ² tail ---------- */

/**
 * The upper tail P(χ²_df ≥ x): the p-value of a χ² statistic, also as log₁₀ p.
 * Category: test. Formula: P(χ²_df ≥ x) = Q(df/2, x/2), the regularised upper incomplete
 * gamma (the χ² density integrated from x to ∞, HW6's tail integrals again). When p is
 * below the smallest double (χ² = 70 000 on 225 df has p ≈ 10^−14875), p prints as 0
 * but log₁₀ p is still exact, from ln Q computed in logs (stats.js lnGammaQ).
 * @returns {{p: number, log10p: number}}
 */
export function chi2Tail(x, df) {
  if (!(x > 0)) return { p: 1, log10p: 0 };
  const lnQ = lnGammaQ(df / 2, x / 2);
  return { p: lnQ < -700 ? Math.exp(lnQ) : gammaQ(df / 2, x / 2), log10p: lnQ / LN10 };
}

/* ---------- Pearson's χ² test of independence ---------- */

/**
 * Rule of thumb for the χ² approximation (draft §4.1; [[Pearson chi-square test of
 * independence]], practical conditions): OK if every E_ij ≥ 5; acceptable if at most 20 % are below 5 and none below 1; doubtful if more than
 * 20 % of the cells have E < 5 or any has E < 1; invalid if any has E < 0.5.
 * Category: test (validity). Below these sizes the counts are too discrete for the
 * continuous χ² law, and the p-value can be off by a factor of two or more.
 */
export function validity(E) {
  const flat = E.flat(), cells = flat.length;
  const below5 = flat.filter((e) => e < 5).length, below1 = flat.filter((e) => e < 1).length;
  const below05 = flat.filter((e) => e < 0.5).length;
  const level = below05 > 0 ? 'invalid' : (below5 / cells > 0.2 || below1 > 0) ? 'doubtful' : below5 > 0 ? 'acceptable' : 'ok';
  return { level, cells, below5, below1, below05, minE: Math.min(...flat) };
}

/**
 * Pearson's χ² test of independence (steps 5–8).
 * Category: test.
 * Formulas: E_ij = R_i C_j / N; residual r_ij = (O_ij − E_ij)/√E_ij; χ² = Σ r_ij²;
 * df = (r − 1)(c − 1), after dropping empty rows and columns; p = Q(df/2, χ²/2).
 * Why: under H₀ (X ⊥ F) each residual is roughly a standard normal and they live in a
 * space of dimension (r − 1)(c − 1) (they sum to zero along every row and column,
 * Lemma 1), so χ² is approximately χ²_df (Theorem 1, Pearson 1900, df by Fisher 1922).
 * Under dependence χ²/N → φ²_pop > 0, so χ² grows linearly with N.
 * @param {import('./table.js').ContingencyTable} table
 */
export function chiSquare(table) {
  const { table: t, droppedRows, droppedCols } = table.dropEmpty();
  const E = t.expected(), O = t.matrix();
  const residuals = O.map((row, i) => row.map((o, j) => (o - E[i][j]) / Math.sqrt(E[i][j])));
  let chi2 = 0;
  for (const row of residuals) for (const r of row) chi2 += r * r;
  const df = (t.r - 1) * (t.c - 1);
  const tail = df > 0 ? chi2Tail(chi2, df) : { p: 1, log10p: 0 };
  return { chi2, df, ...tail, N: t.N, r: t.r, c: t.c, table: t, expected: E, residuals, validity: validity(E), droppedRows, droppedCols };
}

/** Cramér's V and φ² (step 9). Category: effect size.
 *  φ² = χ²/N, V = √(χ² / (N (min(r, c) − 1))) ∈ [0, 1] (Lemma 1: χ² ≤ N(min(r, c) − 1)).
 *  V does not grow with N: it estimates the population effect w (Lemma 2), which the
 *  p-value cannot tell apart from the sample size. For a 2 × 2 table V = |φ|, the
 *  correlation of the two 0/1 indicators. */
export function effectSizes({ chi2, N, r, c }) {
  const m = Math.min(r, c) - 1;
  return { phi2: chi2 / N, cramerV: m > 0 ? Math.sqrt(chi2 / (N * m)) : 0 };
}

/**
 * The 2 × 2 extras, for the table (a b / c d).
 * Category: test.
 * - shortcut χ² = N(ad − bc)² / ((a+b)(c+d)(a+c)(b+d)) (Lemma 3: every residual is ±(ad − bc)/N);
 * - signed φ = (ad − bc)/√(product of the margins), so χ² = Nφ²;
 * - Yates' continuity correction N(|ad − bc| − N/2)² / (…): conservative, shown, not used;
 * - odds ratio OR = ad/(bc), with the 95 % interval exp(ln OR ± 1.96 √(1/a + 1/b + 1/c + 1/d))
 *   (Woolf); if a cell is 0, 0.5 is added to every cell first (Haldane), and `corrected` says so.
 */
export function twoByTwo(table) {
  if (table.r !== 2 || table.c !== 2) return null;
  const [a, b, c, d] = table.O, N = a + b + c + d;
  const den = (a + b) * (c + d) * (a + c) * (b + d);
  const ad_bc = a * d - b * c;
  const shortcut = (N * ad_bc * ad_bc) / den;
  const yatesNum = Math.max(0, Math.abs(ad_bc) - N / 2);
  const yates = (N * yatesNum * yatesNum) / den;
  const corrected = a === 0 || b === 0 || c === 0 || d === 0;
  const [A, B, Cc, D] = corrected ? [a + 0.5, b + 0.5, c + 0.5, d + 0.5] : [a, b, c, d];
  const lnOR = Math.log((A * D) / (B * Cc)), se = Math.sqrt(1 / A + 1 / B + 1 / Cc + 1 / D);
  return {
    shortcut, phi: ad_bc / Math.sqrt(den),
    yates, yatesP: chi2Tail(yates, 1).p,
    oddsRatio: Math.exp(lnOR), orLow: Math.exp(lnOR - 1.96 * se), orHigh: Math.exp(lnOR + 1.96 * se), corrected,
  };
}

/* ---------- mutual information and the G-test ---------- */

/**
 * The plug-in mutual information Î and the G-test (step 9).
 * Category: information.
 * Formulas: Î = Σ p̂_ij log₂(p̂_ij / (p̂_i· p̂_·j)) = Σ (O_ij/N) log₂(O_ij/E_ij) bits (empty cells
 * contribute 0); G = 2 Σ O_ij ln(O_ij/E_ij) = 2N Î ln 2, the likelihood-ratio statistic of
 * independence (Lemma 3), on the same df as χ², and close to it when the counts are large.
 * Bias: under independence E[Î] ≈ (r − 1)(c − 1)/(2N ln 2) bits (Lemma 4, Miller–Madow), so an
 * "information" of that size is just noise; `biasBits` is shown next to Î.
 */
export function gTest(table) {
  const { table: t } = table.dropEmpty();
  const E = t.expected(), N = t.N;
  let G = 0;
  for (let i = 0; i < t.r; i++) for (let j = 0; j < t.c; j++) {
    const o = t.at(i, j);
    if (o > 0) G += 2 * o * Math.log(o / E[i][j]);
  }
  const df = (t.r - 1) * (t.c - 1);
  const mutualInfoBits = G / (2 * N * LN2);
  return { G, df, ...(df > 0 ? chi2Tail(G, df) : { p: 1, log10p: 0 }), mutualInfoBits, biasBits: df / (2 * N * LN2) };
}

/** Shannon entropy of the row margin, H(X) = −Σ (R_i/N) log₂(R_i/N), and of the column margin:
 *  the upper bounds of Î (Lemma 2: I(X; F) ≤ min(H(X), H(F)), equality when one determines the other). */
export function marginEntropies(table) {
  const N = table.N;
  const H = (v) => -v.reduce((s, x) => s + (x > 0 ? (x / N) * Math.log2(x / N) : 0), 0);
  return { HX: H(table.R), HF: H(table.C) };
}

/* ---------- stratified analysis: Cochran–Mantel–Haenszel ---------- */

/**
 * Is X independent of F within every stratum? The CMH test for a stack of K 2 × 2 tables.
 * Category: test (conditional independence; Berkeley: gender ⊥ admission | department).
 * Formulas, with a_k the top-left cell, n_k the stratum total and R, C its margins:
 *   E[a_k] = R_1k C_1k / n_k,  Var[a_k] = R_1k R_2k C_1k C_2k / (n_k² (n_k − 1))  (hypergeometric),
 *   CMH = (Σ (a_k − E a_k))² / Σ Var a_k ~ χ²₁ under H₀; with continuity correction
 *   (|Σ (a_k − E a_k)| − ½)² / Σ Var a_k.
 *   Mantel–Haenszel common odds ratio = Σ a_k d_k / n_k ÷ Σ b_k c_k / n_k.
 * Why: deviations in the same direction add up across strata, opposite ones cancel; unlike the
 * pooled table, the strata are never mixed, so a stratum variable cannot create or hide the
 * association (no Simpson). Source: Mantel & Haenszel (1959) 📌.
 * @param {import('./table.js').ContingencyTable[]} strata  2 × 2 tables
 */
export function cmh(strata) {
  let dev = 0, v = 0, num = 0, den = 0;
  for (const t of strata) {
    const [a, b, c, d] = t.O, n = a + b + c + d;
    if (n < 2) continue;
    const R1 = a + b, R2 = c + d, C1 = a + c, C2 = b + d;
    dev += a - (R1 * C1) / n;
    v += (R1 * R2 * C1 * C2) / (n * n * (n - 1));
    num += (a * d) / n; den += (b * c) / n;
  }
  const stat = (dev * dev) / v, corr = Math.max(0, Math.abs(dev) - 0.5) ** 2 / v;
  return { cmh: stat, ...chi2Tail(stat, 1), cmhCorrected: corr, pCorrected: chi2Tail(corr, 1).p, mhOR: num / den };
}

/* ---------- Welch's t (for the side-channel comparison) ---------- */

/**
 * Welch's two-sample t-test of equal means, without assuming equal variances.
 * Category: test (the TVLA leakage test compares only means; the χ² test compares whole
 * distributions, [[Chi-square leakage detection in side channels]]).
 * Formulas: t = (x̄₁ − x̄₂)/√(s₁²/n₁ + s₂²/n₂); Welch–Satterthwaite
 *   ν = (s₁²/n₁ + s₂²/n₂)² / ((s₁²/n₁)²/(n₁ − 1) + (s₂²/n₂)²/(n₂ − 1));
 *   two-sided p = I_{ν/(ν + t²)}(ν/2, ½) (the Student tail as an incomplete beta), also in logs.
 */
export function welchT(xs, ys) {
  const stat = (v) => {
    let m = 0; for (const x of v) m += x; m /= v.length;
    let s = 0; for (const x of v) s += (x - m) ** 2;
    return { n: v.length, mean: m, v: s / (v.length - 1) };
  };
  const a = stat(xs), b = stat(ys);
  if (a.n < 2 || b.n < 2) return { t: NaN, df: NaN, p: NaN, log10p: NaN };
  const ua = a.v / a.n, ub = b.v / b.n;
  const t = (a.mean - b.mean) / Math.sqrt(ua + ub);
  const df = (ua + ub) ** 2 / (ua * ua / (a.n - 1) + ub * ub / (b.n - 1));
  const x = df / (df + t * t);
  const lnP = lnBetaInc(x, df / 2, 0.5);
  return { t, df, p: lnP < -700 ? Math.exp(lnP) : betaInc(x, df / 2, 0.5), log10p: lnP / LN10, meanA: a.mean, meanB: b.mean };
}

/* ---------- power ---------- */

/**
 * Survival function of the noncentral χ²: P(χ²_df(λ) > x).
 * Category: test (power). χ²_df(λ) is the law of Σ (Z_k + μ_k)² with Σ μ_k² = λ; it is a Poisson
 * mixture of central laws: P(χ²_df(λ) > x) = Σ_k e^{−λ/2} (λ/2)^k / k! · Q(df/2 + k, x/2).
 * The weights are computed in logs (e^{−λ/2} underflows for λ > 1490) and the sum runs outwards
 * from the most likely k until the terms fall below 10⁻¹⁵ of the total.
 */
export function ncx2Sf(x, df, lambda) {
  if (lambda <= 0) return gammaQ(df / 2, x / 2);
  const h = lambda / 2, mode = Math.floor(h);
  const term = (k) => Math.exp(-h + k * Math.log(h) - lnGamma(k + 1)) * gammaQ(df / 2 + k, x / 2);
  let sum = term(mode);
  for (let k = mode + 1; ; k++) { const t = term(k); sum += t; if (t < 1e-15 * sum && k > mode + 5) break; }
  for (let k = mode - 1; k >= 0; k--) { const t = term(k); sum += t; if (t < 1e-15 * sum && k < mode - 5) break; }
  return Math.min(1, sum);
}

/**
 * Asymptotic power of the χ² test against a population effect w (Cohen's w, = φ_pop).
 * Category: test (power). Under the alternative χ² ≈ χ²_df(λ) with λ = N w² ([[Power of the
 * chi-square test]], Theorem), so power ≈ P(χ²_df(Nw²) > χ²_{df, 1−α}).
 * With few expected counts per cell the approximation is optimistic (the sticky generator at
 * N = 2015: 0.80 predicted, about 0.75 simulated).
 */
export function power({ df, N, w, alpha }) {
  return ncx2Sf(chi2Inv(1 - alpha, df), df, N * w * w);
}

/* bisection on an increasing function of t ∈ [lo, hi] for the value where it reaches target */
function solve(f, target, lo, hi) {
  while (f(hi) < target) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-9 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Sample size for a target power against effect w: the N where power({df, N, w, alpha}) = target.
 *  Grows like 1/w²: halving the effect quadruples the data. Returns the real solution and its ceiling. */
export function sampleSize({ df, w, alpha, target = 0.8 }) {
  const c = chi2Inv(1 - alpha, df);
  const lambda = solve((l) => ncx2Sf(c, df, l), target, 0, Math.max(1, df));
  const N = lambda / (w * w);
  return { N, n: Math.ceil(N), lambda };
}

/** The smallest effect w detectable with the given power at sample size N (λ = N w²). */
export function detectableW({ df, N, alpha, target = 0.8 }) {
  const { lambda } = sampleSize({ df, w: 1, alpha, target });
  return Math.sqrt(lambda / N);
}
