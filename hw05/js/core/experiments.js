/* experiments.js — the Monte Carlo experiments of hw05, as pure functions:
   repeated samples for Ex. 2; m hackers × n systems with Welford per hacker
   (the experiment), and the same over a grid of n; the coverage of t and χ²
   intervals; online anomaly detection with frozen, Welford and exponentially
   weighted baselines; merging shard summaries; repeated DP releases.
   Every function takes a seed and draws from its own sub-stream, so changing
   one experiment never changes another, and returns plain objects and typed
   arrays (what a Web Worker can hand back). Pure, no DOM.
   HW5 notes 02–04, 06; draft spec §4.4–4.8. */

import { SeededRng } from '../../../assets/js/core/rng.js';
import { moments, median } from '../../../assets/js/core/stats.js';
import { tInv, chi2Inv } from '../../../assets/js/core/numeric.js';
import { RunningStats, EWStats } from './running.js';
import { PRECISION, storeAs, naiveVariance, twoPassVariance, welfordVariance, exactVariance, conditionNumber, relativeError } from './variance-algos.js';
import { makeDist, ScaledBeta } from './dists.js';
import { release, clip } from './privacy.js';

/* Experiment ids: each one gets its own sub-stream of the master seed. */
export const ID = { overview: 1, sampling: 2, hackers: 3, sweep: 4, coverage: 5, anomaly: 6, merge: 7, dp: 8, groups: 9, shot: 10, running: 11, stability: 12, bench: 13, step: 14 };

/** An independent generator for one experiment: (seed ⊕ id·φ) through the
 *  splitmix32 seeding of SeededRng, so nearby ids give unrelated streams.
 *  Category: sampler (draft §4.9). */
export const stream = (seed, id, sub = 0) => new SeededRng((seed ^ Math.imul(id * 1000 + sub + 1, 0x9e3779b9)) >>> 0);

const tick = (onProgress, every) => {
  let next = every;
  return (i, total) => { if (onProgress && i >= next) { next += every; onProgress(i / total); } };
};

/** Quantiles of a typed array (sorted copy), for box strips. */
export function quantiles(values, qs = [0.05, 0.25, 0.5, 0.75, 0.95]) {
  const v = Float64Array.from(values).sort();
  return qs.map((q) => {
    const h = (v.length - 1) * q, lo = Math.floor(h);
    return v[lo] + (h - lo) * ((v[Math.min(v.length - 1, lo + 1)] ?? v[lo]) - v[lo]);
  });
}

/**
 * One stream of K values through Welford, recorded at about 400 log-spaced
 * steps k (all of them up to 100): k, M_k, s_k, s_k².
 * Category: experiment (Ex. 1, E2: the running statistics settle, LLN).
 */
export function runningStream({ dist: spec, K, seed }) {
  const dist = makeDist(spec), rng = stream(seed, ID.running);
  const s = new RunningStats(), rows = [];
  let next = 1;
  for (let k = 1; k <= K; k++) {
    s.push(dist.sample(rng));
    if (k >= next || k === K) {
      rows.push([k, s.mean, k > 1 ? s.std() : NaN, k > 1 ? s.variance() : NaN]);
      next = k < 100 ? k + 1 : Math.ceil(k * 1.02);
    }
  }
  return { K, rows, final: s.toJSON() };
}

/**
 * Relative error of the three variance algorithms against the exact value,
 * on data c + U(0, 1) (n values), for every offset c of the grid, in binary64
 * and binary32. Category: experiment (Ex. 1, E3(b); trap note E4).
 * The data are stored in each precision first; the exact reference is the
 * variance of THOSE stored values. Also the condition number K of each data set.
 */
