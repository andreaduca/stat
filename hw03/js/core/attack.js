/* attack.js — ciphertext-only key recovery for the Caesar cipher.
   Category: cryptanalysis (statistical). Note "Caesar statistical
   cryptanalysis" §0–§3, [[Chi-squared statistic]], [[Entropy, redundancy and
   unicity distance]], [[Confidence interval for a proportion]].

   THE IDEA IN ONE LINE. With 26 keys, search is free: decrypt with every k
   and ask "how much does this look like English?". The search is always the
   same exhaustive loop; the methods below differ ONLY in the recogniser,
   the scoring function:

       for k in 0..25:  candidate = Dec(c, k);  score[k] = score(candidate)
       return the k with the best score

   Brute force, frequency analysis and n-grams are therefore not three attacks
   but one search with six recognisers (note §2.5).

   Conventions: letters are 0..25 (Uint8Array); "decrypting with k" maps a
   ciphertext letter c to (c − k) mod 26; logarithms are natural (nats). */

import { wilson, median } from '../../../assets/js/core/stats.js';
import { SeededRng } from '../../../assets/js/core/rng.js';

/* ---------- the language model ---------- */

/** Probabilities and log-probabilities from the corpus counts.
 *  Smoothing (note §1.4): an n-gram never seen in training would have p = 0
 *  and log p = −∞, and one such n-gram would veto the right key. Unseen
 *  n-grams get a floor instead, log(0.01 / total): rarer than anything seen. */
export function buildLanguage(model, quadCounts) {
  const p = Float64Array.from(model.train.freq);
  const logp = p.map(Math.log);
  const bi = joint(model.train.bigrams);
  const quad = quadCounts ? joint(quadCounts) : { table: null, floor: null };
  return { p, logp, logBi: bi.table, logQuad: quad.table, floors: { 2: bi.floor, 4: quad.floor }, ic: model.train.ic, rates: model.train.entropyRates };
}

function joint(counts) {
  let total = 0;
  for (const c of counts) total += c;
  const floor = Math.fround(Math.log(0.01 / total));       // stored as float32, like the table
  return { table: Float32Array.from(counts, (c) => (c ? Math.log(c / total) : floor)), floor };
}

/** Text that is already normalised (A–Z) → letters 0..25. */
export const toLetters = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) - 65);
export const fromLetters = (x) => String.fromCharCode(...Array.from(x, (v) => v + 65));
export const shiftLetters = (x, k) => x.map((v) => (v + k + 26) % 26);

function letterCounts(c) {
  const counts = new Float64Array(26);
  for (const v of c) counts[v]++;
  return counts;
}

/* ---------- the six recognisers ----------
   Each returns score[k] for k = 0..25; `best` says whether high or low wins.
   cnt[(ℓ + k) mod 26] is O_ℓ(k), the count of plaintext letter ℓ after
   decrypting with k: decrypting maps cipher letter ℓ + k back to ℓ. */

const unigram = (fn) => (c, L) => {
  const cnt = letterCounts(c), n = c.length, out = new Float64Array(26);
  for (let k = 0; k < 26; k++) out[k] = fn((l) => cnt[(l + k) % 26], n, L);
  return out;
};

/** n-gram log-likelihood: Σᵢ log p(xᵢ … xᵢ₊ₙ₋₁) over the decrypted text.
 *  Captures order ("TH", "QU", "ING"), which unigram methods ignore. A text
 *  shorter than n has no n-gram at all: every key scores 0 — a 26-way tie. */
function ngram(n) {
  return (c, L) => {
    const table = n === 2 ? L.logBi : L.logQuad, out = new Float64Array(26);
    for (let k = 0; k < 26; k++) {
      let s = 0;
      for (let i = 0; i + n <= c.length; i++) {
        let idx = 0;
        for (let j = 0; j < n; j++) idx = idx * 26 + ((c[i + j] - k + 26) % 26);
        s += table[idx];
      }
      out[k] = s;
    }
    return out;
  };
}

