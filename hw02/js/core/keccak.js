/* keccak.js — the Keccak-f[1600] permutation and the sponge built on it.
   One implementation serves both Ethereum's Keccak-256 (padding byte 0x01)
   and the FIPS 202 SHA3-256 (0x06): the padding byte is a parameter, and that
   one byte is the whole difference (R7, D8). Category: hashing. Note 04 §2,
   [[Hash constructions (Merkle–Damgård and sponge)]].

   How a sponge works (FIPS 202 §4):
     - the state is 1600 bits = a 5×5 grid of 64-bit lanes, all zero at first;
     - it is split into the RATE r (here 136 bytes = 1088 bits), which input
       and output touch, and the CAPACITY c = 1600 − r (512 bits), which they
       never touch — the hidden part that gives security c/2 = 256 bits;
     - ABSORB: XOR each r-byte block of the padded message into the rate,
       then apply the permutation Keccak-f[1600] to the whole state;
     - SQUEEZE: read the first 32 bytes of the state as the digest.
   Unlike SHA-2 (Merkle–Damgård), the output is not the whole internal state,
   so the "length-extension" trick that works on SHA-256 does not exist here.

   Keccak-f[1600] = 24 rounds of five steps, each a simple bitwise operation:
     θ  mix each bit with the parities of two neighbouring columns (diffusion)
     ρ  rotate each lane by a fixed amount (diffusion inside lanes)
     π  move the lanes around the grid (diffusion between lanes)
     χ  a ^= ~b & c along each row — the only non-linear step
     ι  XOR a round constant into lane (0,0), so rounds differ */

// 64-bit round constants of the ι step, split into [low, high] 32-bit halves
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
].map((c) => [Number(c & 0xffffffffn), Number(c >> 32n)]);

// ρ rotation offsets, indexed by lane x + 5y
const ROT = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

/* A 64-bit lane is kept as two 32-bit halves (lo, hi): JavaScript has no fast
   64-bit integers. Rotating a lane left by n:
     n = 0     nothing
     n < 32    lo' = lo << n | hi >>> (32 − n),  hi' = hi << n | lo >>> (32 − n)
     n ≥ 32    swap the halves first, then rotate by n − 32.
   The rotations are written out inline below (no helper returning arrays):
   the statistics lab runs this permutation hundreds of thousands of times. */

// π moves lane (x, y) to (y, 2x + 3y mod 5); precomputed destination per lane
const PI = Array.from({ length: 25 }, (_, i) => { const x = i % 5, y = (i / 5) | 0; return y + 5 * ((2 * x + 3 * y) % 5); });

const C = new Uint32Array(10), B = new Uint32Array(50);   // scratch, reused by every call

/** Keccak-f[1600] on a state of 25 lanes = 50 32-bit words (lane i at 2i, 2i+1). */
export function keccakF(s) {
  for (let round = 0; round < 24; round++) {
    // θ: every bit absorbs the parity of two neighbouring columns
    for (let x = 0; x < 5; x++) {
      C[2 * x] = s[2 * x] ^ s[2 * x + 10] ^ s[2 * x + 20] ^ s[2 * x + 30] ^ s[2 * x + 40];
      C[2 * x + 1] = s[2 * x + 1] ^ s[2 * x + 11] ^ s[2 * x + 21] ^ s[2 * x + 31] ^ s[2 * x + 41];
    }
    for (let x = 0; x < 5; x++) {
      const l = 2 * ((x + 4) % 5), r = 2 * ((x + 1) % 5);
      // D[x] = C[x − 1] ⊕ rot(C[x + 1], 1)
      const dlo = C[l] ^ ((C[r] << 1) | (C[r + 1] >>> 31));
      const dhi = C[l + 1] ^ ((C[r + 1] << 1) | (C[r] >>> 31));
      for (let y = 0; y < 50; y += 10) { s[2 * x + y] ^= dlo; s[2 * x + y + 1] ^= dhi; }
    }
    // ρ and π: rotate each lane by its fixed offset, then move it to its new place
    for (let i = 0; i < 25; i++) {
      let lo = s[2 * i], hi = s[2 * i + 1], n = ROT[i];
      if (n >= 32) { const t = lo; lo = hi; hi = t; n -= 32; }
      const j = 2 * PI[i];
      if (n === 0) { B[j] = lo; B[j + 1] = hi; }
      else { B[j] = (lo << n) | (hi >>> (32 - n)); B[j + 1] = (hi << n) | (lo >>> (32 - n)); }
    }
    // χ: the only non-linear step, a ^= ~b & c along each row
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        const i = 2 * (x + y), b = 2 * ((x + 1) % 5 + y), c = 2 * ((x + 2) % 5 + y);
        s[i] = B[i] ^ (~B[b] & B[c]);
        s[i + 1] = B[i + 1] ^ (~B[b + 1] & B[c + 1]);
      }
    }
    // ι: break the symmetry between rounds
    s[0] ^= RC[round][0];
    s[1] ^= RC[round][1];
  }
}

/** XOR one byte into the state; lanes are little-endian. */
function xorByte(s, at, byte) {
  const lane = at >> 3, k = at & 7;
  s[2 * lane + (k >> 2)] ^= byte << (8 * (k & 3));
}

const readByte = (s, at) => (s[2 * (at >> 3) + ((at & 7) >> 2)] >>> (8 * (at & 3))) & 255;

/** pad10*1 with a domain byte: message ‖ pad ‖ 00 … 00 ‖ 80, to a multiple of
 *  the rate. If the message leaves exactly one free byte, pad and 0x80 share it
 *  (0x81 or 0x86). This is the only place Keccak-256 and SHA3-256 differ:
 *  Keccak's domain byte is 0x01, FIPS 202 added two bits for SHA-3, giving 0x06. */
export function padMessage(bytes, rate = 136, pad = 0x01) {
  const padded = new Uint8Array((Math.floor(bytes.length / rate) + 1) * rate);
  padded.set(bytes);
  padded[bytes.length] ^= pad;
  padded[padded.length - 1] ^= 0x80;
  return padded;
}

/**
 * Sponge: absorb `rate`-byte blocks, permute, squeeze. The capacity
 * (200 − rate bytes, 64 for these hashes) is never touched by input or output.
 * Padding is pad10*1: the domain byte after the message, 0x80 at the end of the block.
 */
export function sponge(bytes, { rate = 136, pad = 0x01, outLen = 32 } = {}) {
  const s = new Uint32Array(50);
  const padded = padMessage(bytes, rate, pad);

  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate; i++) xorByte(s, i, padded[off + i]);
    keccakF(s);
  }
  const out = new Uint8Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = readByte(s, i);   // outLen <= rate here
  return out;
}

/** Keccak-256: Ethereum's hash, the original 2012 submission padding (0x01). */
export const keccak256 = (bytes) => sponge(bytes, { pad: 0x01 });

/** SHA3-256 (FIPS 202, 2015): same permutation and rate, domain byte 0x06. */
export const sha3_256 = (bytes) => sponge(bytes, { pad: 0x06 });
