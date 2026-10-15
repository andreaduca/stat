/* hash.js — thin wrappers around the browser's Web Crypto API for the SHA-2
   family the wallet uses: SHA-256, SHA-512, HMAC-SHA512 and PBKDF2-HMAC-SHA512.
   All asynchronous, and only available in a secure context (https:// or
   http://localhost, never file://). Keccak and secp256k1 are not in Web Crypto. */

const subtle = () => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto is unavailable: open the site over http://localhost or https://, not file://.');
  }
  return globalThis.crypto.subtle;
};

/** Hashing (FIPS 180-4). */
export const sha256Async = async (bytes) => new Uint8Array(await subtle().digest('SHA-256', bytes));
export const sha512 = async (bytes) => new Uint8Array(await subtle().digest('SHA-512', bytes));

/** HMAC-SHA512 (RFC 2104): a keyed hash. Derivation, as BIP-32 uses it — the key
 *  is "Bitcoin seed" for the master, the parent chain code for a child. */
export async function hmacSha512(key, data) {
  const k = await subtle().importKey('raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, data));
}

/** PBKDF2-HMAC-SHA512 (RFC 8018): key stretching. BIP-39 runs it 2048 times to
 *  turn the mnemonic into the 64-byte seed. */
export async function pbkdf2Sha512(password, salt, iterations, length = 64) {
  const k = await subtle().importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt, iterations }, k, length * 8);
  return new Uint8Array(bits);
}
