/* ecdlp.js — recovering the toy private key d from the public key Q = dG
   when d is known to lie in [1, N]. Category: cryptanalysis (generic
   discrete-logarithm search). Notes "Attacking the toy ECC scheme" §1–§4, §7–§8,
   [[Discrete logarithm problem]], [[Key space and brute force]], [[Birthday paradox]].

   THREAT MODEL. The attacker knows the curve, G, the public key Q and — by
   Kerckhoffs's principle — that d ∈ [1, N]. Nothing else: no ciphertext.
   THE RECOGNISER IS EXACT. A candidate d′ is right iff d′G = Q: no statistics,
   no false positives (contrast Caesar, whose recogniser can be fooled).
   So the whole difficulty is the SIZE of the search:
     brute force   N/2 additions on average, O(1) memory
     BSGS          ≈ 2√N additions, √N points of memory (time–memory trade-off)
     kangaroo      ≈ 2√N additions, almost no memory (random walks + birthday)
   With N ≈ 2²⁵⁶ all three are hopeless; that is the point of a full key.

   Speed: the searches stay in Jacobian coordinates (assets/js/core/secp256k1.js,
   `jacobian`) and invert only when a coordinate is needed — in batches, with
   Montgomery's trick, where possible. Operation counts are reported next to
   times, because counts are machine-independent and times are not. */

import { G, N as ORDER, mulG, mul, add, neg, jacobian as J } from '../../../assets/js/core/secp256k1.js';
import { SeededRng } from '../../../assets/js/core/rng.js';

const now = () => performance.now();
const isqrtCeil = (n) => { let r = BigInt(Math.floor(Math.sqrt(Number(n)))); while (r * r < n) r++; while ((r - 1n) * (r - 1n) >= n) r--; return r; };
/* A point's x as a table key: its low 48 bits as a Number (fast to hash).
   Two different points share them with probability 2⁻⁴⁸; a match is always
   re-checked on the full point, so a false hit costs a check, never a wrong d. */
const keyOf = (pt) => Number(pt.x & 0xffffffffffffn);

/* ---------- 1. brute force ---------- */

/** Walk P₁ = G, P₂ = P₁ + G, … and stop when P_k = Q: ONE point addition per
 *  candidate instead of a fresh double-and-add each time. Expected number of
 *  candidates for d uniform in [1, N]: (N + 1)/2. */
export function bruteForce(Q, range, progress = () => {}) {
  const g = J.fromAffine(G), t0 = now();
  let R = g;
  for (let k = 1n; k <= range; k++) {
    if (J.equalsAffine(R, Q)) return { d: k, ops: Number(k - 1n), memory: 1, seconds: (now() - t0) / 1000 };
    R = J.add(R, g);
    if ((k & 0xffffn) === 0n) progress({ fraction: Number(k) / Number(range), steps: Number(k), seconds: (now() - t0) / 1000 });
  }
  return { d: null, ops: Number(range), memory: 1, seconds: (now() - t0) / 1000 };
}

/* ---------- 2. baby-step giant-step (Shanks, 1971) ---------- */

/** Every d ∈ [0, N] is d = i·m + j with m = ⌈√N⌉, 0 ≤ j < m, 0 ≤ i ≤ m. Then
 *      Q = (i·m + j)G   ⇔   Q − i·(mG) = jG.
 *  Baby steps: store jG for every j (m points). Giant steps: Q, Q − mG,
 *  Q − 2mG, … and look each one up. At most m + m additions instead of N.
 *  Both phases run in batches of 1024 Jacobian points converted with one
 *  inversion. A match on x alone could be −jG: then d = i·m − j. */
export function bsgs(Q, range, progress = () => {}) {
  const t0 = now(), m = isqrtCeil(range), mN = Number(m), BATCH = Math.min(1024, mN);   // a batch never overshoots m
  const g = J.fromAffine(G);
  const table = new Map();                     // key(x of jG) -> j, for j = 1 … m − 1 (0G = 𝒪 is checked apart)
  let R = g, ops = 0;
  for (let j0 = 1; j0 < mN; j0 += BATCH) {
    const batch = [];
    for (let j = j0; j < Math.min(mN, j0 + BATCH); j++) { batch.push(R); R = J.add(R, g); ops++; }
    J.batchToAffine(batch).forEach((pt, t) => { if (!table.has(keyOf(pt))) table.set(keyOf(pt), j0 + t); });
    progress({ phase: 'baby', fraction: 0.5 * Math.min(1, (j0 + BATCH) / mN), steps: ops, seconds: (now() - t0) / 1000 });
  }
  const step = J.fromAffine(neg(mul(m, G)));   // −mG: one scalar multiplication
  let S = J.fromAffine(Q), giants = 0;
  const imax = Number(range / m) + 1;
  for (let i0 = 0; i0 <= imax; i0 += BATCH) {
    const batch = [];
    for (let i = i0; i < Math.min(imax + 1, i0 + BATCH); i++) { batch.push(S); S = J.add(S, step); ops++; }
    const pts = J.batchToAffine(batch);
    for (let t = 0; t < pts.length; t++) {
      const i = BigInt(i0 + t), pt = pts[t];
      giants = i0 + t + 1;
      const cands = pt.isInfinity ? [i * m] : table.has(keyOf(pt)) ? [i * m + BigInt(table.get(keyOf(pt))), i * m - BigInt(table.get(keyOf(pt)))] : [];
      for (const d of cands) {
        if (d >= 1n && d <= range && mulG(d).eq(Q)) {
          // additions the method needed: m − 1 baby steps + the giant steps up to this one (a batch may have computed a few more)
          return { d, ops: mN - 1 + giants, memory: table.size, m: mN, i: Number(i), j: Number(d - i * m), giants, seconds: (now() - t0) / 1000 };
        }
      }
    }
    progress({ phase: 'giant', fraction: 0.5 + 0.5 * Math.min(1, (i0 + BATCH) / imax), steps: ops, seconds: (now() - t0) / 1000 });
  }
  return { d: null, ops, memory: table.size, m: mN, seconds: (now() - t0) / 1000 };
}

