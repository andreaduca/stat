/* lab/s5c.js — S5(c), the Coldcard model (note 09 §6).
   1. Statistics: N seeds from random 32-bit starting states of the model,
      tested before and after SHA-256d (byte χ², monobit). Both pass.
   2. Attack: a victim seed made with a known chip-ID word and an unknown timer
      value in [0, 2^timerBits). The attacker tries every timer value, rebuilds
      the 24 words, runs PBKDF2 and BIP-32 to m/84'/0'/0'/0/0 (the Bitcoin
      SegWit path the note uses), and compares public keys — which is all a
      blockchain shows. The real Mk2/Mk3 timer range is about 80 000 ≈ 2^16.3. */

import { SeededRng } from '../../../../assets/js/core/rng.js';
import { chiSquare, monobit } from '../../../../assets/js/core/stats.js';
import { loadWordlist, Mnemonic } from '../bip39.js';
import { HDNode } from '../bip32.js';
import { compressedHex } from '../../../../assets/js/core/secp256k1.js';
import { coldcardEntropy } from '../yasmarang.js';

const PATH = "m/84'/0'/0'/0/0";
export const UID_WORD = 0x0033002b;     // an example chip-ID word, known to the attacker

function byteTests(samples) {
  const counts = new Array(256).fill(0);
  let ones = 0, bits = 0;
  for (const s of samples) for (const b of s) { counts[b]++; for (let j = 0; j < 8; j++) ones += (b >> j) & 1; bits += 8; }
  return { bytes: chiSquare(counts), monobit: monobit(ones, bits) };
}

async function publicKeyOf(entropy, wordlist) {
  const m = Mnemonic.fromEntropy(entropy, wordlist);
  const { node: master } = await HDNode.fromSeed(await m.toSeed());
  const { node } = await master.derive(PATH);
  return { words: m.words, pub: compressedHex(node.publicKey) };
}

export async function run({ timer: timerBits = 12, n = 4000, seed = 1 }, progress = () => {}) {
  const wordlist = await loadWordlist();
  const rng = new SeededRng(seed);

  // 1. what a statistical test sees
  const raw = [], hashed = [];
  for (let i = 0; i < n; i++) {
    const { raw: r, entropy } = coldcardEntropy(rng.u32());
    raw.push(r); hashed.push(entropy);
  }
  const stats = { raw: byteTests(raw), hashed: byteTests(hashed) };
  progress(0.02);

  // 2. what an attacker sees: one public key, and the generator's structure
  const range = 2 ** timerBits;
  const timer = rng.int(range);
  const victim = await publicKeyOf(coldcardEntropy((UID_WORD ^ timer) >>> 0).entropy, wordlist);

  const t0 = performance.now();
  let found = null, tried = 0, words = null;
  for (let t = 0; t < range; t++) {
    tried++;
    const guess = await publicKeyOf(coldcardEntropy((UID_WORD ^ t) >>> 0).entropy, wordlist);
    if (guess.pub === victim.pub) { found = t; words = guess.words; break; }
    if (t % 16 === 15) progress(0.02 + 0.98 * (t / range));
  }
  const ms = performance.now() - t0;
  return { stats, n, uid: UID_WORD, range, timer, victimPub: victim.pub, found, words, tried, ms, rate: tried / (ms / 1000), path: PATH };
}
