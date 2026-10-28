/* simulate.js — the Monte Carlo engine: m attackers, each probing n_max systems
   in turn, every step an independent draw of the step model. One pass per
   attacker records Sₙ at each checkpoint n of the grid (the three quantities
   Sₙ, Sₙ/n, Sₙ/√n are all derived from it: one simulation, three views), the
   whole path of the first few attackers (for the trajectory plots), and on
   request the running maximum and the first time a level a is reached.
   Pure, no DOM: it runs in the Web Worker and under Node.
   HMWK4 note 03 (simulation design); [[Monte Carlo estimation]]. */

import { SeededRng } from '../../../assets/js/core/rng.js';
import { popcount32, geometricGap, beta as betaDraw } from './sampling.js';

/** Default checkpoints: a geometric grid, so log axes are evenly filled. */
export const GRID = [10, 30, 100, 300, 1000, 3000, 10000];

/* Per-byte tables for the symmetric walk. Bits are read least significant
   first: bit i of a word is the step after bit i − 1. For a byte b,
   SUM8[b] is the Rademacher sum of its 8 steps and PRE8[b] the highest partial
   sum reached inside it (max over j = 1..8 of the first j steps). With them the
   running maximum advances 8 steps at a time: M ← max(M, S + PRE8[b]). */
const SUM8 = new Int8Array(256), PRE8 = new Int8Array(256);
for (let b = 0; b < 256; b++) {
  let s = 0, best = -9;
  for (let i = 0; i < 8; i++) { s += (b >> i) & 1 ? 1 : -1; if (s > best) best = s; }
  SUM8[b] = s; PRE8[b] = best;
}

/** A path kept for drawing, reduced to about a thousand points without losing
 *  its excursions: every step up to k = 256 (the trajectory explorer reveals the
 *  first 50 steps one by one), then geometric buckets in k — even on a log axis —
 *  each keeping its lowest, its highest and its last point. */
class PathRecorder {
  constructor(nmax) {
    this.exact = nmax <= 1000 ? nmax : 256;
    this.ratio = nmax > this.exact ? Math.pow(nmax / this.exact, 1 / 240) : 1;
    this.edge = this.exact;
    this.ks = [0]; this.vs = [0];
    this.bucket = null;
  }
  push(k, s) {
    if (k <= this.exact) { this.ks.push(k); this.vs.push(s); return; }
    if (k > this.edge) {
      this.flush();
      while (this.edge < k) this.edge = Math.max(this.edge + 1, Math.ceil(this.edge * this.ratio));
    }
    const b = this.bucket;
    if (!b) { this.bucket = { lo: [k, s], hi: [k, s], end: [k, s] }; return; }
    if (s < b.lo[1]) b.lo = [k, s];
    if (s > b.hi[1]) b.hi = [k, s];
    b.end = [k, s];
  }
  flush() {
    if (!this.bucket) return;
    const pts = [this.bucket.lo, this.bucket.hi, this.bucket.end].sort((a, c) => a[0] - c[0]);
    for (const [k, s] of pts) if (k !== this.ks.at(-1)) { this.ks.push(k); this.vs.push(s); }
    this.bucket = null;
  }
  done() { this.flush(); return { k: Int32Array.from(this.ks), S: Int32Array.from(this.vs) }; }
}

/** Which engine draws the steps.
 *    'naive' — one uniform per step, X = success if U < p. The reference: obviously
 *              right, used to check the fast engines in distribution.
 *    'bits'  — p = ½ only: one 32-bit word = 32 fair steps (bit 1 = success);
 *              a whole word adds 2·popcount − 32 (Rademacher) or popcount (Bernoulli ½).
 *    'skip'  — Bernoulli(p): jump over the runs of the common outcome with a
 *              geometric gap (exact in law, ~1/p times fewer draws for small p).
 *  'auto' picks bits for p = ½ and skip otherwise. With 'bits', Rademacher and
 *  Bernoulli ½ from the same seed read the same bits: the two paths are then
 *  exactly Sᴿ = 2Sᴮ − k (the toggle on the Model & paths page). */
function pickEngine(model, engine) {
  if (engine !== 'auto') return engine;
  return !model.heterogeneous && model.coin === 0.5 ? 'bits' : 'skip';
}

