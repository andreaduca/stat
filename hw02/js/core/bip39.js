/* bip39.js — BIP-39 (2013): the two halves of the backup standard.
     Part A, entropy → words: ENCODING + CHECKSUM. The entropy is rewritten in
       base 2048 (11 bits per word) after appending the first ENT/32 bits of
       its SHA-256. Fully reversible, by anyone: it is not encryption.
     Part B, words → seed: DERIVATION. PBKDF2-HMAC-SHA512, 2048 iterations,
       salt "mnemonic" + passphrase, 64-byte output.
   Note 02; [[Key derivation functions]], [[Checksums and error-detecting codes]],
   [[Encoding vs encryption vs hashing]]. */

import { bytesToHex, bytesToBits, utf8NFKD } from './bytes.js';
import { sha256 } from './sha256.js';
import { pbkdf2Sha512 } from './hash.js';

/** SHA-256 of the official English list (github.com/bitcoin/bips). */
export const WORDLIST_SHA256 = '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda';

/** Allowed entropy sizes in bits and the resulting word counts:
 *    ENT  CS  ENT+CS  words
 *    128   4    132     12        CS = ENT / 32
 *    160   5    165     15        words = (ENT + CS) / 11
 *    192   6    198     18
 *    224   7    231     21
 *    256   8    264     24                                                */
export const ENT_BITS = [128, 160, 192, 224, 256];
export const wordsFor = (entBits) => (entBits + entBits / 32) / 11;

/** BIP-39 §"Generating the mnemonic": the seed derivation runs this many times. */
export const PBKDF2_ITERATIONS = 2048;

let wordlist = null;   // immutable once loaded: a cache, not state

/* word -> index, built once per list: indexOf over 2048 words would be the
   slow part of the Monte Carlo loops that decode millions of phrases */
const positions = new WeakMap();
function indexOf(list, word) {
  if (!positions.has(list)) positions.set(list, new Map(list.map((w, i) => [w, i])));
  return positions.get(list).get(word) ?? -1;
}

/** Fetch data/bip39-english.txt and refuse it unless its SHA-256 is the
 *  official one: a single altered word would silently change every backup
 *  written with this tool, so a wrong list must stop the program, not warn. */
export async function loadWordlist() {
  if (wordlist) return wordlist;
  const response = await fetch(new URL('../../data/bip39-english.txt', import.meta.url));
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = bytesToHex(sha256(bytes));
  if (digest !== WORDLIST_SHA256) throw new Error(`wordlist SHA-256 is ${digest}, expected ${WORDLIST_SHA256}: refusing to run`);
  const words = new TextDecoder().decode(bytes).trim().split('\n');
  if (words.length !== 2048) throw new Error('the wordlist must have 2048 words');
  return (wordlist = Object.freeze(words));
}

/** The checksum bits of an entropy: the first ENT/32 bits of SHA-256(entropy).
 *  Category: checksum. SHA-256 is used here only as a well-mixed function to
 *  produce redundancy, not for secrecy. For 16 zero bytes the hash starts 0x37
 *  = 0011 0111, so the 4 checksum bits are 0011. */
export function checksumBits(entropy) {
  return bytesToBits(sha256(entropy)).slice(0, (entropy.length * 8) / 32);
}

export class Mnemonic {
  /** Use Mnemonic.fromEntropy or Mnemonic.fromWords; the constructor only stores. */
  constructor({ words, indices, entropy, checksum, expectedChecksum, unknown }) {
    this.words = words;                       // the words, lowercase
    this.indices = indices;                   // their positions 0…2047 in the list (−1 if not in it)
    this.entropy = entropy;                   // Uint8Array, or null if the words cannot be decoded
    this.checksum = checksum;                 // checksum bits carried by the words ('0011')
    this.expectedChecksum = expectedChecksum; // checksum bits recomputed from the entropy
    this.unknown = unknown;                   // words that are not in the list
  }

