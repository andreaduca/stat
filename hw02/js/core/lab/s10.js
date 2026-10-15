/* lab/s10.js — S10, the fragility of hash-based signatures (note 06 §5).
   A real Lamport key over an m-bit toy hash signs t messages; then a forger
   takes random new messages and checks whether every hash bit is covered by a
   revealed secret. When it is, the forger assembles the signature and the
   public key ACCEPTS it. Measured forgery rate against (1 − 2^−t)^m. */

import { SeededRng } from '../../../../assets/js/core/rng.js';
import { keygen, sign, verify, hashBits } from '../lamport.js';

export async function run({ m = 32, n = 2000, maxT = 8, seed = 1 }, progress = () => {}) {
  const rng = new SeededRng(seed);
  const rows = [];
  for (let t = 1; t <= maxT; t++) {
    let forged = 0, verified = 0;
    for (let trial = 0; trial < n; trial++) {
      const key = keygen(m, (len) => rng.bytes(len));
      // the owner signs t messages: each reveals one secret per bit position
      const revealed = Array.from({ length: m }, () => [null, null]);
      for (let j = 0; j < t; j++) {
        const msg = `payment ${rng.u32()}`, bits = hashBits(msg, m);
        sign(key, msg).forEach((x, i) => { revealed[i][bits[i]] = x; });
      }
      // the forger tries one fresh message
      const target = `forged ${rng.u32()}`;
      const bits = hashBits(target, m);
      if (bits.every((bit, i) => revealed[i][bit])) {
        forged++;
        if (verify(key.pub, target, bits.map((bit, i) => revealed[i][bit]))) verified++;
      }
      progress(((t - 1) * n + trial + 1) / (maxT * n));
    }
    rows.push({ t, trials: n, forged, verified, theory: (1 - 2 ** -t) ** m });
  }
  return { rows, m };
}
