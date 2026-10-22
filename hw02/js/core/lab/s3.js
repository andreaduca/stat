/* lab/s3.js — S3, uniformity of addresses (note 07 §4): N addresses from
   random simulation keys, put through the battery of tests in common.js.
   The point is as much the tests' behaviour as the addresses': with ~165 tests
   per sample, a few "significant" results at 5 % are expected by chance. */

import { SeededRng } from '../../../../assets/js/core/rng.js';
import { bytesToHex, hexToBytes } from '../bytes.js';
import { mulG, ethereumHex } from '../../../../assets/js/core/secp256k1.js';
import { keccak256 } from '../keccak.js';
import { simulationKey, addressTests } from './common.js';

export async function run({ n = 6000, seed = 1 }, progress = () => {}) {
  const rng = new SeededRng(seed);
  const addresses = [];
  for (let i = 0; i < n; i++) {
    const Q = mulG(simulationKey(rng));
    addresses.push(keccak256(hexToBytes(ethereumHex(Q))).slice(12));   // Q → address
    if (i % 100 === 99) progress((i + 1) / n);
  }
  return { tests: addressTests(addresses, { withEip55: true }), sample: addresses.slice(0, 2000).map(bytesToHex) };
}