/* ---------- 3. Pollard's kangaroo (lambda), with distinguished points ---------- */

/** Two kangaroos hop along the group with jumps that depend only on the point
 *  they stand on (jump size 2^(x mod K)·G):
 *    tame  starts at a KNOWN position t₀ = N/2, so its position is always known;
 *    wild  starts at Q = dG, its position d + distance is unknown.
 *  Because the jumps are a function of the point, once the wild kangaroo lands
 *  on any point the tame one visited, it follows the tame trail for ever.
 *  Points whose x ends in s zero bits are "distinguished" and stored with the
 *  position (tame) or the distance travelled (wild). The first point stored by
 *  both gives  t₀ + dist_tame = d + dist_wild  →  d.
 *  Mean jump ≈ √N/2 makes the expected work ≈ 2√N hops (a birthday-style
 *  argument over the trails, not over random draws), memory = the stored points
 *  only. Both kangaroos hop in lockstep so one inversion serves the two. */
export function kangaroo(Q, range, progress = () => {}, rng = null) {
  const t0 = now(), sqrtN = Math.sqrt(Number(range));
  let K = 1;
  while ((2 ** K - 1) / K < sqrtN / 2) K++;                 // mean of 2^0 … 2^(K−1) ≈ √N/2
  const jumps = Array.from({ length: K }, (_, i) => ({ size: 2n ** BigInt(i), pt: J.fromAffine(mulG(2n ** BigInt(i))) }));
  const s = Math.max(0, Math.floor(Math.log2(sqrtN)) - 4);   // distinguished: about 1 point in √N/16
  const dpMask = (1n << BigInt(s)) - 1n;
  const Kn = BigInt(K);
  const traps = new Map();                                   // key(x) -> {kind, value}
  const trail = { tame: [], wild: [] };                      // distinguished points, for the picture
  let ops = 0, restarts = 0;

  const tame = { pos: range / 2n, P: J.fromAffine(mulG(range / 2n)) };
  let offset = 0n;
  let wild = { dist: 0n, P: J.fromAffine(Q) };
  const cap = 12 * sqrtN + 64;                               // a stuck run is restarted from a shifted wild start
  let since = 0;
  for (;;) {
    const [ta, wa] = J.batchToAffine([tame.P, wild.P]);
    for (const [kind, a] of [['tame', ta], ['wild', wa]]) {
      if ((a.x & dpMask) !== 0n) continue;
      const value = kind === 'tame' ? tame.pos : wild.dist;
      const other = traps.get(keyOf(a));
      if (other && other.kind !== kind) {
        const tPos = kind === 'tame' ? value : other.value, wDist = kind === 'wild' ? value : other.value;
        const d = (((tPos - wDist) % ORDER) + ORDER) % ORDER;
        if (d >= 1n && d <= range && mulG(d).eq(Q)) {
          if (trail[kind].length < 4000) trail[kind].push(value);
          return {
            d, ops, memory: traps.size, K, meanJump: (2 ** K - 1) / K, dpBits: s, restarts,
            trail: { tame: trail.tame.map(Number), wild: trail.wild.map((w) => Number(d + w)) },
            meet: Number(tPos), seconds: (now() - t0) / 1000,
          };
        }
      }
      if (!other) traps.set(keyOf(a), { kind, value });
      if (trail[kind].length < 4000) trail[kind].push(value);
    }
    const jt = jumps[Number(ta.x % Kn)], jw = jumps[Number(wa.x % Kn)];
    tame.P = J.add(tame.P, jt.pt); tame.pos += jt.size;
    wild.P = J.add(wild.P, jw.pt); wild.dist += jw.size;
    ops += 2; since += 2;
    if ((ops & 0x3fff) === 0) progress({ fraction: Math.min(0.99, ops / (4 * sqrtN)), steps: ops, seconds: (now() - t0) / 1000 });
    if (since > cap) {
      // the wild trail missed the tame one: start the wild kangaroo again from Q + r·G (r known)
      restarts++; since = 0;
      offset = BigInt(Math.floor((rng ? rng.float() : Math.random()) * Number(range / 4n)) + 1);
      wild = { dist: offset, P: J.fromAffine(add(Q, mulG(offset))) };
    }
  }
}