export function stabilitySweep({ seed, n = 1000, exps = Array.from({ length: 25 }, (_, i) => i / 2) }) {
  const rng = stream(seed, ID.stability), u = Float64Array.from({ length: n }, () => rng.float());
  const rows = exps.map((e) => {
    const c = 10 ** e, row = { e, c };
    for (const [name, round] of Object.entries(PRECISION)) {
      const xs = storeAs(Array.from(u, (v) => c + v), round), exact = exactVariance(xs);
      row[name] = {
        exact, K: conditionNumber(xs),
        naive: relativeError(naiveVariance(xs, round), exact),
        twoPass: relativeError(twoPassVariance(xs, round), exact),
        welford: relativeError(welfordVariance(xs, round), exact),
        naiveValue: naiveVariance(xs, round),
      };
    }
    return row;
  });
  return { n, rows };
}

/**
 * R independent samples of size n from one distribution; Welford on each.
 * Category: experiment (Ex. 2, E4).
 * Returns per sample x̄_r, s_r² (divisor n − 1) and SS_r/n, plus their moments.
 * Theory: E x̄ = μ, E s² = σ², E[SS/n] = (n−1)/n·σ²; averages over R converge
 * at rate 1/√R (note 02 §2).
 */
export function samplingExperiment({ dist: spec, n, R, seed, onProgress }) {
  const dist = makeDist(spec), rng = stream(seed, ID.sampling, n);
  const means = new Float64Array(R), vars = new Float64Array(R), plugIn = new Float64Array(R);
  const t = tick(onProgress, Math.max(1, Math.floor(R / 50)));
  for (let r = 0; r < R; r++) {
    const s = new RunningStats();
    for (let i = 0; i < n; i++) s.push(dist.sample(rng));
    means[r] = s.mean; vars[r] = s.variance(1); plugIn[r] = s.variance(0);
    t(r, R);
  }
  return { n, R, means, vars, plugIn, mom: { means: moments(means), vars: moments(vars), plugIn: moments(plugIn) } };
}

/**
 * The experiment: m hackers, each attacking n systems; each attempt scores
 * from the chosen distribution; Welford per hacker gives x̄ⱼ and sⱼ².
 * Category: experiment (note 03 §3, E5; with `mixture`, E6).
 * With a mixture, each hacker is a novice or an expert for ALL their n scores.
 * Keeps, for the pictures: the first `keep` × `keep` scores (heat strip) and
 * the full streams of the first `keep` hackers (n ≤ 1000) for their traces.
 */
export function hackerExperiment({ dist: spec, m, n, seed, keep = 50, sub = 0, onProgress }) {
  const dist = makeDist(spec), rng = stream(seed, ID.hackers, sub);
  const mixture = spec.id === 'mixture';
  const means = new Float64Array(m), vars = new Float64Array(m), plugIn = new Float64Array(m), sds = new Float64Array(m);
  const groups = mixture ? new Uint8Array(m) : null;
  const kh = Math.min(keep, m), kn = Math.min(keep, n), sn = Math.min(n, 1000);
  const heat = new Float64Array(kh * kn), streams = new Float64Array(kh * sn);
  const t = tick(onProgress, Math.max(1, Math.floor(m / 50)));
  for (let j = 0; j < m; j++) {
    let d = dist;
    if (mixture) { groups[j] = dist.pickGroup(rng); d = dist.components[groups[j]]; }
    const s = new RunningStats();
    for (let i = 0; i < n; i++) {
      const x = d.sample(rng);
      s.push(x);
      if (j < kh) { if (i < kn) heat[j * kn + i] = x; if (i < sn) streams[j * sn + i] = x; }
    }
    means[j] = s.mean; vars[j] = s.variance(1); plugIn[j] = s.variance(0); sds[j] = Math.sqrt(vars[j]);
    t(j, m);
  }
  return {
    m, n, means, vars, plugIn, sds, groups, heat, heatShape: [kh, kn], streams, streamShape: [kh, sn],
    mom: { means: moments(means), vars: moments(vars), plugIn: moments(plugIn), sds: moments(sds) },
  };
}