export const METHODS = [
  {
    id: 'chi2', label: 'χ² distance', short: 'χ²', best: 'min', likelihood: 'chi2',
    formula: 'χ²(k) = Σ<sub>ℓ</sub> (O<sub>ℓ</sub>(k) − E<sub>ℓ</sub>)² / E<sub>ℓ</sub>, &nbsp;E<sub>ℓ</sub> = N·p<sub>ℓ</sub> &nbsp;→ smallest wins',
    idea: 'How far the decrypted letter counts are from the counts English would give, letter by letter.',
    // a DISTANCE, not a test: on short texts most E_ℓ < 5 and the χ² law does not apply (note §2.1)
    score: unigram((O, n, L) => { let s = 0; for (let l = 0; l < 26; l++) { const e = n * L.p[l]; s += (O(l) - e) ** 2 / e; } return s; }),
  },
  {
    id: 'loglik', label: 'log-likelihood, letters', short: 'ln L', best: 'max', likelihood: 'log',
    formula: 'ln L(k) = Σ<sub>i</sub> ln p<sub>(c<sub>i</sub> − k)</sub> = Σ<sub>ℓ</sub> O<sub>ℓ</sub>(k)·ln p<sub>ℓ</sub> &nbsp;→ largest wins',
    idea: 'The probability that English, letters drawn independently, would produce this decryption: the maximum-likelihood estimate of the key.',
    // MLE of k; with a uniform prior on k also the MAP guess. argmin G = argmax ln L exactly (note §2.2)
    score: unigram((O, n, L) => { let s = 0; for (let l = 0; l < 26; l++) s += O(l) * L.logp[l]; return s; }),
  },
  {
    id: 'corr', label: 'correlation', short: 'corr', best: 'max', likelihood: null,
    formula: 'corr(k) = Σ<sub>ℓ</sub> q<sub>ℓ</sub>(k)·p<sub>ℓ</sub>, &nbsp;q<sub>ℓ</sub>(k) = O<sub>ℓ</sub>(k)/N &nbsp;→ largest wins',
    idea: 'Line the decrypted histogram up with the English one: large when the tall bars sit on the tall bars.',
    score: unigram((O, n, L) => { let s = 0; for (let l = 0; l < 26; l++) s += (O(l) / n) * L.p[l]; return s; }),
  },
  {
    id: 'bigram', label: 'bigram log-likelihood', short: 'bigrams', best: 'max', likelihood: 'log', n: 2,
    formula: 'score(k) = Σ<sub>i</sub> ln p(x<sub>i</sub>x<sub>i+1</sub>), &nbsp;x = Dec<sub>k</sub>(c) &nbsp;→ largest wins',
    idea: 'How common every pair of neighbouring letters is in English: “TH” is common, “QX” never happens.',
    score: ngram(2),
  },
  {
    id: 'quadgram', label: 'quadgram log-likelihood', short: 'quadgrams', best: 'max', likelihood: 'log', n: 4,
    formula: 'score(k) = Σ<sub>i</sub> ln p(x<sub>i</sub>x<sub>i+1</sub>x<sub>i+2</sub>x<sub>i+3</sub>) &nbsp;→ largest wins',
    idea: 'The same with every run of four letters (“TION”, “THAT”): a much more detailed picture of English.',
    score: ngram(4),
  },
  {
    id: 'top', label: 'most frequent letter = E', short: 'top = E', best: 'max', likelihood: null,
    formula: 'score(k) = O<sub>E</sub>(k), the number of E’s after decrypting &nbsp;→ largest wins',
    idea: 'The textbook shortcut: assume the most common ciphertext letter stands for E. Not a full search — one bar of the histogram decides.',
    score: unigram((O) => O(4)),
  },
];
export const METHOD = Object.fromEntries(METHODS.map((m) => [m.id, m]));

/* ---------- one attack ---------- */

/** Run one recogniser over all 26 keys.
 *  Returns the scores, the keys ranked best-first, the set of keys tied for
 *  best, and — for the likelihood methods — the posterior P(k | c):
 *      P(k | c) = L(k) / Σⱼ L(j)        (uniform prior on the 26 keys, Bayes)
 *  computed as a softmax of ln L. For χ² the same with ln L ≈ −χ²/2 (for large
 *  N, χ² ≈ G = −2 ln L + const). The model is wrong — letters are not
 *  independent — so these probabilities are overconfident; they still say
 *  "clear winner" vs "close call" honestly. */
export function attack(c, method, L) {
  const m = typeof method === 'string' ? METHOD[method] : method;
  const scores = m.score(c, L);
  const better = (a, b) => (m.best === 'max' ? a > b : a < b);
  const order = [...Array(26).keys()].sort((a, b) => (better(scores[a], scores[b]) ? -1 : better(scores[b], scores[a]) ? 1 : a - b));
  const top = scores[order[0]];
  const ties = order.filter((k) => Math.abs(scores[k] - top) <= 1e-9 * Math.max(1, Math.abs(top)));
  let posterior = null;
  if (m.likelihood && c.length) {
    const ll = Array.from(scores, (s) => (m.likelihood === 'chi2' ? -s / 2 : s));
    const mx = Math.max(...ll);
    const w = ll.map((v) => Math.exp(v - mx));
    const z = w.reduce((a, b) => a + b, 0);
    posterior = w.map((v) => v / z);
  }
  return { method: m, scores, order, best: order[0], ties, posterior };
}

