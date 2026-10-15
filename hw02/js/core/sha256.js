/* sha256.js — a synchronous SHA-256 (FIPS 180-4), for the places where the
   asynchronous Web Crypto version in hash.js is awkward: the BIP-39 checksum,
   the wordlist check, and Monte Carlo loops that hash millions of times.
   Category: hashing. Checked against Web Crypto. Note 02, HMWK 1 note 06,
   [[Hash constructions (Merkle–Damgård and sponge)]].

   Merkle–Damgård in three moves:
     1. PAD the message to a multiple of 64 bytes: a 1 bit, zeros, then the
        length in bits (so two messages of different length never pad alike);
     2. CHAIN: start from 8 fixed words H (the fractional parts of √ of the
        first 8 primes) and feed each 64-byte block through the compression
        function together with the current H, giving the next H;
     3. OUTPUT the final H, 32 bytes.
   Because the digest IS the final chaining value, anyone who knows SHA-256(m)
   and the length of m can keep chaining from it: the length-extension
   property that the Keccak sponge (keccak.js) does not have.
   The compression function is 64 rounds of additions mod 2³², rotations and
   the bitwise choice/majority functions Ch and Maj, keyed by the constants K
   (fractional parts of ∛ of the first 64 primes). */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/** The Merkle–Damgård padding of a message of `length` bytes:
 *  0x80, zeros, then the length in bits as a 64-bit big-endian number,
 *  so that message + padding is a whole number of 64-byte blocks. */
export function mdPadding(length) {
  const total = Math.ceil((length + 9) / 64) * 64;
  const pad = new Uint8Array(total - length);
  pad[0] = 0x80;
  const view = new DataView(pad.buffer);
  view.setUint32(pad.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(pad.length - 4, (length * 8) >>> 0);
  return pad;
}

/** The compression function: one 64-byte block folded into the chaining
 *  value H (8 words, updated in place). 64 rounds of additions mod 2³²,
 *  rotations, Ch(e,f,g) = (e∧f)⊕(¬e∧g) and Maj(a,b,c), then the
 *  Davies–Meyer feed-forward H += result. */
function compress(H, view, off) {
  const W = new Uint32Array(64);
  // message schedule: 16 words from the block, 48 more mixed from them
  for (let t = 0; t < 16; t++) W[t] = view.getUint32(off + 4 * t);
  for (let t = 16; t < 64; t++) {
    const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
    const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
    W[t] = W[t - 16] + s0 + W[t - 7] + s1;
  }
  let [a, b, c, d, e, f, g, h] = H;
  for (let t = 0; t < 64; t++) {
    const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) >>> 0;
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
}

const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/* Run the chain from a given chaining value over already-padded blocks. */
function chain(H, padded) {
  const view = new DataView(padded.buffer, padded.byteOffset, padded.length);
  for (let off = 0; off < padded.length; off += 64) compress(H, view, off);
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  H.forEach((word, i) => ov.setUint32(4 * i, word));
  return out;
}

const withPadding = (bytes, length) => {
  const pad = mdPadding(length);
  const out = new Uint8Array(bytes.length + pad.length);
  out.set(bytes);
  out.set(pad, bytes.length);
  return out;
};

/** SHA-256 of a byte string -> 32 bytes: pad, then chain from the fixed IV. */
export function sha256(bytes) {
  return chain(new Uint32Array(IV), withPadding(bytes, bytes.length));
}

/** The length-extension attack on SHA-256 — why SHA-2 needs HMAC for MACs.
 *  Knowing only the digest of some unknown x and its length, compute the
 *  digest of x ‖ glue ‖ suffix, where glue = mdPadding(|x|). It works because
 *  the digest IS the full chaining value after x ‖ glue: load it as H and keep
 *  compressing. Nothing about x itself is needed. A sponge (keccak.js) outputs
 *  only part of its state — the capacity stays hidden — so it cannot be resumed. */
export function lengthExtend(digest, length, suffix) {
  const dv = new DataView(digest.buffer, digest.byteOffset, 32);
  const H = new Uint32Array(8).map((_, i) => dv.getUint32(4 * i));
  const glue = mdPadding(length);
  const total = length + glue.length + suffix.length;    // the length the forged message claims
  return { glue, forged: chain(H, withPadding(suffix, total)) };
}

/** SHA-256d = SHA-256(SHA-256(x)), Bitcoin's double hash (used by the Coldcard model). */
export const sha256d = (bytes) => sha256(sha256(bytes));
