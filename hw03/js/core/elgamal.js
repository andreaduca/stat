/* elgamal.js — the hw03 toy scheme: textbook EC-ElGamal on secp256k1 with the
   private key restricted to [1, 2^bits]. Category: public-key encryption.
   Notes "EC-ElGamal toy scheme" (variant A) and "ECC vs Caesar - comparison".

   WHY ELGAMAL. Part 1 gave key generation only — d and Q = dG — and a curve
   alone encrypts nothing. EC-ElGamal is the standard public-key encryption
   built on the same group, and it uses exactly those keys: Q to encrypt, d to
   decrypt, plus a fresh nonce k per message. Real systems use the hybrid form
   (ECIES/HPKE: ECDH → KDF → AEAD); the textbook form is kept here because it
   makes the comparison with Caesar exact: both ADD A MASK IN A GROUP.

   THE PROGRESSION, each step fixing one defect of the one before:
     1. Caesar       cᵢ = mᵢ + k      in (ℤ₂₆, +)    mask fixed, secret, 26 values
                     → the same mask on every letter: statistics leak; tiny key space
     2. naive M + Q  C = M + Q        in E(𝔽ₚ)       mask fixed, PUBLIC
                     → anyone computes C − Q = M: a huge group, zero security
     3. EC-ElGamal   C₁ = kG, C₂ = M + kQ            mask S = kQ fresh and secret
                     → only the sender (k·Q) and the receiver (d·C₁) can compute S;
                       an eavesdropper holding Q and C₁ = kG faces Diffie–Hellman
   Lesson: a big group is not enough (2); the mask must be secret (DH) and
   fresh (new k). Caesar fails both.

   WHAT IS TOY. d is drawn from [1, 2^bits] instead of [1, n − 1], so the
   ECDLP Q = dG is solvable by search (the P4 attack page). k is full size.
   Educational only: not constant-time, no authentication (the ciphertext is
   malleable: (C₁, C₂ + T) decrypts to M + T). */

import { P, N, B, G, isOnCurve, add, neg, mul, mulG } from '../../../assets/js/core/secp256k1.js';
import { Point } from '../../../assets/js/core/curve.js';
import { PrimeField } from '../../../assets/js/core/field.js';

const F = new PrimeField(P);
const modP = (v) => ((v % P) + P) % P;

/* ---------- randomness ---------- */

/** A uniform integer in [lo, hi] from the CSPRNG (crypto.getRandomValues).
 *  Rejection sampling: draw just enough bits to cover the range, discard
 *  draws that overshoot. Taking `random mod range` instead would favour the
 *  small residues (modulo bias). Expected draws < 2. Never Math.random():
 *  keys and nonces need unpredictability, not just a flat histogram.
 *  [[Cryptographically secure randomness]]. */
export function randomScalar(lo, hi) {
  const range = hi - lo + 1n;
  const bits = range.toString(2).length;
  const bytes = Math.ceil(bits / 8);
  const excess = BigInt(bytes * 8 - bits);
  for (;;) {
    const buf = globalThis.crypto.getRandomValues(new Uint8Array(bytes));
    let r = 0n;
    for (const b of buf) r = (r << 8n) | BigInt(b);
    r >>= excess;                            // keep exactly `bits` bits
    if (r < range) return lo + r;
  }
}

/* ---------- keys ---------- */

/** KeyGen of the toy: d ← [1, N] uniformly with N = 2^bits, Q = dG.
 *  d decrypts (receiver only); Q encrypts (anyone). With the real scheme N
 *  would be n − 1 ≈ 2²⁵⁶; here log₂N = bits is the whole security. */
export function keygen(bits) {
  const range = 2n ** BigInt(bits);
  const d = randomScalar(1n, range);
  return { d, Q: mulG(d), range };
}

/** Q from a given d (the page keeps the toy d in the URL). */
export const publicFrom = (d) => mulG(d);

/* ---------- Koblitz encoding: bytes ↔ a point ---------- */

/* A chunk of ≤ 29 message bytes becomes the integer m = int(0x01 ‖ bytes):
   the 0x01 sentinel keeps leading zero bytes and marks the length, so
   m < 2²³³. Then x = 256·m + j for j = 0, 1, … until x³ + 7 is a square
   mod p. x < 2²⁴¹ < p, so x is a valid coordinate and m = ⌊x/256⌋. */
export const CHUNK = 29;
const K = 256n;                     // tries reserved per message value: failure ≈ 2^−256

/** √a mod p, or null if a is not a square. p ≡ 3 (mod 4) for secp256k1, so
 *  y = a^((p+1)/4) is a root whenever one exists (Euler's criterion:
 *  y² = a^((p+1)/2) = a · a^((p−1)/2) = a · (±1)). Check y² = a to know. */
function sqrtP(a) {
  const y = F.pow(a, (P + 1n) / 4n);
  return modP(y * y) === a ? y : null;
}

/** bytes → (m, j, M). About half of all x have x³ + 7 a square, so the
 *  number of tries j + 1 is Geometric(½): mean 2. */
