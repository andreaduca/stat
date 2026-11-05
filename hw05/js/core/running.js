/* running.js — running statistics: the mean and the sum of squares of a stream
   kept in three numbers (n, mean, ss) and updated one value at a time
   (Knuth + Welford), the merge of two such summaries (Chan), a traced version
   that records every step for the pictures of Ex. 1, and the exponentially
   weighted variant that forgets the past (anomaly detection).
   Pure, no DOM: runs in the page, in the worker and under Node.
   HW5 note 01; [[Online mean and variance (Knuth and Welford)]],
   [[Merging summary statistics (Chan)]], [[Exponentially weighted mean and variance]]. */

/**
 * The summary (n, M, S) of a stream: count, running mean, sum of squared
 * deviations from the running mean. The variance is S/(n − 1).
 */
export class RunningStats {
  n = 0;
  mean = 0;
  ss = 0;

  /** Add one value.
   *  Category: algorithm (Knuth's recurrence for the mean, Welford's for the sum of squares).
   *  With the innovation d = x − M_{k−1} (the deviation from the OLD mean):
   *    M_k = M_{k−1} + d/k                         (Knuth, note 01 §1, Lemma 1)
   *    S_k = S_{k−1} + d·(x − M_k)                 (Welford, Theorem)
   *  The increment of S is old deviation × new deviation: the area of a
   *  rectangle slightly smaller than the square d², exactly (k−1)/k·d².
   *  Why it is right: the shift decomposition Σ(xᵢ − c)² = S + k(x̄ − c)²
   *  applied once to the k − 1 old points with c = M_k.
   *  Why it is stable: d is a small number (a value minus a nearby mean), so
   *  nothing large is squared and nothing large is subtracted (note 01 §4).
   *  Starting from (0, 0, 0) the first value gives M = x, S = d·0 = 0, with no
   *  special case. These three statements are the whole algorithm (the core of
   *  Ex. 1): no check, no branch. Validation lives in pushChecked() below. */
  push(x) {
    const d = x - this.mean;          // innovation: deviation from the OLD mean
    this.mean += d / ++this.n;        // Knuth: move 1/n of the way towards x
    this.ss += d * (x - this.mean);   // Welford: old deviation × new deviation
  }

  /** Sample variance S/(n − ddof): ddof = 1 gives the unbiased s² (Bessel),
   *  ddof = 0 the plug-in SS/n. NaN when n − ddof ≤ 0 (one value has no spread
   *  to estimate). [[Sum of squares and sample variance]] Lemma 2. */
  variance(ddof = 1) { return this.n - ddof > 0 ? this.ss / (this.n - ddof) : NaN; }

  /** Sample standard deviation √(S/(n − ddof)); biased low (Jensen), even with ddof = 1. */
  std(ddof = 1) { return Math.sqrt(this.variance(ddof)); }

  /** Merge two summaries into the summary of the union of their data.
   *  Category: algorithm (Chan, Golub & LeVeque 1979).
   *  With n = n_A + n_B and δ = M_B − M_A:
   *    M = M_A + δ·n_B/n,     S = S_A + S_B + δ²·n_A·n_B/n.
   *  The extra term is the spread of the two group means around the joint mean
   *  (the shift decomposition applied to each part with c = M). Physics reading:
   *  the moment of inertia of two bodies, with reduced mass n_A n_B/n.
   *  Welford's push is the special case n_B = 1, S_B = 0.
   *  Returns a NEW object; merging with an empty summary returns a copy of the other.
   *  [[Merging summary statistics (Chan)]] Theorem. */
  static merge(a, b) {
    const out = new RunningStats();
    if (a.n === 0) return Object.assign(out, { n: b.n, mean: b.mean, ss: b.ss });
    if (b.n === 0) return Object.assign(out, { n: a.n, mean: a.mean, ss: a.ss });
    const n = a.n + b.n, delta = b.mean - a.mean;
    out.n = n;
    out.mean = a.mean + (delta * b.n) / n;
    out.ss = a.ss + b.ss + (delta * delta * a.n * b.n) / n;
    return out;
  }

