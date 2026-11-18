/* table.js — the contingency table and everything read off it: margins, joint,
   marginal and conditional frequencies, the expected counts under independence,
   and the binning that turns numbers into categories. Steps 0–5 of the procedure
   (note 01 §1). Pure, no DOM: runs in the page, in the worker and under Node.
   Counts are integers (Uint32Array); every frequency is a ratio of integers,
   computed only when asked for, so nothing here is approximate until a p-value.
   [[Contingency tables and relative frequencies]], [[Maximum likelihood under independence]]. */

import { quantile } from '../../../assets/js/core/stats.js';

export class ContingencyTable {
  /**
   * An r × c table of zeros, rows = categories of X, columns = categories of F.
   * @param {string[]} rows  labels of X
   * @param {string[]} cols  labels of F
   */
  constructor(rows, cols) {
    this.rows = rows.map(String);
    this.cols = cols.map(String);
    this.O = new Uint32Array(this.rows.length * this.cols.length);   // row-major: O[i·c + j]
  }

  get r() { return this.rows.length; }
  get c() { return this.cols.length; }

  /** O_ij, the observed count of the pair (row i, column j). */
  at(i, j) { return this.O[i * this.c + j]; }

  /** Count one more pair (step 1: O_ij += 1). Category: table. */
  add(i, j, w = 1) { this.O[i * this.c + j] += w; return this; }

  /** The table as an array of rows (for display and export). */
  matrix() { return this.rows.map((_, i) => Array.from(this.O.subarray(i * this.c, (i + 1) * this.c))); }

  /** Grand total N = Σ O_ij. */
  get N() { let s = 0; for (const o of this.O) s += o; return s; }

  /** Row totals R_i = Σ_j O_ij (step 2). */
  get R() { return this.rows.map((_, i) => { let s = 0; for (let j = 0; j < this.c; j++) s += this.at(i, j); return s; }); }

  /** Column totals C_j = Σ_i O_ij (step 2). */
  get C() { return this.cols.map((_, j) => { let s = 0; for (let i = 0; i < this.r; i++) s += this.at(i, j); return s; }); }

  /** Joint relative frequencies p̂_ij = O_ij / N (step 3): the empirical joint distribution. */
  joint() { const N = this.N; return this.matrix().map((row) => row.map((o) => o / N)); }

  /** Row profiles p̂(j | i) = O_ij / R_i (step 4): "among units with X = i, the share with F = j".
   *  Each row sums to 1; the column margin C_j/N is their R_i/N-weighted average (Lemma 1),
   *  the structure behind Simpson's paradox. A row with R_i = 0 has no profile (NaN). */
  rowProfiles() { const R = this.R; return this.matrix().map((row, i) => row.map((o) => o / R[i])); }

  /** Column profiles p̂(i | j) = O_ij / C_j (step 4). */
  colProfiles() { const C = this.C; return this.matrix().map((row) => row.map((o, j) => o / C[j])); }

  /** Expected counts under independence E_ij = R_i C_j / N (step 5).
   *  Category: table (the MLE of the counts under p_ij = a_i b_j, [[Maximum likelihood under
   *  independence]] Theorem 2: the fitted margins are the observed ones, a_i = R_i/N, b_j = C_j/N,
   *  so the best independent table is the outer product of the margins, divided by N).
   *  Returned as doubles: R_i C_j / N is rarely an integer, which is why exact empirical
   *  independence O = E almost never happens (Lemma 3). */
  expected() {
    const R = this.R, C = this.C, N = this.N;
    return R.map((ri) => C.map((cj) => (ri * cj) / N));
  }

  /** The cells that can be chosen freely once the margins are fixed: the first r − 1 rows
   *  and c − 1 columns. The last row and column are then forced by the margins, which is
   *  why df = (r − 1)(c − 1) ([[Maximum likelihood under independence]], Corollary). */
  isFree(i, j) { return i < this.r - 1 && j < this.c - 1; }

  /** The same table without empty rows and columns, which carry no information and would
   *  give E_ij = 0 (division by zero in χ²). Category: table. The labels that were dropped
   *  are reported, so the page can say so. @returns {{table: ContingencyTable, droppedRows: string[], droppedCols: string[]}} */
  dropEmpty() {
    const R = this.R, C = this.C;
    const keepR = R.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    const keepC = C.map((v, j) => (v > 0 ? j : -1)).filter((j) => j >= 0);
    const t = new ContingencyTable(keepR.map((i) => this.rows[i]), keepC.map((j) => this.cols[j]));
    keepR.forEach((i, a) => keepC.forEach((j, b) => { t.O[a * t.c + b] = this.at(i, j); }));
    return {
      table: t,
      droppedRows: this.rows.filter((_, i) => R[i] === 0),
      droppedCols: this.cols.filter((_, j) => C[j] === 0),
    };
  }

