/* lab/s2.js — S2, avalanche through the whole pipeline (note 07 §3).
   For each trial: a random 128-bit entropy, and the same entropy with ONE
   random bit flipped; both go through the complete pipeline along
   m/44'/60'/0'/0/0, and the number of changed words and changed bits is
   counted at every stage. If each stage behaves like a random function, the
   changed bits follow Binomial(size, ½): 256 of 512 seed bits, 128 of 256 key
   bits, 80 of 160 address bits. Simulation entropy comes from the seeded PRNG. */

import { SeededRng } from '../../../../assets/js/core/rng.js';
import { bitDistance, bigIntToBytes } from '../bytes.js';
import { loadWordlist } from '../bip39.js';
import { runPipeline } from '../pipeline.js';

const PATH = "m/44'/60'/0'/0/0";

export async function run({ n = 300, seed = 1 }, progress = () => {}) {
  const wordlist = await loadWordlist();
  const rng = new SeededRng(seed);
  const rows = [];
  for (let t = 0; t < n; t++) {
    const entropy = rng.bytes(16);
    const bit = rng.int(128);
    const flipped = entropy.slice();
    flipped[bit >> 3] ^= 0x80 >> (bit & 7);
    const a = await runPipeline({ entropy, wordlist, path: PATH });
    const b = await runPipeline({ entropy: flipped, wordlist, path: PATH });
    rows.push({
      trial: t + 1,
      bit,
      words: a.mnemonic.words.filter((w, i) => w !== b.mnemonic.words[i]).length,
      seed: bitDistance(a.seed, b.seed),
      key: bitDistance(bigIntToBytes(a.node.privateKey), bigIntToBytes(b.node.privateKey)),
      address: bitDistance(a.account.keccak.slice(12), b.account.keccak.slice(12)),
    });
    progress((t + 1) / n);
  }
  return { rows };
}

/** Exact distribution of the number of changed words after a one-bit flip
 *  (12 words): the flipped bit is one of the 7 entropy bits of the last word
 *  with probability 7/128, and then only that word changes; otherwise its own
 *  word changes and, with probability 15/16, the 4 checksum bits in the last
 *  word change too. Mean = 7/128 + (121/128)(1 + 15/16) = 1.886. */
export const WORDS_CHANGED = { 1: 7 / 128 + (121 / 128) * (1 / 16), 2: (121 / 128) * (15 / 16) };
