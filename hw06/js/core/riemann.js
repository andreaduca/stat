/* riemann.js — integration by cutting the DOMAIN: N equal cells of [a, b], one
   height per cell. The classical rules (left, right, midpoint, trapezoid, Simpson),
   general Riemann sums with a tag strategy, and Darboux upper and lower sums.
   Every evaluation of f is counted through Integrand.eval. Pure, no DOM.
   Note 01 §1–3; [[Riemann integral]]; [[Newton-Cotes quadrature error]]. */

/** The value and the cost, as every method of hw06 reports them. */
const result = (fn, start, value) => ({ value, evals: fn.evals - start });

/**
 * Left and right endpoint rules: h Σ f(a + ih), i = 0..N−1 (left) or 1..N (right).
 * Category: Riemann rule. Error O(h) = O(1/N) for smooth f: the first-order Taylor
 * term does not cancel. [[Newton-Cotes quadrature error]] Thm 1.
 */
export function left(fn, N) {
  const start = fn.evals, h = (fn.b - fn.a) / N;
  let s = 0;
  for (let i = 0; i < N; i++) s += fn.eval(fn.a + i * h);
  return result(fn, start, s * h);
}
export function right(fn, N) {
  const start = fn.evals, h = (fn.b - fn.a) / N;
  let s = 0;
  for (let i = 1; i <= N; i++) s += fn.eval(fn.a + i * h);
  return result(fn, start, s * h);
}

/**
 * Midpoint rule: h Σ f(a + (i + ½)h).
 * Category: Riemann rule. Error −(b − a)h² f″(ξ)/24 = O(N⁻²): the linear Taylor
 * term cancels by symmetry inside each cell. Never evaluates the endpoints, so it
 * works on f5 = x^{−1/2} (but slowly: the singularity costs O(N^{−1/2})).
 */
export function midpoint(fn, N) {
  const start = fn.evals, h = (fn.b - fn.a) / N;
  let s = 0;
  for (let i = 0; i < N; i++) s += fn.eval(fn.a + (i + 0.5) * h);
  return result(fn, start, s * h);
}

/**
 * Trapezoid rule: h (f₀/2 + f₁ + … + f_{N−1} + f_N/2).
 * Category: Riemann rule (the average of left and right). Error (b − a)h² f″(ξ)/12:
 * twice the midpoint's, opposite sign. Exact for periodic analytic f over a period (not used here).
 */
export function trapezoid(fn, N) {
  const start = fn.evals, h = (fn.b - fn.a) / N;
  let s = (fn.eval(fn.a) + fn.eval(fn.b)) / 2;
  for (let i = 1; i < N; i++) s += fn.eval(fn.a + i * h);
  return result(fn, start, s * h);
}

/**
 * Composite Simpson: (h/3)(f₀ + 4f₁ + 2f₂ + 4f₃ + … + 4f_{N−1} + f_N), N even.
 * Category: Riemann rule (Newton–Cotes of degree 2; exact for cubics).
 * Error −(b − a)h⁴ f⁽⁴⁾(ξ)/180 = O(N⁻⁴) for smooth f; on a jump it drops to O(1/N).
 */
export function simpson(fn, N) {
  if (N % 2) N += 1;
  const start = fn.evals, h = (fn.b - fn.a) / N;
  let s = fn.eval(fn.a) + fn.eval(fn.b);
  for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * fn.eval(fn.a + i * h);
  return result(fn, start, (s * h) / 3);
}

/** The rules by name, for pickers and sweeps. Order of convergence for smooth f in `order`. */
export const RULES = {
  left: { run: left, label: 'left endpoint', order: 1 },
  right: { run: right, label: 'right endpoint', order: 1 },
  midpoint: { run: midpoint, label: 'midpoint', order: 2 },
  trapezoid: { run: trapezoid, label: 'trapezoid', order: 2 },
  simpson: { run: simpson, label: 'Simpson', order: 4 },
};

/**
 * A general Riemann sum Σ f(ξ_i) Δx_i on N equal cells, with the tag ξ_i chosen by a strategy.
 * Category: Riemann sum. The definition of the Riemann integral asks the limit to be the
 * same for EVERY choice of tags; P3 and Dirichlet are where it is not.
 * @param {'left'|'mid'|'right'|'random'|((i:number, l:number, r:number)=>number)} tags
 * @param {{float: () => number}} [rng]  for 'random' (a seeded generator)
 */
export function riemannSum(fn, N, tags = 'mid', rng = null) {
  const start = fn.evals, h = (fn.b - fn.a) / N;
  let s = 0;
  for (let i = 0; i < N; i++) {
    const l = fn.a + i * h, r = l + h;
    const x = tags === 'left' ? l : tags === 'right' ? r : tags === 'mid' ? l + h / 2
      : tags === 'random' ? l + rng.float() * h : tags(i, l, r);
    s += fn.eval(x);
  }
  return result(fn, start, s * h);
}

/**
 * Darboux lower and upper sums: Σ inf_cell f · h and Σ sup_cell f · h.
 * Category: Darboux sum. f is Riemann integrable iff upper − lower → 0 [T]; every Riemann
 * sum lies between the two. inf and sup come from the integrand's own analysis (bounds):
 * monotone pieces, or an exact construction (P3); infinite for f5's first cell.
 * @returns {{lower: number, upper: number}}
 */
export function darboux(fn, N) {
  const h = (fn.b - fn.a) / N;
  let lo = 0, hi = 0;
  for (let i = 0; i < N; i++) {
    const l = fn.a + i * h, { inf, sup } = fn.bounds(l, i === N - 1 ? fn.b : l + h);
    lo += inf; hi += sup;
  }
  return { lower: lo * h, upper: hi * h };
}
