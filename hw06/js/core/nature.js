/* nature.js — the two small models of the Nature page: a lake whose volume is
   measured by columns (Riemann: cut the surface into cells, depth × area) and by
   contour slabs (Lebesgue: cut the depth into layers, area inside each contour ×
   thickness), and a Galton board whose bins fill like a binomial and look like
   the normal curve. Pure, no DOM. Note 05. */

/**
 * A synthetic bathymetry on the unit square: depth in metres at (x, y), a basin made of
 * a few Gaussian hollows, zero on the shore. Category: model (no real lake).
 */
export function depth(x, y) {
  const g = (cx, cy, s, h) => h * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
  const d = g(0.45, 0.5, 0.2, 30) + g(0.7, 0.35, 0.09, 14) + g(0.3, 0.7, 0.08, 10) - 6;
  return Math.max(0, d);
}

/** The depths on an n × n grid of cell centres (row-major), and the cell area (km² if the side is 1 km). */
export function lakeGrid(n) {
  const d = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d[i * n + j] = depth((j + 0.5) / n, (i + 0.5) / n);
  return { n, d, cell: 1 / (n * n) };
}

/** Volume by columns: Σ depth × cell area. Category: Riemann rule (2-D midpoint). */
export const volumeColumns = ({ d, cell }) => d.reduce((s, v) => s + v, 0) * cell;

/**
 * Volume by slabs: Σ_k Δ · area{depth > (k + ½)Δ}, K slabs of thickness Δ = max/K — the
 * area of each slab is what a contour map gives (count the cells inside the contour).
 * Category: Lebesgue rule (layer cake). With K = the number of distinct depths it is the
 * same sum as volumeColumns, regrouped; with fewer slabs it is the layer-cake midpoint.
 * @returns {{volume: number, slabs: {t: number, area: number}[]}}
 */
export function volumeSlabs({ d, cell }, K) {
  const max = d.reduce((m, v) => Math.max(m, v), 0), dt = max / K, slabs = [];
  let vol = 0;
  for (let k = 0; k < K; k++) {
    const t = (k + 0.5) * dt;
    let count = 0;
    for (const v of d) if (v > t) count++;
    slabs.push({ t, area: count * cell });
    vol += dt * count * cell;
  }
  return { volume: vol, slabs, dt };
}

/**
 * A Galton board: each ball meets `rows` pegs and goes right with probability ½ at each,
 * so its bin is Binomial(rows, ½). Category: simulation. The counts approach the binomial,
 * whose shape approaches the normal N(rows/2, rows/4) (de Moivre–Laplace, the first CLT).
 */
export function galton(rows, balls, rng) {
  const counts = new Array(rows + 1).fill(0);
  for (let b = 0; b < balls; b++) {
    let k = 0;
    for (let r = 0; r < rows; r += 32) {
      const bits = rng.u32(), take = Math.min(32, rows - r);
      let v = take === 32 ? bits : bits & ((1 << take) - 1);
      while (v) { v &= v - 1; k++; }                 // popcount: one bit per peg
    }
    counts[k]++;
  }
  return counts;
}
