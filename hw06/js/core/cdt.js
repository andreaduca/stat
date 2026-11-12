/* cdt.js — Gaussian sampling for lattice cryptography, simulated: the discrete
   Gaussian on {−T..T}, its cumulative distribution table (CDT) quantised to b bits,
   the statistical distance that quantisation costs, and two samplers that read the
   table — one that stops early (fast, and its running time reveals the sample) and
   one that always scans the whole table (constant time). A SIMULATION of a crypto
   component, not an implementation to deploy. Pure, no DOM.
   Note 06 §2; [[Discrete Gaussian and CDT sampling]]; [[Statistical distance]]. */

import TABLES from '../../data/cdt-tables.js';

/**
 * The discrete Gaussian D_σ on {−T, …, T}: P(x) ∝ e^{−x²/(2σ²)}, normalised.
 * Category: distribution. Its CDF F_i = Σ_{j ≤ i} P(j) is a Φ-like table: for σ ≫ 1,
 * F_i ≈ Φ((i + ½)/σ). Lattice schemes (Falcon, FrodoKEM, BLISS) need samples from it, with
 * the tail cut at T = ⌈13σ⌉ or so, where the mass left out is below 2⁻¹²⁸.
 * @returns {{support: number[], p: number[], F: number[]}}
 */
export function discreteGaussian(sigma, T) {
  const support = [], w = [];
  for (let x = -T; x <= T; x++) { support.push(x); w.push(Math.exp(-(x * x) / (2 * sigma * sigma))); }
  const total = w.reduce((s, v) => s + v, 0);
  const p = w.map((v) => v / total);
  const F = [];
  let acc = 0;
  for (const v of p) { acc += v; F.push(acc); }
  F[F.length - 1] = 1;
  return { support, p, F };
}

/** The 80-digit reference table for (σ, T), if hw06/tools/reference.py computed one. */
export const referenceTable = (sigma, T) => TABLES.find((t) => t.sigma === sigma && t.T === T) ?? null;

/** The σ values with an 80-digit reference table (T = ⌈13σ⌉). */
export const REFERENCE_SIGMAS = TABLES.map((t) => t.sigma);

/**
 * The CDT with b bits: C_i = ⌊2^b F_i⌋, last entry 2^b. A uniform b-bit integer r then
 * selects the i with C_{i−1} ≤ r < C_i, which has probability q_i = (C_i − C_{i−1})/2^b.
 * Category: quantisation of a distribution.
 *   b ≤ 52: Numbers, from double F_i.
 *   b > 52: BigInt. From the 80-digit reference when there is one (source 'reference'),
 *   otherwise from the double F_i (source 'double'): a double has 53 significant bits, so
 *   2^64 F_i built from it has its last ≈ 11 bits wrong or zero — the lesson of E13.
 * @param {{sigma: number, T: number, bits: number, source?: 'auto'|'double'}} o
 */
export function buildCDT({ sigma, T, bits, source = 'auto' }) {
  const { support, p, F } = discreteGaussian(sigma, T);
  const ref = referenceTable(sigma, T);
  let C, from;
  if (bits <= 52) {
    const scale = 2 ** bits;
    C = F.map((f) => Math.floor(scale * f));
    C[C.length - 1] = scale;
    from = 'double';
  } else if (ref && source === 'auto' && ref[`b${bits}`]?.C) {
    C = ref[`b${bits}`].C.map(BigInt);
    from = 'reference';
  } else {
    const scale = 2 ** bits;                       // exact power of two as a double
    C = F.map((f) => BigInt(Math.floor(scale * f)));
    C[C.length - 1] = 1n << BigInt(bits);
    from = 'double';
  }
  const q = C.map((c, i) => (bits <= 52 ? c - (i ? C[i - 1] : 0) : c - (i ? C[i - 1] : 0n)));
  const zeros = q.filter((v) => (bits <= 52 ? v === 0 : v === 0n)).length;
  const pmf = ref ? ref.pmf : p.map(String);
  return { sigma, T, bits, support, p, F, C, q, zeros, from, sd: statisticalDistance(pmf, q, bits) };
}