export class Simulation {
  /**
   * @param {object} o
   * @param {import('./models.js').StepModel} o.model
   * @param {number} o.m          attackers (independent trajectories)
   * @param {number[]} [o.grid]   checkpoints n, increasing; n_max is the last
   * @param {number} o.seed       32-bit seed of xoshiro128** (shown with every result)
   * @param {number} [o.keepPaths] how many attackers' whole paths to keep (≤ 50)
   * @param {number|null} [o.threshold]  level a whose first hitting time Tₐ is recorded
   * @param {boolean} [o.trackMax] record the running maximum Mₙ at each checkpoint
   * @param {'auto'|'naive'|'bits'|'skip'} [o.engine]
   */
  constructor({ model, m, grid = GRID, seed, keepPaths = 20, threshold = null, trackMax = false, engine = 'auto' }) {
    if (!(m >= 1)) throw new Error('m must be at least 1');
    this.model = model;
    this.m = Math.floor(m);
    this.grid = [...grid].sort((a, b) => a - b);
    this.seed = seed >>> 0;
    this.keepPaths = Math.min(keepPaths, this.m, 50);
    this.threshold = threshold;
    this.trackMax = trackMax;
    this.engine = pickEngine(model, engine);
    if (this.engine === 'bits' && (model.coin !== 0.5 || model.heterogeneous)) throw new Error('the bits engine needs p = ½');
  }

  /** Run all m attackers, one after the other from one generator stream, so a
   *  run with more attackers starts with exactly the attackers of a smaller one.
   *  @param {(fraction: number) => void} [onProgress]
   *  @returns the SimulationResult: S is row-major, S[j·G + c] = Sₙ of attacker j at grid[c]. */
  run(onProgress = () => {}) {
    const { model, m, grid } = this, G = grid.length;
    const rng = new SeededRng(this.seed);
    const S = new Int32Array(m * G);
    const maxS = this.trackMax ? new Int32Array(m * G) : null;
    const hitTime = this.threshold !== null ? new Int32Array(m).fill(-1) : null;
    const pj = model.heterogeneous ? new Float64Array(m) : null;
    const paths = [];
    const every = Math.max(1, Math.floor(m / 100));

    for (let j = 0; j < m; j++) {
      const keep = j < this.keepPaths ? new PathRecorder(grid[G - 1]) : null;
      const out = { S, maxS, hitTime, row: j * G, j };
      if (this.engine === 'bits') this.#bits(rng, out, keep);
      else {
        const p = pj ? (pj[j] = betaDraw(rng, model.alpha, model.beta)) : model.coin;
        if (this.engine === 'skip') this.#skip(rng, out, keep, p);
        else this.#naive(rng, out, keep, p);
      }
      if (keep) paths.push({ attacker: j, ...keep.done() });
      if (j % every === 0) onProgress(j / m);
    }
    onProgress(1);
    return {
      model: { kind: model.kind, p: model.p, alpha: model.alpha ?? null, beta: model.beta ?? null, heterogeneous: !!model.heterogeneous },
      m, seed: this.seed, grid, engine: this.engine, threshold: this.threshold,
      S, maxS, hitTime, pj, paths,
    };
  }