  /** X and F swapped: the table of (F, X). Category: table. */
  transpose() {
    const t = new ContingencyTable(this.cols, this.rows);
    for (let i = 0; i < this.r; i++) for (let j = 0; j < this.c; j++) t.O[j * t.c + i] = this.at(i, j);
    return t;
  }

  /** A table from given counts. @param {number[][]} m  one array per row */
  static fromCounts(rows, cols, m) {
    const t = new ContingencyTable(rows, cols);
    m.forEach((row, i) => row.forEach((o, j) => { t.O[i * t.c + j] = o; }));
    return t;
  }

  /**
   * Steps 0–1 of the procedure: map each value to a category and count the pairs.
   * Category: table. Numeric columns are binned first (a Binning, below); categorical
   * ones keep their labels, in the order asked for.
   * @param {{x: *, f: *}[]} pairs
   * @param {{rowOrder?: string, colOrder?: string, binX?: Binning, binF?: Binning}} [o]
   *        order 'given' (first appearance), 'alpha' or 'frequency' (most frequent first)
   */
  static fromPairs(pairs, { rowOrder = 'given', colOrder = 'given', binX = null, binF = null } = {}) {
    const xs = pairs.map((p) => (binX ? binX.label(binX.index(p.x)) : String(p.x)));
    const fs = pairs.map((p) => (binF ? binF.label(binF.index(p.f)) : String(p.f)));
    const rows = binX ? binX.labels() : categories(xs, rowOrder);
    const cols = binF ? binF.labels() : categories(fs, colOrder);
    const t = new ContingencyTable(rows, cols);
    const ri = new Map(rows.map((l, i) => [l, i])), ci = new Map(cols.map((l, j) => [l, j]));
    for (let k = 0; k < pairs.length; k++) t.add(ri.get(xs[k]), ci.get(fs[k]));
    return t;
  }

  /** The table of two samples together: counts of identically labelled tables simply add.
   *  Category: table (the categorical twin of Chan's merge of Welford summaries, HW5: the
   *  table is a sufficient statistic, so counts from different machines or days can be
   *  combined and the raw records discarded, note 01 §1). */
  static merge(a, b) {
    if (a.rows.join('\u0000') !== b.rows.join('\u0000') || a.cols.join('\u0000') !== b.cols.join('\u0000')) {
      throw new Error('merge: the two tables must have the same row and column labels');
    }
    const t = new ContingencyTable(a.rows, a.cols);
    for (let k = 0; k < t.O.length; k++) t.O[k] = a.O[k] + b.O[k];
    return t;
  }
}

/* the distinct labels of a column, in the order asked for */
function categories(values, order) {
  const freq = new Map();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  const labels = [...freq.keys()];
  if (order === 'alpha') return labels.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (order === 'frequency') return labels.sort((a, b) => freq.get(b) - freq.get(a));
  return labels;
}

/* ---------- binning: numbers → categories (step 0) ---------- */

/** k bins with fixed edges e_0 < e_1 < … < e_k; value v goes to bin b with e_b ≤ v < e_{b+1}
 *  (the last bin also takes v = e_k; values outside are clamped into the end bins).
 *  Binning preserves independence (functions of independent variables are independent,
 *  [[Independence in probability]] Lemma 3), but can hide a dependence that lives inside
 *  a bin; and the bins must be fixed before looking at the test (note 01; trap T4). */
export class Binning {
  /** @param {number[]} edges  increasing, at least two */
  constructor(edges) {
    this.edges = edges;
    this.k = edges.length - 1;
  }

  /** The bin of v, by binary search on the edges. */
  index(v) {
    const e = this.edges;
    let lo = 0, hi = this.k - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (v >= e[mid]) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  label(b) { return `[${short(this.edges[b])}, ${short(this.edges[b + 1])}${b === this.k - 1 ? ']' : ')'}`; }
  labels() { return Array.from({ length: this.k }, (_, b) => this.label(b)); }

  /** k bins of equal width between the smallest and the largest value. */
  static equalWidth(values, k) {
    let lo = Infinity, hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi === lo) hi = lo + 1;
    return new Binning(Array.from({ length: k + 1 }, (_, b) => lo + ((hi - lo) * b) / k));
  }

  /** k bins at the pooled sample quantiles, so each holds about N/k values: no tiny
   *  expected counts. The edges come from the pooled values of the binned variable alone,
   *  which under H₀ carry no information about the other variable, so the test stays valid
   *  (draft §4.5). Repeated edges (many ties) are merged, so k may come out smaller. */
  static quantile(values, k) {
    const edges = Array.from({ length: k + 1 }, (_, b) => quantile(values, b / k));
    const kept = edges.filter((e, b) => b === 0 || e > edges[b - 1]);
    if (kept.length < 2) kept.push(kept[0] + 1);   // every value equal: a single bin
    return new Binning(kept);
  }

  /** Bins with edges chosen by the user. */
  static edges(list) { return new Binning([...list].sort((a, b) => a - b)); }
}

/* a short label for a bin edge: up to 4 significant digits */
const short = (v) => String(Number(v.toPrecision(4)));