  /** The summary of an array (or typed array), by pushing every value in order. */
  static fromArray(xs) {
    const s = new RunningStats();
    for (let i = 0; i < xs.length; i++) s.push(xs[i]);
    return s;
  }

  /** The three numbers that ARE the summary: all a party needs to share for a merge. */
  toJSON() { return { n: this.n, mean: this.mean, ss: this.ss }; }
}

/** Push a value after checking it is a finite number, so a typo in a box on
 *  the page cannot poison the summary with NaN. The check sits here, outside
 *  the 3-line core, on purpose. Returns false (and changes nothing) if rejected. */
export function pushChecked(stats, x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return false;
  stats.push(x);
  return true;
}

/**
 * RunningStats that records each step, for the step-by-step pictures of Ex. 1
 * (number line, rectangle, stacked S bar, trace table).
 * Each row: k, x, d = x − M_{k−1}, prevMean = M_{k−1}, mean = M_k,
 * newDev = x − M_k (= (k−1)/k·d), ss = S_k, inc = S_k − S_{k−1} = d·newDev.
 */
export class TracedRunningStats extends RunningStats {
  trace = [];

  push(x) {
    const prevMean = this.mean, prevSS = this.ss;
    super.push(x);
    this.trace.push({
      k: this.n, x, d: x - prevMean, prevMean, mean: this.mean,
      newDev: x - this.mean, ss: this.ss, inc: this.ss - prevSS,
    });
  }
}

/** One step of the recurrence written directly for the sample variance:
 *    s_k² = (k − 2)/(k − 1)·s_{k−1}² + d_k²/k     (k ≥ 2; s₁² is undefined, kept as 0)
 *  Category: algorithm (Corollary 1 of the Welford note: divide the theorem by k − 1).
 *  For the derivation panel only — the program keeps S, not s², because S
 *  needs no division by k − 1 at every step and has no special case at k = 1.
 *  @param {{k: number, mean: number, s2: number}} st  the state after k − 1 values
 *  @returns {{k: number, mean: number, s2: number}} the state after k values */
export function pushVarianceForm(st, x) {
  const k = st.k + 1, d = x - st.mean;
  const s2 = k >= 2 ? ((k - 2) / (k - 1)) * st.s2 + (d * d) / k : 0;
  return { k, mean: st.mean + d / k, s2 };
}

/**
 * Exponentially weighted mean and variance: a baseline that forgets.
 * Category: algorithm ([[Exponentially weighted mean and variance]]).
 *   d = x − m,   m ← m + α·d,   v ← (1 − α)(v + α·d²)
 * Welford gives every past value the same weight forever (the step is 1/k);
 * a constant step α weights the value j steps ago by α(1 − α)ʲ, so the memory
 * is about 1/α values (Lemma 1). On i.i.d. data, once started:
 *   Var(m) = α/(2 − α)·σ²,  E v = 2(1 − α)/(2 − α)·σ²   (Lemma 3).
 * Start-up (draft §4.7): the first `warmup` values go through Welford; at
 * k = warmup the baseline starts from m = M_w, v = S_w/(w − 1), then switches
 * to the constant step. Without it the first values would swing the baseline.
 */
export class EWStats {
  /** @param {{alpha: number, warmup?: number}} opts  0 < α < 1; warmup ≥ 2 */
  constructor({ alpha, warmup = 30 }) {
    this.alpha = alpha;
    this.warmup = Math.max(2, warmup);
    this.start = new RunningStats();
    this.k = 0;
    this.m = 0;
    this.v = 0;
  }

  push(x) {
    this.k++;
    if (this.k <= this.warmup) {
      this.start.push(x);
      if (this.k === this.warmup) { this.m = this.start.mean; this.v = this.start.variance(1); }
      return;
    }
    const a = this.alpha, d = x - this.m;
    this.m += a * d;
    this.v = (1 - a) * (this.v + a * d * d);
  }

  /** True once the warm-up is over and the baseline is exponentially weighted. */
  get ready() { return this.k >= this.warmup; }
  get mean() { return this.k >= this.warmup ? this.m : this.start.mean; }
  get variance() { return this.k >= this.warmup ? this.v : this.start.variance(1); }
  get sd() { return Math.sqrt(this.variance); }
}
