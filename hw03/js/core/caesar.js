/* caesar.js — the Caesar cipher: add a fixed secret k to every letter, in the
   group (ℤ₂₆, +). Step 1 of the progression on the Toy ECC page (a fixed,
   secret, tiny mask); P2 adds normalisation and the letter statistics.
   Category: symmetric, classical. Note "Caesar cipher" §1, §3.

   Letters are A=0 … Z=25. Case is preserved; anything that is not an
   unaccented Latin letter (spaces, digits, punctuation, è) passes through
   unchanged — a design choice that leaks word boundaries (note §3). */

const A = 65, a = 97;

/** Shift every letter by k: cᵢ = (mᵢ + k) mod 26. Decryption is shift(c, −k),
 *  i.e. shift(c, 26 − k): the inverse of adding k in ℤ₂₆ is adding −k.
 *  Every letter gets the SAME k — the reused mask that makes the cipher fall. */
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
