/* secrecy.js — perfect secrecy as independence (Shannon 1949): a table of plaintext
   letter × ciphertext letter for a shift cipher on Z₂₆, with one fixed key (Caesar,
   HW3) or a fresh uniform key per letter (the one-time pad). The plaintext is a
   synthetic, skewed letter distribution (Zipf: weights 1/rank), labelled as such.
   [[Perfect secrecy as independence]]. Pure, no DOM. */

import { ContingencyTable } from './table.js';

export const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/** Zipf(1) weights on 26 letters, p_r ∝ 1/r: a skewed stand-in for a language. */
export const ZIPF = (() => { const w = LETTERS.map((_, r) => 1 / (r + 1)); const s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); })();

/** H(M) of the Zipf plaintext, in bits: the most a ciphertext could reveal about one letter. */
export const H_PLAIN = -ZIPF.reduce((s, p) => s + p * Math.log2(p), 0);

const CUM = ZIPF.reduce((acc, p) => { acc.push((acc.at(-1) ?? 0) + p); return acc; }, []);
const letter = (rng) => { const u = rng.float(); let i = 0; while (i < 25 && u >= CUM[i]) i++; return i; };

/**
 * N letters encrypted as C = (M + K) mod 26, counted in the 26 × 26 table M × C.
 * Category: simulation.
 * fixed key: C is a bijective function of M, so each row has one non-empty cell: V = 1 and
 * Î = H(M) (Lemma 2). fresh key (one-time pad): P(C = c | M = m) = P(K = c − m) = 1/26 for
 * every m, so C ⊥ M (Theorem 1) and χ² behaves like χ²₆₂₅.
 * @param {'fixed'|'fresh'} mode
 */
export function shiftTable(rng, N, mode, key = 3) {
  const t = new ContingencyTable(LETTERS, LETTERS.map((l) => l.toLowerCase()));
  for (let n = 0; n < N; n++) {
    const m = letter(rng), k = mode === 'fixed' ? key : rng.int(26);
    t.add(m, (m + k) % 26);
  }
  return t;
}
