/* datasets.js — the datasets of the procedure page as streams of records: each
   record is one observation (x, f), given as the indices (i, j) of its row and its
   column, in the order in which the records "arrive" (E2). The full table is the
   count of all of them; a prefix of the stream is the table after the first n.
   Pure, no DOM. The seeded ones draw from their own sub-stream of the page seed
   (experiments.stream), so the same seed always gives the same records.
     berkeley — the 4526 applications of 1973, pooled over the six departments, in a
                seeded random order (the published data are counts, not a sequence);
     good     — consecutive outputs of xoshiro128**, 2 bits each (k = 4);
     lcgLow   — the same from the low 2 bits of the textbook LCG;
     square   — X uniform on {−1, 0, 1} and Y = X²: dependent, yet uncorrelated;
     csv      — two columns of the reader's file, in file order. */

import { ContingencyTable, Binning } from './table.js';
import { source } from './generators.js';
import { stream } from './experiments.js';
import { DEPARTMENTS, GENDERS, OUTCOMES } from '../../data/berkeley.js';

/** The stream ids of this module (experiments.js uses 1–6). */
const ID = { shuffle: 7, generator: 8, square: 9 };

export const DATASETS = {
  berkeley: 'Berkeley 1973, pooled · gender × admission',
  good: 'a good generator · one output × the next (k = 4)',
  lcgLow: 'a linear congruential generator (LCG), last 2 bits · one output × the next',
  square: 'Y = X² · X uniform on −1, 0, 1',
  csv: 'your CSV file',
};

/** Records of the generator datasets: 4000 pairs, about 250 per cell of the 4 × 4 table. */
export const GENERATOR_PAIRS = 4000;
/** Records of the Y = X² example. */
export const SQUARE_N = 300;

/** A stream of records over fixed row and column labels. */
const records = (rows, cols, xi, fj, extra = {}) => ({ rows, cols, xi, fj, N: xi.length, ...extra });

/**
 * The table after the first n records of a stream (n = N: the full table).
 * Category: table (step 1, O_ij += 1 per record). Labels with no record keep their
 * row or column of zeros; chiSquare drops them before testing.
 */
export function tableOf(d, n = d.N) {
  const t = new ContingencyTable(d.rows, d.cols);
  for (let k = 0; k < n; k++) t.add(d.xi[k], d.fj[k]);
  return t;
}

/** Continue a table from record `from` to record `to` (the stream's next chunk). */
export function extend(t, d, from, to) {
  for (let k = from; k < to; k++) t.add(d.xi[k], d.fj[k]);
  return t;
}

/** Berkeley pooled: one record per application, shuffled by Fisher–Yates with the seed. */
export function berkeley(seed) {
  const cells = [];   // [gender, outcome, count]
  for (const d of DEPARTMENTS) {
    const [ma, mr, wa, wr] = d.counts;
    cells.push([0, 0, ma], [0, 1, mr], [1, 0, wa], [1, 1, wr]);
  }
  const N = cells.reduce((s, c) => s + c[2], 0);
  const xi = new Uint8Array(N), fj = new Uint8Array(N);
  let k = 0;
  for (const [i, j, n] of cells) for (let q = 0; q < n; q++) { xi[k] = i; fj[k] = j; k++; }
  const rng = stream(seed, ID.shuffle);
  for (let a = N - 1; a > 0; a--) {
    const b = rng.int(a + 1);
    [xi[a], xi[b]] = [xi[b], xi[a]];
    [fj[a], fj[b]] = [fj[b], fj[a]];
  }
  return records(GENDERS, OUTCOMES, xi, fj, { order: 'in a random order set by the seed' });
}

/** A generator: N non-overlapping pairs (s₁, s₂), (s₃, s₄), … of symbols in {0, 1, 2, 3}.
 *  The LCG is seeded with the page seed itself (any seed shows the same failure: its low 2
 *  bits cycle with period 4, generators.js), xoshiro with its own sub-stream. */
export function generator(kind, seed, N = GENERATOR_PAIRS) {
  const k = 4, labels = ['0', '1', '2', '3'];
  const next = source(kind, { seed: kind === 'lcgLow' ? seed : stream(seed, ID.generator).u32(), k });
  const xi = new Uint8Array(N), fj = new Uint8Array(N);
  for (let n = 0; n < N; n++) { xi[n] = next(); fj[n] = next(); }
  return records(labels.map((l) => `s = ${l}`), labels.map((l) => `next ${l}`), xi, fj, { order: 'as the generator produces them' });
}

/** Y = X² with X uniform on {−1, 0, 1}: Y is a function of X (V = 1), yet Cov(X, Y) =
 *  E[X³] − E[X]E[X²] = 0 ([[Independence in probability]] Lemma 5). The sample correlation
 *  of the numbers is returned with the records, to set beside the table's verdict. */
export function square(seed, N = SQUARE_N) {
  const rng = stream(seed, ID.square);
  const xi = new Uint8Array(N), fj = new Uint8Array(N);
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (let n = 0; n < N; n++) {
    const x = rng.int(3) - 1, y = x * x;
    xi[n] = x + 1; fj[n] = y;
    sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y;
  }
  const cov = sxy / N - (sx / N) * (sy / N);
  const r = cov / Math.sqrt((sxx / N - (sx / N) ** 2) * (syy / N - (sy / N) ** 2));
  return records(['X = −1', 'X = 0', 'X = 1'], ['Y = 0', 'Y = 1'], xi, fj, { order: 'as drawn', correlation: r });
}

/** At most this many categories of a text column are kept; the rest become "other". */
export const MAX_LEVELS = 12;

/**
 * Two columns of a parsed CSV as a stream of records (steps 0–1 for a file).
 * Category: table. Numeric columns are binned (equal width or quantile, `bins` bins) with
 * edges fixed from the column alone, before any test; text columns keep their labels,
 * sorted, and if there are more than MAX_LEVELS the MAX_LEVELS − 1 most frequent are kept
 * and the others merged into "other" (merging is a function of the value, so it cannot
 * create a dependence, Lemma 3; it can hide one).
 * @param {{x: *, f: *}[]} pairs  from csv.pairsFrom
 * @param {{xNumeric: boolean, fNumeric: boolean, binning: 'quantile'|'equalWidth', bins: number}} o
 */
export function fromCSV(pairs, { xNumeric, fNumeric, binning = 'quantile', bins = 4 }) {
  const side = (values, numeric) => {
    if (numeric) {
      const b = Binning[binning](values, bins);
      return { labels: b.labels(), index: (v) => b.index(v), merged: 0, binned: b.k };
    }
    const freq = new Map();
    for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
    let keep = [...freq.keys()];
    let merged = 0;
    if (keep.length > MAX_LEVELS) {
      keep = keep.sort((a, b) => freq.get(b) - freq.get(a)).slice(0, MAX_LEVELS - 1);
      merged = freq.size - keep.length;
    }
    keep.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const labels = merged ? [...keep, 'other'] : keep;
    const at = new Map(keep.map((l, i) => [l, i]));
    return { labels, index: (v) => at.get(v) ?? keep.length, merged, binned: 0 };
  };
  const X = side(pairs.map((p) => p.x), xNumeric), F = side(pairs.map((p) => p.f), fNumeric);
  const N = pairs.length, xi = new Uint16Array(N), fj = new Uint16Array(N);
  pairs.forEach((p, k) => { xi[k] = X.index(p.x); fj[k] = F.index(p.f); });
  return records(X.labels, F.labels, xi, fj, { order: 'in file order', mergedX: X.merged, mergedF: F.merged, binnedX: X.binned, binnedF: F.binned });
}
