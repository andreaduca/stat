/* bytes.js — the representations the pipeline keeps converting between:
   hex strings, Uint8Array bytes, bit strings and BigInt. Category: encoding
   only; nothing here is cryptography. Pure, no DOM. */

/** "00ff…" -> Uint8Array. Accepts an optional 0x prefix. */
export function hexToBytes(hex) {
  const clean = hex.trim().replace(/^0x/i, '');
  if (clean.length % 2 || /[^0-9a-f]/i.test(clean)) throw new Error('not an even-length hex string');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Bytes as a string of 0/1, most significant bit first (BIP-39 reads bits this way). */
export const bytesToBits = (bytes) => Array.from(bytes, (b) => b.toString(2).padStart(8, '0')).join('');

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** Big-endian bytes -> BigInt. */
export const bytesToBigInt = (bytes) => (bytes.length ? BigInt('0x' + bytesToHex(bytes)) : 0n);

/** BigInt -> big-endian bytes of fixed length; BIP-32 calls the 32-byte case ser256. */
export const bigIntToBytes = (n, length = 32) => hexToBytes(n.toString(16).padStart(2 * length, '0'));

/** BIP-32 ser32: a 32-bit index, big-endian. */
export const ser32 = (i) => new Uint8Array([i >>> 24, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]);

/** UTF-8 of the NFKD normal form, which is what BIP-39 hashes for mnemonic and passphrase. */
export const utf8NFKD = (text) => new TextEncoder().encode(text.normalize('NFKD'));

export const utf8 = (text) => new TextEncoder().encode(text);

export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Number of differing bits between two equal-length byte strings (Hamming distance). */
export function bitDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}