export const METHODS = [
  { id: 'brute', label: 'brute force', run: bruteForce, color: 'var(--m1)' },
  { id: 'bsgs', label: 'baby-step giant-step', run: bsgs, color: 'var(--m2)' },
  { id: 'kangaroo', label: 'Pollard kangaroo', run: kangaroo, color: 'var(--m3)' },
];

/* ---------- 4. the experiment (note §8) ---------- */

/** Runs per key size: brute force is the slow one, and stratified keys keep its mean steady. */
export const REPS = { brute: 3, bsgs: 5, kangaroo: 5 };

export const SIZES = {
  brute: [10, 12, 14, 16, 18, 20, 22],
  bsgs: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
  kangaroo: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
};

/** Least-squares slope of log₂y on log₂N: ≈ 1 means linear in N, ≈ ½ means √N. */
export function fitSlope(points) {
  const xs = points.map((p) => Math.log2(p[0])), ys = points.map((p) => Math.log2(p[1]));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** One method over all its key sizes: `reps` keys d per size, attacked; record
 *  additions and seconds. Keys are STRATIFIED: run r draws d uniformly from the
 *  r-th of `reps` equal slices of [1, N], so the keys still come at random but
 *  cover the range evenly — brute force's cost is d itself, and plain random
 *  keys would make its mean jump around. Seeded by (seed, size): reproducible
 *  (the page's real keys come from the CSPRNG). Reports means, the fitted slopes
 *  (from N = 2¹⁴ on, where fixed overheads no longer dominate) and the
 *  measured additions per second. One method per worker: the page runs the
 *  three in parallel. */
export function experiment({ method, reps = REPS[method], seed = 1, sizes = SIZES[method] }, progress = () => {}) {
  const m = METHODS.find((x) => x.id === method);
  const total = sizes.reduce((a, b) => a + 2 ** (method === 'brute' ? b : b / 2), 0) * reps;
  let doneWork = 0;
  // warm-up, untimed: the first runs of a fresh worker are slower until the JIT has compiled the hot loops
  for (const w of [12345n, 54321n]) m.run(mulG(w), 2n ** 16n, () => {}, new SeededRng(seed));
  const rows = sizes.map((bits) => {
    const range = 2n ** BigInt(bits), runs = [];
    const keys = new SeededRng((seed * 64 + bits) >>> 0), walk = new SeededRng((seed * 64 + bits + 32) >>> 0);
    for (let r = 0; r < reps; r++) {
      const slice = 2 ** bits / reps;                       // bits ≤ 32: fits a Number exactly enough
      const d = BigInt(1 + Math.min(2 ** bits - 1, Math.floor(slice * r + keys.float() * slice)));
      const res = m.run(mulG(d), range, () => {}, walk);
      if (res.d !== d) throw new Error(`${m.label} returned ${res.d} for d = ${d}`);
      runs.push({ ops: res.ops, seconds: res.seconds, memory: res.memory });
      doneWork += 2 ** (method === 'brute' ? bits : bits / 2);
      progress({ fraction: doneWork / total, label: `N = 2^${bits}` });
    }
    const mean = (f) => runs.reduce((a, x) => a + f(x), 0) / runs.length;
    return { bits, N: 2 ** bits, ops: mean((x) => x.ops), seconds: mean((x) => x.seconds), memory: Math.max(...runs.map((x) => x.memory)), runs };
  });
  const fitRows = rows.filter((r) => r.bits >= 14);
  const timed = fitRows.filter((r) => r.seconds > 0.02);
  const rate = timed.length ? timed.reduce((s, r) => s + r.ops, 0) / timed.reduce((s, r) => s + r.seconds, 0) : null;
  return {
    id: method, reps, seed, rows, rate,
    opsSlope: fitSlope(fitRows.map((r) => [r.N, Math.max(1, r.ops)])),
    timeSlope: timed.length > 2 ? fitSlope(timed.map((r) => [r.N, r.seconds])) : null,
  };
}

/* ---------- 5. extrapolation (note §7) ---------- */

/** Additions each method needs on average for a key space of 2^bits:
 *  brute force N/2, BSGS ≈ 1.5√N (all baby steps + half the giant steps),
 *  kangaroo ≈ 2√N. Pollard rho on the FULL group of order n ≈ 2²⁵⁶ needs
 *  √(πn/2) ≈ 2^128.3 by the birthday paradox. */
export const expectedOps = {
  brute: (bits) => 2 ** (bits - 1),
  bsgs: (bits) => 1.5 * 2 ** (bits / 2),
  kangaroo: (bits) => 2 * 2 ** (bits / 2),
};
export const rhoFullOps = Math.sqrt((Math.PI * Number(ORDER)) / 2);