export function encodeChunk(bytes) {
  let m = 1n;                                   // the sentinel byte
  for (const b of bytes) m = (m << 8n) | BigInt(b);
  for (let j = 0n; j < K; j++) {
    const x = m * K + j;
    const y = sqrtP(modP(x * x * x + B));
    if (y !== null) return { m, j: Number(j), M: new Point(x, y) };
  }
  throw new Error('no curve point for this chunk (probability ≈ 2^−256)');
}

/** point → bytes: m = ⌊x/256⌋, then drop the sentinel. */
export function decodePoint(M) {
  let m = M.x / K;
  const out = [];
  while (m > 1n) { out.unshift(Number(m & 0xffn)); m >>= 8n; }
  if (m !== 1n) throw new Error('not a Koblitz-encoded point (sentinel missing)');
  return Uint8Array.from(out);
}

/** UTF-8 bytes in chunks of CHUNK. An empty message is one empty chunk. */
function chunks(text) {
  const bytes = new TextEncoder().encode(text);
  const out = [];
  for (let i = 0; i < bytes.length; i += CHUNK) out.push(bytes.slice(i, i + CHUNK));
  return out.length ? out : [new Uint8Array(0)];
}

const joinText = (parts) => {
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return new TextDecoder().decode(all);   // decoded once: a chunk may split a character
};

/* ---------- step 3: EC-ElGamal ---------- */

/** Enc(Q, message), per chunk:
 *    k ← [1, n − 1] fresh from the CSPRNG     the ephemeral key (nonce)
 *    C₁ = kG                                  public: lets the receiver rebuild S
 *    S  = kQ                                  the shared secret, the one-time mask
 *    C₂ = M + S                               the masked message point
 *  Output (C₁, C₂). k and S are returned too, ONLY so the page can show them:
 *  a real sender destroys k — anyone holding it computes S = kQ without d. */
export function encrypt(Q, text) {
  return chunks(text).map((bytes) => {
    const { m, j, M } = encodeChunk(bytes);
    const k = randomScalar(1n, N - 1n);
    const C1 = mulG(k);
    const S = mul(k, Q);
    return { bytes, m, j, M, k, C1, S, C2: add(M, S) };
  });
}

/** C₁ must be an honest curve point: on y² = x³ + 7, coordinates in [0, p),
 *  not 𝒪. Without this check an attacker can send a point of a different,
 *  weak curve and learn d modulo small primes from the replies (invalid-curve
 *  attack, note "Attacking the toy ECC scheme" §6). */
export function validatePoint(pt, name = 'C₁') {
  if (!pt || pt.isInfinity) throw new Error(`${name} is the point at infinity`);
  if (pt.x < 0n || pt.x >= P || pt.y < 0n || pt.y >= P) throw new Error(`${name} has a coordinate outside [0, p)`);
  if (!isOnCurve(pt)) throw new Error(`${name} is not on secp256k1`);
}

/** Dec(d, (C₁, C₂)), per chunk:
 *    S' = dC₁ = d(kG) = k(dG) = kQ = S      Diffie–Hellman: same mask, no secret exchanged
 *    M  = C₂ − S'                           subtract the mask in the group
 *  then decode M to bytes. */
export function decrypt(d, ct) {
  const steps = ct.map(({ C1, C2 }) => {
    validatePoint(C1, 'C₁');
    validatePoint(C2, 'C₂');
    const S = mul(d, C1);
    const M = add(C2, neg(S));
    return { S, M, bytes: decodePoint(M) };
  });
  return { steps, text: joinText(steps.map((s) => s.bytes)) };
}

/* ---------- step 2: the naive scheme — DELIBERATELY BROKEN ---------- */

/** "Encrypt" by adding the public key: C = M + Q. The receiver can undo it,
 *  but so can everyone, because the mask Q is public. Exists only to show
 *  why the mask must be secret. */
export const naiveEncrypt = (Q, text) => chunks(text).map((bytes) => {
  const { M } = encodeChunk(bytes);
  return { M, C: add(M, Q) };
});

/** The attack on step 2, using public data only: M = C − Q. No d, no k. */
export function naiveAttack(Q, cts) {
  return joinText(cts.map(({ C }) => decodePoint(add(C, neg(Q)))));
}

/** What the same attacker gets on real ElGamal: C₂ − Q is M + kQ − Q, an
 *  unrelated point. Returned as the hex of its x so the page can show it. */
export const naiveAttackOnElGamal = (Q, { C2 }) => add(C2, neg(Q));

/* ---------- statistics of the ciphertext ---------- */

const bytes32 = (v) => {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
};

/** The bytes an observer sees: x‖y of C₁ and of C₂, 32 bytes each, big-endian.
 *  No 02/03/04 SEC prefix: it takes 1–3 fixed values and would spike the
 *  histogram (note "ECC vs Caesar" §5 caveat). The top byte of each
 *  coordinate is uniform too, because p is within 2³³ of 2²⁵⁶. */
export function ciphertextBytes(ct) {
  const out = [];
  for (const { C1, C2 } of ct) for (const v of [C1.x, C1.y, C2.x, C2.y]) out.push(...bytes32(v));
  return out;
}

export { G, N, P };
