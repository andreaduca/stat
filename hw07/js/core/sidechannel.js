/* sidechannel.js — a toy power side channel, simulated: the leakage of one 4-bit
   S-box output v = S(p ⊕ k) of PRESENT, without and with first-order Boolean masking.
   A device is leak-free when its traces are independent of the secret, so leakage
   assessment is a test of independence between a label (here HW(v), 5 classes) and
   the measured value (binned at its pooled quantiles). Simulated traces only: no
   hardware, no real measurements. [[Chi-square leakage detection in side channels]]. */

import { normal } from '../../../assets/js/core/samplers.js';
import { ContingencyTable, Binning } from './table.js';

/** The PRESENT S-box (Bogdanov et al., CHES 2007 📌). */
export const SBOX = [0xc, 0x5, 0x6, 0xb, 0x9, 0x0, 0xa, 0xd, 0x3, 0xe, 0xf, 0x8, 0x4, 0x7, 0x1, 0x2];

/** Hamming weight: the number of 1 bits, the usual model of the power a register draws when it switches. */
export const hw = (x) => { let n = 0; for (; x; x &= x - 1) n++; return n; };

/**
 * One simulated trace. Category: simulation.
 * Unprotected: L = HW(v) + N(0, σ²). Masked: v is never handled directly, only its shares
 * v ⊕ m and m, with m a fresh uniform 4-bit mask: L = HW(v ⊕ m) + HW(m) + N(0, σ²).
 * @returns {{label: number, leak: number}}  label = HW(v), the class the test groups by
 */
export function trace(rng, { masked, sigma, key }) {
  const p = rng.int(16), v = SBOX[p ^ key];
  const signal = masked ? (() => { const m = rng.int(16); return hw(v ^ m) + hw(m); })() : hw(v);
  return { label: hw(v), leak: signal + sigma * normal(rng) };
}

/** n traces, as typed arrays. */
export function traces(rng, n, opts) {
  const labels = new Uint8Array(n), leaks = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = trace(rng, opts); labels[i] = t.label; leaks[i] = t.leak; }
  return { labels, leaks };
}

/**
 * The leakage table: HW class (rows 0–4) × leakage bin (columns), bins at the pooled
 * sample quantiles of the leaks. Category: table. The edges are computed from all the leaks
 * together, which under H₀ carry no information about the labels, so the χ² test stays
 * valid (draft §4.5); df = 4 × (bins − 1) = 32 for 9 bins.
 */
export function leakageTable(labels, leaks, bins = 9, n = labels.length) {
  const sub = leaks.subarray ? leaks.subarray(0, n) : leaks.slice(0, n);
  const b = Binning.quantile(sub, bins);
  const t = new ContingencyTable(['HW 0', 'HW 1', 'HW 2', 'HW 3', 'HW 4'], b.labels());
  for (let i = 0; i < n; i++) t.add(labels[i], b.index(leaks[i]));
  return t;
}

/** The leaks of two HW classes, for Welch's t between HW 0 and HW 4 (the extreme classes, the
 *  best case for a test of means). */
export function classLeaks(labels, leaks, a, b, n = labels.length) {
  const A = [], B = [];
  for (let i = 0; i < n; i++) { if (labels[i] === a) A.push(leaks[i]); else if (labels[i] === b) B.push(leaks[i]); }
  return [A, B];
}

/**
 * The exact masking lemma, by enumerating all 16 masks for each v.
 * Category: theorem, checked by exhaustion. For every v, E[HW(v ⊕ m) + HW(m)] = 4, but
 * Var = 4 − HW(v): bit by bit, a 0 bit of v contributes 2m_b ∈ {0, 2} (mean 1, variance 1),
 * a 1 bit contributes (1 − m_b) + m_b = 1 (mean 1, variance 0).
 * So every test of equal means has power equal to its level; a test of independence does not.
 * @returns {{v: number, hw: number, mean: number, variance: number}[]}
 */
export function lemmaTable() {
  return Array.from({ length: 16 }, (_, v) => {
    const xs = Array.from({ length: 16 }, (_, m) => hw(v ^ m) + hw(m));
    const mean = xs.reduce((s, x) => s + x, 0) / 16;
    return { v, hw: hw(v), mean, variance: xs.reduce((s, x) => s + (x - mean) ** 2, 0) / 16 };
  });
}