  /* One step at a time: the slow but transparent loop, shared by the naive
     engine and by the moments where a fast engine must look inside a word
     (a checkpoint falls in it, a level may be reached in it, a path is kept). */
  #walker(out, keep) {
    const { grid } = this, a = this.threshold;
    const w = { S: 0, M: 0, k: 0, c: 0 };
    w.step = (x) => {
      w.S += x; w.k++;
      if (w.S > w.M) w.M = w.S;
      if (a !== null && out.hitTime[out.j] < 0 && w.S >= a) out.hitTime[out.j] = w.k;
      if (keep) keep.push(w.k, w.S);
      if (w.k === grid[w.c]) this.#record(out, w);
    };
    return w;
  }

  #record(out, w) {
    out.S[out.row + w.c] = w.S;
    if (out.maxS) out.maxS[out.row + w.c] = w.M;
    w.c++;
  }

  #naive(rng, out, keep, p) {
    const [lo, hi] = this.model.values;
    const w = this.#walker(out, keep), nmax = this.grid.at(-1);
    while (w.k < nmax) w.step(rng.float() < p ? hi : lo);
  }

  #bits(rng, out, keep) {
    const rad = this.model.kind === 'rademacher';
    const w = this.#walker(out, keep), nmax = this.grid.at(-1), grid = this.grid;
    const a = this.threshold, tracking = this.trackMax || a !== null;
    while (w.k < nmax) {
      const word = rng.u32();
      const len = Math.min(32, nmax - w.k);
      const next = grid[w.c];
      if (!keep && !tracking && len === 32 && w.k + 32 <= next) {
        // the fast path: 32 steps in one popcount
        const ones = popcount32(word);
        w.S += rad ? 2 * ones - 32 : ones;
        w.k += 32;
        if (w.k === next) this.#record(out, w);
        continue;
      }
      if (!keep && tracking && rad) {
        // byte by byte with the prefix-maximum table; bit by bit only for a
        // byte that contains a checkpoint or may reach the level a for the first time
        for (let i = 0; i < len; i += 8) {
          const b = (word >>> i) & 255, blen = Math.min(8, len - i);
          const mayHit = a !== null && out.hitTime[out.j] < 0 && w.S + PRE8[b] >= a;
          if (blen === 8 && w.k + 8 < grid[w.c] && !mayHit) {
            if (w.S + PRE8[b] > w.M) w.M = w.S + PRE8[b];
            w.S += SUM8[b]; w.k += 8;
          } else {
            for (let t = 0; t < blen; t++) w.step((b >> t) & 1 ? 1 : -1);
          }
        }
        continue;
      }
      for (let i = 0; i < len; i++) w.step((word >>> i) & 1 ? 1 : rad ? -1 : 0);
    }
  }

  /** Bernoulli(p) by geometric gaps. The common outcome is skipped: for p ≤ ½
   *  the gap is the run of failures before the next success, for p > ½ the run
   *  of successes before the next failure. The path is a staircase, so the
   *  running maximum is Sₙ itself and Tₐ is the step of the a-th success. */
  #skip(rng, out, keep, p) {
    const grid = this.grid, nmax = grid.at(-1), a = this.threshold;
    if (keep || p <= 0 || p >= 1) {
      // a kept path (or a degenerate coin) is walked step by step, still from gaps
      const w = this.#walker(out, keep);
      const rareIsSuccess = p <= 0.5, q = rareIsSuccess ? p : 1 - p;
      let next = q <= 0 ? Infinity : q >= 1 ? 1 : geometricGap(rng, Math.log1p(-q)) + 1;
      while (w.k < nmax) {
        const rare = w.k + 1 === next;
        if (rare) next += q >= 1 ? 1 : geometricGap(rng, Math.log1p(-q)) + 1;
        w.step(rare === rareIsSuccess ? 1 : 0);
      }
      return;
    }
    const G = grid.length;
    if (p <= 0.5) {
      const logq = Math.log1p(-p);
      let pos = geometricGap(rng, logq) + 1, s = 0;     // pos = step of the next success
      for (let c = 0; c < G; c++) {
        while (pos <= grid[c]) {
          s++;
          if (a !== null && s === a) out.hitTime[out.j] = pos;
          pos += geometricGap(rng, logq) + 1;
        }
        out.S[out.row + c] = s;
        if (out.maxS) out.maxS[out.row + c] = s;
      }
    } else {
      const logq = Math.log(p);                          // runs of successes, P(success) = p
      let pos = geometricGap(rng, logq) + 1, f = 0;     // pos = step of the next failure
      for (let c = 0; c < G; c++) {
        while (pos <= grid[c]) {
          // successes strictly before this failure: pos − 1 − f; the a-th is at a + f
          if (a !== null && out.hitTime[out.j] < 0 && pos - 1 - f >= a) out.hitTime[out.j] = a + f;
          f++;
          pos += geometricGap(rng, logq) + 1;
        }
        const s = grid[c] - f;
        if (a !== null && out.hitTime[out.j] < 0 && s >= a) out.hitTime[out.j] = a + f;
        out.S[out.row + c] = s;
        if (out.maxS) out.maxS[out.row + c] = s;
      }
    }
  }
}

/** The values of one checkpoint column c, as a plain Int32Array of m totals. */
export function column(result, c) {
  const G = result.grid.length, out = new Int32Array(result.m);
  for (let j = 0; j < result.m; j++) out[j] = result.S[j * G + c];
  return out;
}

/** The race between attacker and defender (gambler's ruin), simulated.
 *  Category: simulation. Each race starts at 0; every step is +1 with
 *  probability r (the attacker gains a round) or −1 (the defender wins it); the
 *  race ends at +a (breach) or at −b (the attacker is expelled). The first
 *  `keep` races are recorded step by step for drawing. r generalises the
 *  Rademacher step (r = ½); it belongs to this experiment only.
 *  Exact answers to compare with: exact.js race(r, a, b). [[Gambler's ruin]], note 04 §2.
 *  @returns {{count, breaches, durations: Int32Array, paths: Int32Array[], outcome: Int8Array}} */
export function simulateRaces({ r, a, b, count, seed, keep = 20 }) {
  const rng = new SeededRng(seed);
  const durations = new Int32Array(count), outcome = new Int8Array(count), paths = [];
  let breaches = 0;
  for (let i = 0; i < count; i++) {
    let s = 0, t = 0;
    const path = i < keep ? [0] : null;
    while (s < a && s > -b) {
      s += rng.float() < r ? 1 : -1;
      t++;
      if (path) path.push(s);
    }
    durations[i] = t;
    outcome[i] = s >= a ? 1 : -1;
    if (s >= a) breaches++;
    if (path) paths.push(Int32Array.from(path));
  }
  return { count, breaches, durations, paths, outcome };
}
