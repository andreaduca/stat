/* caesar.js — the Caesar cipher and the letter statistics it leaves intact.
   Encryption adds a fixed secret k to every letter in the group (ℤ₂₆, +):
   step 1 of the progression on the Toy ECC page (a fixed, secret, tiny mask).
   Category: symmetric, classical. Notes "Caesar cipher" §1–§4,
   [[Index of coincidence]], [[Shannon entropy]], [[Chi-squared statistic]].

   Letters are A=0 … Z=25. Encryption preserves case; anything that is not an
   unaccented Latin letter (spaces, digits, punctuation, è) passes through
   unchanged — a design choice that leaks word boundaries (note §3).
   For statistics every text is first normalised (normalise below), the same
   way the corpus was (tools/build-corpus.mjs imports this very function). */

import { shannonEntropy } from '../../../assets/js/core/stats.js';

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const A = 65, a = 97;

/* ---------- the cipher ---------- */

/** Shift every letter by k: cᵢ = (mᵢ + k) mod 26. Decryption is shift(c, −k):
 *  the inverse of adding k in ℤ₂₆ is adding −k = 26 − k.
 *  Every letter gets the SAME k — the reused mask that makes the cipher fall.
 *  Deterministic (same letter in, same letter out) and without diffusion
 *  (one plaintext letter changes exactly one ciphertext letter). */
export function shift(text, k) {
  const s = ((k % 26) + 26) % 26;
  let out = '';
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= A && c < A + 26) out += String.fromCharCode(A + ((c - A + s) % 26));
    else if (c >= a && c < a + 26) out += String.fromCharCode(a + ((c - a + s) % 26));
    else out += ch;
  }
  return out;
}

export const encrypt = (text, k) => shift(text, k);
export const decrypt = (text, k) => shift(text, -k);

/** Key space: 26 keys, log₂26 ≈ 4.70 bits; k = 0 is the identity, so 25 do anything. */
export const KEYS = 26;

/* ---------- normalisation (note "Caesar cipher" §3) ---------- */

/** Text → the letters the statistics see: Unicode NFD splits "è" into
 *  "e" + a combining accent, the accents (category M) are dropped, then
 *  uppercase, then everything outside A–Z goes. "Perché è così!" → "PERCHEECOSI".
 *  Letters without a decomposition (æ, ß, ø) are dropped, not transliterated. */
export function normalise(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z]/g, '');
}

/* ---------- letter statistics ---------- */

/** Counts O_ℓ of the 26 letters in already-normalised text. */
export function letterCounts(letters) {
  const counts = new Array(26).fill(0);
  for (let i = 0; i < letters.length; i++) counts[letters.charCodeAt(i) - A]++;
  return counts;
}

/** Relative frequencies p_ℓ = O_ℓ / N (all zeros for an empty text). */
export function frequencies(counts) {
  const n = counts.reduce((s, c) => s + c, 0);
  return counts.map((c) => (n ? c / n : 0));
}

/** Index of coincidence: the probability that two letters drawn without
 *  replacement from the text are equal,
 *      IC = Σ O_ℓ(O_ℓ − 1) / (N(N − 1)).
 *  English ≈ 0.066; uniform letters 1/26 ≈ 0.0385. It depends only on the
 *  multiset of counts, not on WHICH letter has which count, so any
 *  monoalphabetic substitution — Caesar included — leaves it unchanged. */
export function indexOfCoincidence(counts) {
  const n = counts.reduce((s, c) => s + c, 0);
  if (n < 2) return NaN;
  return counts.reduce((s, c) => s + c * (c - 1), 0) / (n * (n - 1));
}

/** Shannon entropy of the letter distribution, H = −Σ p_ℓ log₂ p_ℓ bits per
 *  letter (max log₂26 ≈ 4.70). Permutation-invariant for the same reason as
 *  the IC: shifting the letters only reorders the terms of the sum. */
export const letterEntropy = (counts) => shannonEntropy(frequencies(counts));

/** The frequency profile sorted from most to least common: also invariant.
 *  Returns [{letter, count, p}], highest first. */
export function sortedProfile(counts) {
  const p = frequencies(counts);
  return counts.map((count, i) => ({ letter: ALPHABET[i], count, p: p[i] }))
    .sort((x, y) => y.count - x.count || x.letter.localeCompare(y.letter));
}

/** χ² distance between observed counts and a language model p:
 *      χ² = Σ (O_ℓ − E_ℓ)² / E_ℓ,  E_ℓ = N·p_ℓ.
 *  Used as a DISTANCE ("how English does this look?"), not as a formal test:
 *  on short texts most E_ℓ are below 5 and the χ² distribution does not apply.
 *  Unlike the IC this DOES change with k — which is what the attack (P3) uses. */
export function chiSquaredDistance(counts, probs) {
  const n = counts.reduce((s, c) => s + c, 0);
  let chi = 0;
  for (let i = 0; i < 26; i++) {
    const e = n * probs[i];
    if (e > 0) chi += (counts[i] - e) ** 2 / e;
  }
  return chi;
}

/** Ciphertext counts are the plaintext counts rotated by k:
 *  P_cipher(ℓ) = P_plain(ℓ − k mod 26). Same bars, new positions. */
export const rotate = (arr, k) => arr.map((_, i) => arr[(((i - k) % 26) + 26) % 26]);
