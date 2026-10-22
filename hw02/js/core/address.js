/* address.js — from a private key to the checksummed Ethereum address.
     k → Q = kG               public-key cryptography (secp256k1)
     Q → Keccak-256(x‖y)      hashing: 64 bytes in, 32 out
       → last 20 bytes        the address, 160 bits = 40 hex characters
       → EIP-55 letter case   a checksum hidden inside the hex encoding
   Note 04 §1–§5; [[Checksums and error-detecting codes]]. */

import { bytesToHex, hexToBytes, utf8 } from './bytes.js';
import { keccak256 } from './keccak.js';
import { publicKey, ethereumHex } from '../../../assets/js/core/secp256k1.js';

/** Address of a public key: the last 20 bytes (bytes 12…31) of
 *  Keccak-256(x‖y). The hash compresses 64 bytes to 20 and destroys the
 *  algebra: nothing about Q can be computed from it, so an address that has
 *  never signed exposes only a hash. Returns the full hash too, for display. */
export function addressOf(Q) {
  const hash = keccak256(hexToBytes(ethereumHex(Q)));
  return { hash, address: bytesToHex(hash.slice(12)) };
}

/** EIP-55 (Buterin, Van de Sande, 2016).
 *  h = Keccak-256 of the lowercase hex address as ASCII TEXT (not of the 20 bytes);
 *  a letter a–f at position i is uppercased iff hex digit i of h is ≥ 8
 *  (the top bit of that nibble is 1); digits 0–9 have no case and carry nothing.
 *  So each letter is one check bit: on average 15 of the 40 characters.
 *  Returns the checksummed address and the per-character table. */
export function eip55(address) {
  const lower = address.replace(/^0x/i, '').toLowerCase();
  const h = bytesToHex(keccak256(utf8(lower)));
  const table = [...lower].map((char, i) => {
    const nibble = parseInt(h[i], 16);
    const letter = char >= 'a';
    return { char, nibble: h[i], letter, upper: letter && nibble >= 8 };
  });
  return {
    hash: h,
    table,
    checksummed: '0x' + table.map((t) => (t.upper ? t.char.toUpperCase() : t.char)).join(''),
    letters: table.filter((t) => t.letter).length,
  };
}

/** How a wallet reads a typed address.
 *    malformed  not 40 hex characters
 *    unchecked  all lowercase or all uppercase: accepted as "no checksum" —
 *               which is why the EIP-55 check is optional in practice
 *    valid      mixed case matching EIP-55
 *    invalid    mixed case with at least one letter in the wrong case
 *  `wrong` lists the positions whose case disagrees with EIP-55. */
export function checkAddress(text) {
  const body = text.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{40}$/.test(body)) return { status: 'malformed', wrong: [] };
  if (body === body.toLowerCase() || body === body.toUpperCase()) return { status: 'unchecked', wrong: [] };
  const expected = eip55(body).checksummed.slice(2);
  const wrong = [...body].map((c, i) => (c !== expected[i] ? i : -1)).filter((i) => i >= 0);
  return { status: wrong.length ? 'invalid' : 'valid', wrong, expected: '0x' + expected };
}

/** One Ethereum account: the object behind steps 5–7 of the pipeline. */
export class EthAccount {
  /** @param {bigint} privateKey 1 ≤ k < n */
  constructor(privateKey) {
    this.privateKey = privateKey;
    this.Q = publicKey(privateKey);
    const { hash, address } = addressOf(this.Q);
    this.keccak = hash;
    this.lower = address;
  }
  publicKey() { return this.Q; }
  address() { return '0x' + this.lower; }
  checksumAddress() { return eip55(this.lower).checksummed; }
}
