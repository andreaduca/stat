/* lab/s8.js — S8, the structure test (note 06 §1, HMWK 1 E5): for random a, b,
   how often does f(a + b) = f(a) + f(b)?
     f(k) = kG          always: scalar multiplication is a homomorphism
     f(k) = H(k) mod n  only by accident, probability 1/n
   Run on secp256k1 (n ≈ 2²⁵⁶, so the hash never matches) and on the toy curve
   C5 (n = 139, so the accidental matches are frequent enough to count). */

import { SeededRng } from '../../../../assets/js/core/rng.js';
import { bytesToBigInt, bigIntToBytes } from '../bytes.js';
import { keccak256 } from '../keccak.js';
import { N, mulG, add } from '../secp256k1.js';
import { TOY_CURVES } from '../toycurves.js';
import { simulationKey } from './common.js';

const hashMod = (k, n) => bytesToBigInt(keccak256(bigIntToBytes(k))) % n;   // Keccak-256 truncated to Z_n

export async function run({ n = 1000, seed = 1 }, progress = () => {}) {
  const rng = new SeededRng(seed);
  const counts = { ecBig: 0, hashBig: 0, ecToy: 0, hashToy: 0 };
  const { curve, P, n: small } = TOY_CURVES.C5;
  const ns = BigInt(small);
  for (let i = 0; i < n; i++) {
    // secp256k1
    const a = simulationKey(rng), b = simulationKey(rng), s = (a + b) % N;
    const left = mulG(s), right = add(mulG(a), mulG(b));
    if (left.x === right.x && left.y === right.y) counts.ecBig++;
    if (hashMod(s, N) === (hashMod(a, N) + hashMod(b, N)) % N) counts.hashBig++;
    // toy curve C5
    const x = BigInt(rng.int(small)), y = BigInt(rng.int(small)), z = (x + y) % ns;
    if (curve.mul(z, P).eq(curve.add(curve.mul(x, P), curve.mul(y, P)))) counts.ecToy++;   // 𝒪.eq(𝒪) holds too
    if (hashMod(z, ns) === (hashMod(x, ns) + hashMod(y, ns)) % ns) counts.hashToy++;
    if (i % 20 === 19) progress((i + 1) / n);
  }
  return { counts, n, small };
}