/**
 * The experiment repeated over a grid of n, same m, an independent stream per n.
 * Category: experiment (note 04, E7). Per n: the empirical variance of the x̄ⱼ
 * and of the sⱼ² (with their own excess kurtosis, for the SE of a variance,
 * draft §8.3), the averages of SS/n and of s, and five quantiles for box strips.
 */
export function nSweep({ dist: spec, m, grid, seed, onProgress }) {
  const total = grid.reduce((s, n) => s + n, 0);
  let done = 0;
  const rows = grid.map((n, g) => {
    const r = hackerExperiment({ dist: spec, m, n, seed, keep: 0, sub: 100 + g });
    done += n;
    onProgress?.(done / total);
    return {
      n,
      means: r.mom.means, vars: r.mom.vars, plugIn: r.mom.plugIn, sds: r.mom.sds,
      qMeans: quantiles(r.means), qVars: quantiles(r.vars),
    };
  });
  return { m, grid, rows };
}

/**
 * Coverage of the t-interval for μ and the χ² interval for σ², over R samples of size n.
 * Category: inference (note 06 §1, E8; [[Confidence intervals and coverage]]).
 *   t:  x̄ ± t_{n−1, 1−α/2}·s/√n
 *   χ²: [(n−1)s²/χ²_{n−1, 1−α/2}, (n−1)s²/χ²_{n−1, α/2}]
 * Exact for normal data; the t-interval recovers for any shape as n grows
 * (CLT), the χ² interval does not (its limit depends on κ).
 * Keeps the first `keep` intervals of each kind for the "intervals at work" view.
 */
export function coverage({ dist: spec, n, R, level = 0.95, seed, keep = 50, onProgress }) {
  const dist = makeDist(spec), rng = stream(seed, ID.coverage, n);
  const a = 1 - level, tq = tInv(1 - a / 2, n - 1);
  const qLo = chi2Inv(a / 2, n - 1), qHi = chi2Inv(1 - a / 2, n - 1);
  let tHits = 0, chiHits = 0;
  const tKept = [], chiKept = [];
  const t = tick(onProgress, Math.max(1, Math.floor(R / 50)));
  for (let r = 0; r < R; r++) {
    const s = new RunningStats();
    for (let i = 0; i < n; i++) s.push(dist.sample(rng));
    const s2 = s.variance(1), half = (tq * Math.sqrt(s2)) / Math.sqrt(n);
    const tLo = s.mean - half, tHi = s.mean + half, cLo = ((n - 1) * s2) / qHi, cHi = ((n - 1) * s2) / qLo;
    const tHit = tLo <= dist.mean && dist.mean <= tHi, cHit = cLo <= dist.variance && dist.variance <= cHi;
    tHits += tHit; chiHits += cHit;
    if (r < keep) { tKept.push([tLo, tHi, tHit]); chiKept.push([cLo, cHi, cHit]); }
    t(r, R);
  }
  return { n, R, level, tHits, chiHits, tKept, chiKept, mu: dist.mean, sigma2: dist.variance };
}

/* ---------- online anomaly detection ---------- */

const NOVICE = new ScaledBeta(10, 2, 5), EXPERT = new ScaledBeta(10, 5, 2);
export const PHASE1 = 500, FINAL = 300;

/** One attacker's score stream (note 06 §2):
 *  change — 500 novice scores, then 300 expert scores;
 *  ramp   — 500 novice scores, then T steps with α_t rising linearly from 2 to 5
 *           (scores from 10·Beta(α_t, 7 − α_t)), then 300 expert scores. */
export function scenarioStream(scenario, T, rng) {
  const xs = [];
  for (let i = 0; i < PHASE1; i++) xs.push(NOVICE.sample(rng));
  if (scenario === 'ramp') {
    for (let t = 0; t < T; t++) {
      const a = 2 + (3 * (t + 1)) / T;
      xs.push(new ScaledBeta(10, a, 7 - a).sample(rng));
    }
  }
  for (let i = 0; i < FINAL; i++) xs.push(EXPERT.sample(rng));
  return Float64Array.from(xs);
}

