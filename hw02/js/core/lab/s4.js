/* lab/s4.js — S4, how often the checksums miss an error (note 07 §6).
     BIP-39: random 12 and 24 words pass (theory 1/16, 1/256); one word replaced
             in a valid phrase; two adjacent words swapped (theory 1/16 each).
     EIP-55: one hex character mistyped in a checksummed address and still
             accepted (theory (13/16)⁴⁰ ≈ 0.0247 %), the number of letters per
             address against Binomial(40, 6/16), and the miss rate by letter count.
   The BIP-39 checks use the bits directly (one synchronous SHA-256 each) so
   that 10⁵ trials take a second or two. */

import { SeededRng } from '../../../../assets/js/core/rng.js';
import { bytesToHex } from '../bytes.js';
import { sha256 } from '../sha256.js';
import { eip55, checkAddress } from '../address.js';

/** Is a list of word indices (0…2047) a valid BIP-39 phrase? Pack 11 bits per
 *  word, split ENT ‖ CS, compare CS with the first bits of SHA-256(ENT). */
function validIndices(indices) {
  const total = indices.length * 11, cs = total / 33, ent = total - cs;
  const bits = new Uint8Array(Math.ceil(total / 8));
  let pos = 0;
  for (const idx of indices) for (let b = 10; b >= 0; b--, pos++) if ((idx >> b) & 1) bits[pos >> 3] |= 0x80 >> (pos & 7);
  const hash = sha256(bits.slice(0, ent / 8));
  for (let i = 0; i < cs; i++) {
    const p = ent + i;
    if (((bits[p >> 3] >> (7 - (p & 7))) & 1) !== ((hash[0] >> (7 - i)) & 1)) return false;
  }
  return true;
}

/** A valid 12-word phrase in one hash: 128 random entropy bits (11 words +
 *  the top 7 bits of the 12th), then the last 4 bits set to the checksum. */
function validPhrase(rng) {
  const idx = Array.from({ length: 12 }, () => rng.int(2048));
  const ent = new Uint8Array(16);
  let pos = 0;
  for (const i of idx) for (let b = 10; b >= 0 && pos < 128; b--, pos++) if ((i >> b) & 1) ent[pos >> 3] |= 0x80 >> (pos & 7);
  idx[11] = (idx[11] & ~15) | (sha256(ent)[0] >> 4);
  return idx;
}

export async function run({ n = 100000, m = 100000, seed = 1 }, progress = () => {}) {
  const rng = new SeededRng(seed);
  const tick = (i, of, base, span) => { if (i % 2000 === 0) progress(base + span * (i / of)); };
  const events = [];

  let k = 0;
  for (let i = 0; i < n; i++) { if (validIndices(Array.from({ length: 12 }, () => rng.int(2048)))) k++; tick(i, n, 0, 0.12); }
  events.push({ test: 'BIP-39: random 12 words pass', k, n, theory: 1 / 16 });

  k = 0;
  for (let i = 0; i < n; i++) { if (validIndices(Array.from({ length: 24 }, () => rng.int(2048)))) k++; tick(i, n, 0.12, 0.12); }
  events.push({ test: 'BIP-39: random 24 words pass', k, n, theory: 1 / 256 });

  k = 0;
  for (let i = 0; i < n; i++) {
    const idx = validPhrase(rng), at = rng.int(12);
    let w; do { w = rng.int(2048); } while (w === idx[at]);
    idx[at] = w;
    if (validIndices(idx)) k++;
    tick(i, n, 0.24, 0.12);
  }
  events.push({ test: 'BIP-39: one word replaced, undetected', k, n, theory: 1 / 16 });

  k = 0; let swaps = 0;
  for (let i = 0; i < n; i++) {
    const idx = validPhrase(rng), at = rng.int(11);
    if (idx[at] === idx[at + 1]) continue;       // swapping equal words changes nothing
    [idx[at], idx[at + 1]] = [idx[at + 1], idx[at]];
    swaps++;
    if (validIndices(idx)) k++;
    tick(i, n, 0.36, 0.12);
  }
  events.push({ test: 'BIP-39: adjacent words swapped, undetected', k, n: swaps, theory: 1 / 16 });

  // EIP-55: random addresses (uniform, like real ones), one character mistyped
  const letters = new Array(41).fill(0);
  const byLetters = Array.from({ length: 41 }, () => ({ trials: 0, missed: 0 }));
  k = 0;
  for (let i = 0; i < m; i++) {
    const original = eip55(bytesToHex(rng.bytes(20)));
    letters[original.letters]++;
    const body = original.checksummed.slice(2);
    const at = rng.int(40);
    let c; do { c = '0123456789abcdef'[rng.int(16)]; } while (c === body[at].toLowerCase());
    if (body[at] !== body[at].toLowerCase()) c = c.toUpperCase();   // typed in the case of the original character
    const typed = body.slice(0, at) + c + body.slice(at + 1);
    const L = typed.replace(/[0-9]/g, '').length;              // letters = check bits of what was typed
    const missed = checkAddress(typed).status === 'valid';
    byLetters[L].trials++;
    if (missed) { k++; byLetters[L].missed++; }
    tick(i, m, 0.48, 0.52);
  }
  events.push({ test: 'EIP-55: one character mistyped, undetected', k, n: m, theory: (13 / 16) ** 40 });

  return { events, letters, byLetters };
}
