/* lab/s7.js — S7, Shor in miniature (note 06 §3). On a toy curve of prime
   order n, take Q = kP and the function f(a, b) = aP + bQ on Z_n × Z_n. The
   set of (a, b) where f hits one fixed point is a LINE, a + k·b ≡ c, because
   aP + bQ = (a + kb)P. Its 2-D discrete Fourier transform is therefore zero
   everywhere except on the line of frequencies v ≡ k·u — and any non-zero
   peak (u, v) gives the secret: k = v·u⁻¹ mod n. With a hash in place of the
   group law the level set is scattered and the spectrum is noise.
   Classically this costs n² evaluations, worse than trying every k: it shows
   the PRINCIPLE that Shor's algorithm exploits (a hidden period), not a speed-up. */

import { sha256 } from '../sha256.js';
import { utf8 } from '../bytes.js';

/** The level set {(a, b) : f(a, b) = target}, for the curve or for the hash. */
export function levelSet({ curve, P, n, k }, mode) {
  const set = [];
  if (mode === 'curve') {
    const Q = curve.mul(BigInt(k), P);
    const target = P;                                  // f(a, b) = P  ⇔  a + k·b ≡ 1
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const v = curve.add(curve.mul(BigInt(a), P), curve.mul(BigInt(b), Q));
      if (v.eq(target)) set.push([a, b]);
    }
  } else {
    // a hash has no group law: f(a, b) = SHA-256("a,b") mod n, level set f = 1
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const h = sha256(utf8(`${a},${b}`));
      if ((((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0) % n === 1) set.push([a, b]);
    }
  }
  return set;
}

/** |F(u, v)| = |Σ_{(a,b) ∈ set} e^(−2πi(ua + vb)/n)| for every frequency (u, v):
 *  a naive DFT over the set's points only, so O(n² · |set|) ≈ O(n³). */
export function spectrum(set, n) {
  const cos = new Float64Array(n), sin = new Float64Array(n);
  for (let j = 0; j < n; j++) { cos[j] = Math.cos((2 * Math.PI * j) / n); sin[j] = Math.sin((2 * Math.PI * j) / n); }
  const mag = new Float64Array(n * n);
  for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
    let re = 0, im = 0;
    for (const [a, b] of set) { const j = (u * a + v * b) % n; re += cos[j]; im -= sin[j]; }
    mag[u * n + v] = Math.hypot(re, im);
  }
  return mag;
}

/** Peaks off the origin and the k each one gives, k = v·u⁻¹ mod n. */
export function peaks(mag, n, threshold = 0.5) {
  const inv = (u) => { for (let x = 1; x < n; x++) if ((u * x) % n === 1) return x; return null; };
  const max = Math.max(...mag.filter((_, i) => i !== 0));
  const out = [];
  for (let u = 1; u < n; u++) for (let v = 0; v < n; v++) {
    if (mag[u * n + v] >= threshold * max) out.push({ u, v, k: (v * inv(u)) % n, mag: mag[u * n + v] });
  }
  return out;
}