/* The baselines a defender may keep for one attacker. Each answers "what is
   normal right now" (mean, sd, ready) and learns from the value afterwards. */
function baselines(alphas, warmup) {
  const welford = (freezeAt) => {
    const s = new RunningStats();
    return {
      push(x, t) { if (t < freezeAt) s.push(x); },
      get ready() { return s.n >= warmup; },
      get mean() { return s.mean; },
      get sd() { return s.std(1); },
    };
  };
  const ew = (alpha) => {
    const s = new EWStats({ alpha, warmup });
    return { push(x) { s.push(x); }, get ready() { return s.ready; }, get mean() { return s.mean; }, get sd() { return s.sd; } };
  };
  return [
    { id: 'frozen', label: 'frozen after phase 1', b: welford(PHASE1) },
    { id: 'welford', label: 'Welford (all history)', b: welford(Infinity) },
    ...alphas.map((a) => ({ id: `ew${a}`, label: `EW α = ${a}`, b: ew(a) })),
  ];
}

/**
 * Run every baseline over one stream: before learning x_t, alarm if its
 * z-score (x_t − m)/sd exceeds z* (one-sided: x_t is unusually HIGH;
 * two-sided: |z| > z*). No alarm during the warm-up.
 * Category: experiment (E9). Keeps the baseline paths when `trace` is set.
 */
export function detect(xs, { zStar = 3, warmup = 30, twoSided = false, alphas = [0.01, 0.05, 0.2], trace = false }) {
  return baselines(alphas, warmup).map(({ id, label, b }) => {
    const alarms = new Uint8Array(xs.length);
    const mean = trace ? new Float64Array(xs.length) : null, thr = trace ? new Float64Array(xs.length) : null;
    for (let t = 0; t < xs.length; t++) {
      if (b.ready) {
        const z = (xs[t] - b.mean) / b.sd;
        alarms[t] = twoSided ? Math.abs(z) > zStar : z > zStar;
        if (trace) { mean[t] = b.mean; thr[t] = b.mean + zStar * b.sd; }
      } else if (trace) { mean[t] = NaN; thr[t] = NaN; }
      b.push(xs[t], t);
    }
    return { id, label, alarms, mean, thr };
  });
}

/** The three numbers of the anomaly table, for one stream and one baseline:
 *  phase-1 false-alarm rate (after the warm-up), alarm rate over the final
 *  300 expert scores, and the delay from the change (or ramp start) to the first alarm. */
function metrics(alarms, warmup) {
  let fa = 0, fin = 0, delay = null;
  for (let t = warmup; t < PHASE1; t++) fa += alarms[t];
  for (let t = alarms.length - FINAL; t < alarms.length; t++) fin += alarms[t];
  for (let t = PHASE1; t < alarms.length; t++) if (alarms[t]) { delay = t - PHASE1; break; }
  return { fa: fa / (PHASE1 - warmup), fin: fin / FINAL, delay };
}

/**
 * The anomaly study: R independent attackers' streams of one scenario, every
 * baseline on each. Run 0 is also returned in full for the plot.
 * Category: experiment (E9; reference values draft §8.2).
 */
export function anomalyStudy({ scenario = 'change', T = 500, R = 300, zStar = 3, warmup = 30, twoSided = false, alphas = [0.01, 0.05, 0.2], seed, onProgress }) {
  const rng = stream(seed, ID.anomaly, scenario === 'ramp' ? T : 0);
  let first = null;
  const acc = new Map();
  for (let r = 0; r < R; r++) {
    const xs = scenarioStream(scenario, T, rng);
    const res = detect(xs, { zStar, warmup, twoSided, alphas, trace: r === 0 });
    if (r === 0) first = { xs, baselines: res };
    for (const { id, label, alarms } of res) {
      const mtr = metrics(alarms, warmup);
      if (!acc.has(id)) acc.set(id, { id, label, fa: 0, fin: 0, delays: [], missed: 0 });
      const a = acc.get(id);
      a.fa += mtr.fa; a.fin += mtr.fin;
      if (mtr.delay === null) a.missed++; else a.delays.push(mtr.delay);
    }
    onProgress?.((r + 1) / R);
  }
  const table = [...acc.values()].map((a) => ({
    id: a.id, label: a.label, fa: a.fa / R, fin: a.fin / R,
    delay: a.delays.length ? median(a.delays) : null, detected: a.delays.length / R,
  }));
  return { scenario, T, R, zStar, warmup, first, table };
}