/** 1 + the number of keys scoring strictly better than key k. */
export function rankOf(result, k) {
  const { scores, method } = result;
  let r = 1;
  for (let j = 0; j < 26; j++) if (method.best === 'max' ? scores[j] > scores[k] : scores[j] < scores[k]) r++;
  return r;
}

/* ---------- score breakdowns, for the page ---------- */

/** Unigram methods: one term per letter of the decryption with key k. */
export function unigramTerms(c, k, method, L) {
  const cnt = letterCounts(c), n = c.length;
  return [...Array(26).keys()].map((l) => {
    const O = cnt[(l + k) % 26], E = n * L.p[l];
    const term = { chi2: E ? (O - E) ** 2 / E : 0, loglik: O * L.logp[l], corr: (O / n) * L.p[l], top: l === 4 ? O : 0 }[method];
    return { letter: String.fromCharCode(65 + l), O, E, p: L.p[l], term };
  });
}

/** n-gram methods: every n-gram of the decryption with its ln p (seen or floored). */
export function ngramTerms(c, k, n, L) {
  const table = n === 2 ? L.logBi : L.logQuad, floor = L.floors[n];
  const out = [];
  for (let i = 0; i + n <= c.length; i++) {
    let idx = 0, gram = '';
    for (let j = 0; j < n; j++) { const v = (c[i + j] - k + 26) % 26; idx = idx * 26 + v; gram += String.fromCharCode(65 + v); }
    out.push({ gram, logp: table[idx], unseen: table[idx] === floor });
  }
  return out;
}

/* ---------- unicity distance (note "Entropy, redundancy and unicity distance") ---------- */

/** U = H(K) / D: the ciphertext length at which, on average, only one key
 *  gives a plausible plaintext. H(K) = log₂26 for Caesar; D = log₂26 − H is
 *  the redundancy per letter that the model can SEE: with letter counts only,
 *  H = H₁ (independent letters); with n-grams, the entropy rate given the
 *  previous n − 1 letters. Measured from the corpus, not quoted. */
export function unicity(rates) {
  const HK = Math.log2(26);
  return rates.map((H, i) => ({ order: i + 1, H, D: HK - H, U: HK / (HK - H) }));
}

/* ---------- the experiment (note §3) ---------- */

export const LENGTHS = [1, 2, 3, 5, 10, 15, 20, 30, 50, 100, 200, 500];

/** Success rate vs length, every method on the SAME excerpts and keys
 *  (paired design: the curves differ by method, not by luck).
 *  For each length L and trial t: a random excerpt of L letters from a TEST
 *  book, a uniform random key, encrypt; every method guesses; a tie for best
 *  is broken at random (a 26-way tie = a blind guess, success 1/26).
 *  Each trial is a Bernoulli experiment → Wilson 95 % interval on the rate.
 *  Seeded PRNG: experiments must be reproducible; keys elsewhere come from
 *  the CSPRNG — two needs, two generators. */
export function experiment({ T = 500, seed = 1, lengths = LENGTHS }, L, testLines, progress = () => {}) {
  const rng = new SeededRng(seed);
  const books = testLines.map(toLetters);
  const tally = Object.fromEntries(METHODS.map((m) => [m.id, lengths.map(() => ({ s: 0, failRanks: [] }))]));
  lengths.forEach((len, li) => {
    const slots = books.map((b) => Math.max(0, b.length - len + 1));
    const total = slots.reduce((a, b) => a + b, 0);
    for (let t = 0; t < T; t++) {
      let r = rng.int(total), b = 0;
      while (r >= slots[b]) { r -= slots[b]; b++; }
      const plain = books[b].subarray(r, r + len);
      const key = rng.int(26);
      const c = shiftLetters(plain, key);
      for (const m of METHODS) {
        const res = attack(c, m, L);
        const guess = res.ties.length > 1 ? res.ties[rng.int(res.ties.length)] : res.best;
        const cell = tally[m.id][li];
        if (guess === key) cell.s++;
        else cell.failRanks.push(rankOf(res, key));
      }
    }
    progress((li + 1) / lengths.length);
  });
  const methods = METHODS.map((m) => {
    const rows = lengths.map((len, li) => {
      const { s, failRanks } = tally[m.id][li];
      const [lo, hi] = wilson(s, T);
      return { len, s, T, rate: s / T, lo, hi, medianFailRank: failRanks.length ? median(failRanks) : null };
    });
    // shortest length from which the rate stays ≥ 95 % for every longer length tested
    let need = null;
    for (let i = rows.length - 1; i >= 0 && rows[i].rate >= 0.95; i--) need = rows[i].len;
    return { id: m.id, rows, need };
  });
  return { T, seed, lengths, methods };
}