  /** Part A of BIP-39, encoding direction.
   *  bits = entropy ‖ checksum, cut into 11-bit big-endian groups,
   *  each group read as a number 0…2047 and looked up in the list.
   *  Example: 128 zero bits + checksum 0011 → eleven groups of 0 ("abandon")
   *  and a last group 0000000‖0011 = 3 ("about"). */
  static fromEntropy(entropy, list) {
    if (!ENT_BITS.includes(entropy.length * 8)) throw new RangeError('entropy must be 16, 20, 24, 28 or 32 bytes');
    const cs = checksumBits(entropy);
    const bits = bytesToBits(entropy) + cs;
    const indices = [];
    for (let i = 0; i < bits.length; i += 11) indices.push(parseInt(bits.slice(i, i + 11), 2));
    return new Mnemonic({
      words: indices.map((i) => list[i]), indices, entropy,
      checksum: cs, expectedChecksum: cs, unknown: [],
    });
  }

  /** Part A, decoding direction: what a wallet does when you restore.
   *  Every word must be in the list, the count must be 12/15/18/21/24, and the
   *  last CS bits must equal the checksum of the first ENT bits. Never throws:
   *  the result says what is wrong, because the pages show invalid phrases too. */
  static fromWords(text, list) {
    const words = (Array.isArray(text) ? text : text.trim().split(/\s+/)).filter(Boolean).map((w) => w.toLowerCase());
    const indices = words.map((w) => indexOf(list, w));
    const unknown = words.filter((_, i) => indices[i] < 0);
    const base = { words, indices, entropy: null, checksum: null, expectedChecksum: null, unknown };

    const total = words.length * 11;
    const entBits = (total * 32) / 33;        // ENT + ENT/32 = total
    if (unknown.length || !ENT_BITS.includes(entBits)) return new Mnemonic(base);

    const bits = indices.map((i) => i.toString(2).padStart(11, '0')).join('');
    const entropy = new Uint8Array(entBits / 8);
    for (let i = 0; i < entropy.length; i++) entropy[i] = parseInt(bits.slice(8 * i, 8 * i + 8), 2);
    return new Mnemonic({ ...base, entropy, checksum: bits.slice(entBits), expectedChecksum: checksumBits(entropy) });
  }

  /** The words joined by single spaces: the exact string PBKDF2 receives. */
  get phrase() { return this.words.join(' '); }

  get checksumOk() { return this.checksum !== null && this.checksum === this.expectedChecksum; }

  /** Valid = every word known, a legal length, and the checksum matches. */
  get valid() { return this.unknown.length === 0 && this.checksumOk; }

  /** Part B of BIP-39: the seed. Category: derivation (password-based KDF).
   *    seed = PBKDF2(PRF = HMAC-SHA512, password = NFKD(phrase),
   *                  salt = NFKD("mnemonic" + passphrase), c = 2048, dkLen = 64)
   *  It does NOT look at the checksum: any string gives a seed. That is
   *  deliberate (it is what lets the passphrase be anything), and it means the
   *  checksum is enforced only by wallet software. The 2048 iterations add
   *  log₂ 2048 = 11 bits of work to every guess. */
  async toSeed(passphrase = '') {
    return seedFromPhrase(this.phrase, passphrase);
  }
}

/** PBKDF2 on any string at all, valid mnemonic or not. */
export function seedFromPhrase(phrase, passphrase = '') {
  return pbkdf2Sha512(utf8NFKD(phrase), utf8NFKD('mnemonic' + passphrase), PBKDF2_ITERATIONS, 64);
}

/** For 11 fixed words (12-word case), every last word that makes the phrase
 *  valid. The last word holds 7 free entropy bits + 4 checksum bits; the
 *  checksum is fixed by the entropy, so exactly 2⁷ = 128 of the 2048 words work. */
export function validLastWords(first11, list) {
  return list.filter((w) => Mnemonic.fromWords([...first11, w], list).valid);
}
