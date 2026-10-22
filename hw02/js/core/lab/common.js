/* lab/common.js — pieces shared by the statistics-lab experiments: random
   simulation keys from the seeded PRNG, and the battery of uniformity tests
   run on a sample of addresses (S3, S5a). Note 07 §4. */

import { chiSquare, monobit, zPValue, bonferroni } from '../../../../assets/js/core/stats.js';
import { bytesToBigInt, bytesToHex } from '../bytes.js';
import { N } from '../../../../assets/js/core/secp256k1.js';
import { eip55 } from '../address.js';

/** A simulation key: 32 PRNG bytes reduced to [1, n − 1]. Reproducible from
 *  the seed, hence worthless as a real key — which is exactly right here. */
export const simulationKey = (rng) => (bytesToBigInt(rng.bytes(32)) % (N - 1n)) + 1n;

/** The tests of note 07 §4 on a list of 20-byte addresses:
 *    hex-digit χ²  — 40 digits per address, 16 categories, df 15
 *    byte χ²       — 20 bytes per address, 256 categories, df 255
 *    monobit       — all 160 bits per address
 *    per position  — a z-test for each of the 160 bit positions, with the
 *                    largest |z| corrected by Bonferroni for 160 tests
 *    EIP-55        — uppercase share among letters, letters per address (optional)
 *  Every test is reported, never a selection: that is the multiple-testing lesson. */
export function addressTests(addresses, { withEip55 = false } = {}) {
  const hex = new Array(16).fill(0), bytes = new Array(256).fill(0), ones = new Array(160).fill(0);
  let totalOnes = 0, upper = 0, letters = 0;
  for (const a of addresses) {
    for (let i = 0; i < 20; i++) {
      const b = a[i];
      bytes[b]++;
      hex[b >> 4]++; hex[b & 15]++;
      for (let j = 0; j < 8; j++) if ((b >> (7 - j)) & 1) { ones[8 * i + j]++; totalOnes++; }
    }
    if (withEip55) {
      const { table } = eip55(bytesToHex(a));
      for (const t of table) if (t.letter) { letters++; if (t.upper) upper++; }
    }
  }
  const n = addresses.length;
  const z = ones.map((k) => (k - n / 2) / Math.sqrt(n / 4));
  let at = 0;
  z.forEach((v, i) => { if (Math.abs(v) > Math.abs(z[at])) at = i; });
  return {
    n,
    hex: { counts: hex, ...chiSquare(hex) },
    bytes: chiSquare(bytes),
    monobit: monobit(totalOnes, 160 * n),
    positions: { z, maxAt: at, maxZ: z[at], pBonferroni: bonferroni(zPValue(z[at]), 160) },
    eip55: withEip55 ? { upperShare: upper / letters, lettersPerAddress: letters / n } : null,
  };
}
