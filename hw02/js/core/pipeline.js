/* pipeline.js — the whole wallet pipeline in one function, keeping every
   intermediate value so a page can show each arrow of the diagram:

     entropy ──encode + checksum──▶ mnemonic ──PBKDF2──▶ seed ──HMAC "Bitcoin seed"──▶
     master (k_m, c_m) ──CKD along the BIP-44 path──▶ k ──Q = kG──▶ Q
       ──Keccak-256, last 20 bytes──▶ address ──EIP-55──▶ checksummed address

   Only the first arrow involves chance (key generation, done by the caller);
   every other one is a deterministic function. Note 00, note 01 §2. */

import { Mnemonic } from './bip39.js';
import { HDNode } from './bip32.js';
import { EthAccount, eip55 } from './address.js';

/**
 * @param {object} o
 * @param {Uint8Array} o.entropy  16…32 bytes, from entropy.js
 * @param {string[]} o.wordlist   the verified BIP-39 list
 * @param {string} o.passphrase   BIP-39 passphrase ('' for none)
 * @param {string} o.path         e.g. "m/44'/60'/0'/0/0"
 */
export async function runPipeline({ entropy, wordlist, passphrase = '', path }) {
  const mnemonic = Mnemonic.fromEntropy(entropy, wordlist);       // step 1: encoding + checksum

  const t0 = performance.now();
  const seed = await mnemonic.toSeed(passphrase);                 // step 2: PBKDF2, 2048 rounds
  const seedMs = performance.now() - t0;

  const { node: master, trace: masterStep } = await HDNode.fromSeed(seed);   // step 3
  const { node, trace } = await master.derive(path);              // step 4: one CKDpriv per level

  const account = new EthAccount(node.privateKey);                // steps 5 and 6
  const checksum = eip55(account.lower);                          // step 7

  return { entropy, mnemonic, passphrase, seed, seedMs, master, masterStep, path, node, trace, account, checksum };
}

/** Recovering one forgotten word — what the 2048 PBKDF2 iterations protect.
 *  1. Try all 2048 words at the missing position; keep those whose checksum
 *     is right (≈ 1/16 of them, i.e. ≈ 128; exactly 2^(11−CS) at the last place).
 *     This filter costs one SHA-256 each and is instant.
 *  2. For each survivor run the expensive part — PBKDF2 (2048 HMACs), the
 *     BIP-32 path, kG, Keccak — and compare with an address the owner knows.
 *  The cost is dominated by step 2, so the checksum divides the work by 16.
 *  Every survivor is tried (not just until the first hit), so the measured
 *  time is the full search and `matches` shows that only one word fits.
 *  `onProgress(done, total)` is called after each derivation; it may return
 *  false to stop. Returns what was found and what it cost. */
export async function recoverMissingWord({ words, position, wordlist, passphrase = '', path, target, onProgress = () => true }) {
  const t0 = performance.now();
  const candidates = wordlist.filter((w) => {
    const trial = words.slice();
    trial[position] = w;
    return Mnemonic.fromWords(trial, wordlist).valid;
  });
  const filterMs = performance.now() - t0;

  const t1 = performance.now();
  let tried = 0;
  const matches = [];
  for (const w of candidates) {
    const trial = words.slice();
    trial[position] = w;
    const seed = await Mnemonic.fromWords(trial, wordlist).toSeed(passphrase);
    const { node: master } = await HDNode.fromSeed(seed);
    const { node } = await master.derive(path);
    tried++;
    if (new EthAccount(node.privateKey).lower === target) matches.push(w);
    if (onProgress(tried, candidates.length) === false) break;
  }
  return { found: matches[0] ?? null, matches, candidates: candidates.length, tried, filterMs, deriveMs: performance.now() - t1 };
}