/* ---------- merging summaries ---------- */

/**
 * Split the m × n scores into k shards (organisations), summarise each with
 * Welford, and merge the summaries three ways: left to right, as a balanced
 * tree, and in a random order. Compare each with the centralised summary.
 * Category: experiment (E10; [[Merging summary statistics (Chan)]] Corollary 2: order does not matter).
 */
export function mergeDemo({ dist: spec, m, n, shards: k, seed }) {
  const dist = makeDist(spec), rng = stream(seed, ID.merge);
  const all = new Float64Array(m * n);
  for (let i = 0; i < all.length; i++) all[i] = dist.sample(rng);
  const central = RunningStats.fromArray(all);
  // shards: contiguous blocks of hackers, as even as possible
  const parts = [];
  for (let s = 0; s < k; s++) {
    const from = Math.floor((s * m) / k) * n, to = Math.floor(((s + 1) * m) / k) * n;
    parts.push(RunningStats.fromArray(all.subarray(from, to)));
  }
  const sequential = parts.reduce((acc, p) => RunningStats.merge(acc, p), new RunningStats());
  const levels = [parts.map((p) => p.toJSON())];
  let layer = parts;
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) next.push(i + 1 < layer.length ? RunningStats.merge(layer[i], layer[i + 1]) : layer[i]);
    levels.push(next.map((p) => p.toJSON()));
    layer = next;
  }
  const order = parts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const random = order.reduce((acc, i) => RunningStats.merge(acc, parts[i]), new RunningStats());
  const rel = (a, b) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));
  const versus = (s) => ({ ...s.toJSON(), relMean: rel(s.mean, central.mean), relSS: rel(s.ss, central.ss) });
  return {
    central: central.toJSON(), shards: parts.map((p) => p.toJSON()), levels, order,
    sequential: versus(sequential), tree: versus(layer[0]), random: versus(random),
  };
}

/* ---------- differential privacy ---------- */

/**
 * One group of n clipped scores, its exact summary, `draws` DP releases of it,
 * and, for comparison, the exact summaries of `draws` OTHER groups (the
 * sampling noise that exists anyway).
 * Category: experiment (E11; note 06 §4, trap T9).
 */
export function dpStudy({ dist: spec, n, eps = 1, split = 0.5, draws = 1000, seed, resample = 0 }) {
  const dist = makeDist(spec), rng = stream(seed, ID.dp);
  const group = (r) => { const s = new RunningStats(); for (let i = 0; i < n; i++) s.push(clip(dist.sample(r))); return s; };
  const g = group(rng);
  const truth = { n, mean: g.mean, s2: g.variance(1) };
  const noise = stream(seed, ID.dp, 1 + resample);
  const shown = release(truth, { eps, split }, noise);
  const relMeans = new Float64Array(draws), relVars = new Float64Array(draws);
  for (let i = 0; i < draws; i++) { const r = release(truth, { eps, split }, noise); relMeans[i] = r.noisyMean; relVars[i] = r.noisyS2; }
  const other = stream(seed, ID.groups);
  const sampMeans = new Float64Array(draws), sampVars = new Float64Array(draws);
  for (let i = 0; i < draws; i++) { const s = group(other); sampMeans[i] = s.mean; sampVars[i] = s.variance(1); }
  return { n, eps, split, truth, shown, relMeans, relVars, sampMeans, sampVars };
}
