/* gelu.js — Φ inside a neural network: GELU(x) = x·Φ(x), the activation of BERT and
   GPT-style transformers, against the tanh approximation those models were trained
   with. Pure, no DOM. Note 06 §5. */

import { Phi } from './normal.js';

/** GELU(x) = x Φ(x) with the accurate Φ (M7). Category: special function (application).
 *  Hendrycks & Gimpel 2016 [S]: weigh the input by the probability that a standard normal is below it. */
export const gelu = (x) => x * Phi(x);

/** The tanh approximation ½x(1 + tanh(√(2/π)(x + 0.044715x³))), chosen in 2016 because erf
 *  was missing or slow on the hardware of the time. Category: approximation. */
export const geluTanh = (x) => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));

/** max |gelu − geluTanh| on [lo, hi] over a grid of `points`, and where it occurs. */
export function geluMaxError(lo = -10, hi = 10, points = 200001) {
  let worst = 0, at = lo;
  for (let i = 0; i < points; i++) {
    const x = lo + ((hi - lo) * i) / (points - 1), e = Math.abs(gelu(x) - geluTanh(x));
    if (e > worst) { worst = e; at = x; }
  }
  return { maxError: worst, at };
}