/**
 * Statistical (total-variation) distance ½ Σ |p_i − q_i/2^b| between the ideal and the
 * quantised distribution. Category: statistical distance.
 * Computed exactly in BigInt from decimal strings of p_i (25 digits from the reference, or
 * the double's own digits): in doubles the difference p_i − q_i/2^b, of order 2^{−b}, would
 * be lost in the rounding of p_i itself once b ≥ 48. The bound SD ≤ n·2^{−b} holds because
 * each |p_i − q_i/2^b| < 2^{−b} (floors of a CDF move each mass by less than one unit).
 */
export function statisticalDistance(pmf, q, bits) {
  const D = 30n, TEN = 10n ** D, scale = 1n << BigInt(bits);
  let sum = 0n;
  for (let i = 0; i < pmf.length; i++) {
    const P = decimalToScaled(String(pmf[i]), D);           // p_i · 10^30, rounded
    const diff = P * scale - BigInt(q[i]) * TEN;             // (p_i − q_i/2^b) · 2^b · 10^30
    sum += diff < 0n ? -diff : diff;
  }
  // SD = sum / (2 · 2^b · 10^30); both sides fit a double's range, and 16 digits are plenty
  return Number(sum) / (2 * 2 ** bits * 1e30);
}

/** A decimal string (e.g. '5.39e-2', '0.25') times 10^D, as a rounded BigInt. */
function decimalToScaled(s, D) {
  const m = /^(-?)(\d+)(?:\.(\d*))?(?:e([-+]?\d+))?$/i.exec(s.trim());
  if (!m) throw new Error(`not a decimal: ${s}`);
  const digits = BigInt((m[2] + (m[3] ?? '')) || '0');
  let exp = Number(m[4] ?? 0) - (m[3] ?? '').length + Number(D);
  if (exp >= 0) return digits * 10n ** BigInt(exp);
  const div = 10n ** BigInt(-exp);
  return (digits + div / 2n) / div;
}

/** A uniform b-bit integer from the seeded generator: a Number for b ≤ 32, a BigInt above. */
export function uniformBits(rng, bits) {
  if (bits <= 32) return bits === 32 ? rng.u32() : rng.u32() >>> (32 - bits);
  let r = 0n, have = 0;
  while (have < bits) { r = (r << 32n) | BigInt(rng.u32()); have += 32; }
  return r >> BigInt(have - bits);
}

/**
 * Early-exit sampler: scan the table from the left and stop at the first C_i > r.
 * Category: sampler (variable time). Comparisons = i + 1, so the number of comparisons —
 * the running time — is a function of the output: an attacker who can time it learns
 * |x| for free. For σ = 2, T = 26 the mean is 27 comparisons with SD 2 (= σ). This is the
 * leak behind the BLISS cache-timing attack (Groot Bruinderink et al., CHES 2016) [S].
 */
export function sampleEarlyExit(table, rng) {
  const r = uniformBits(rng, table.bits), C = table.C;
  let i = 0;
  while (r >= C[i]) i++;
  return { x: table.support[i], comparisons: i + 1 };
}

/**
 * Constant-time sampler: compare r with EVERY entry and add up the results, without a
 * branch on secret data: idx = Σ_i [r ≥ C_i].
 * Category: sampler (constant time). For b ≤ 31 the comparison is the sign bit of
 * C_i − 1 − r, read with >>> 31 (no if). Always 2T + 1 comparisons (53 for T = 26): the
 * time says nothing about x. In JavaScript the engine may still branch internally — this
 * shows the idea, not a guarantee (real implementations are in C, checked with tools).
 */
export function sampleConstantTime(table, rng) {
  const r = uniformBits(rng, table.bits), C = table.C, n = C.length;
  let idx = 0;
  if (table.bits <= 31) for (let i = 0; i < n; i++) idx += ((C[i] - 1 - r) >>> 31);
  else if (table.bits <= 52) for (let i = 0; i < n; i++) idx += +(r >= C[i]);
  else for (let i = 0; i < n; i++) idx += +(r >= C[i]);
  return { x: table.support[Math.min(idx, n - 1)], comparisons: n };
}
