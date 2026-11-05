/* privacy-page.js — E10: summaries computed apart merge exactly (Chan), in any
   order; and two exact summaries one record apart reveal that record. E11:
   publishing a group's mean and variance with differential privacy (Laplace
   mechanism, sensitivities from Welford), and when the privacy noise is
   smaller than the sampling noise that exists anyway. The runs are in the Web
   Worker (mergeDemo, dpStudy); this file only draws. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice, sci } from '../../../assets/js/ui/format.js';
import { show } from '../../../assets/js/ui/dock.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { RunningStats } from '../core/running.js';
import { stream, ID } from '../core/experiments.js';
import { varS2 } from '../core/theory.js';
import { sensitivities, laplaceSD, recoverRecord, maxS2 } from '../core/privacy.js';
import { readInputs, scoreOf, dock, rejected } from './inputs.js';
import { SIM, THEORY, MUTED, legend, evidenceHtml, figure, svgButton, sig, getRun, pending, updatingFlag, densityBars } from './widgets.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

const K_CHOICES = [1, 2, 3, 4, 8, 16, 64];
const EPS = [0.1, 0.5, 1, 2, 5];
const SPLITS = [0.2, 0.5, 0.8];
const DPN = [10, 50, 100, 1000, 10000];

/* ---------- page state ---------- */

function readPage(state) {
  const k = K_CHOICES.includes(Number(state.k)) ? Number(state.k) : 4;
  const eps = EPS.includes(Number(state.eps)) ? Number(state.eps) : 1;
  const split = SPLITS.includes(Number(state.split)) ? Number(state.split) : 0.5;
  const dpn = DPN.includes(Number(state.dpn)) ? Number(state.dpn) : 100;
  const draw = Math.max(0, Math.round(Number(state.draw) || 0));
  return { k, eps, split, dpn, draw };
}

const PAGE = {
  id: 'privacy', label: 'this page',
  build(apply) {
    const sel = (label, key, values, fmt = String) => el('select', { 'aria-label': label, onchange: (e) => apply({ [key]: e.target.value }) }, values.map((v) => el('option', { value: v, text: fmt(v) })));
    const k = sel('shards k', 'k', K_CHOICES), eps = sel('privacy budget epsilon', 'eps', EPS), split = sel('share of epsilon for the mean', 'split', SPLITS, (v) => `${Math.round(v * 100)} % mean`), dpn = sel('group size for DP', 'dpn', DPN, nice);
    return {
      nodes: [el('div', { class: 'row' }, [field('E10 shards k', k), el('div', { class: 'vrule' }), field('E11 ε', eps), field('split', split), field('group size', dpn)])],
      refresh(v) { show(k, v.k); show(eps, v.eps); show(split, v.split); show(dpn, v.dpn); },
    };
  },
  summary: (v) => `k = ${v.k} shards · ε = ${v.eps} (${Math.round(v.split * 100)} % mean) · group of ${nice(v.dpn)}`,
  notes: [
    '<strong>k</strong>: into how many parts (organisations, devices) the m × n scores are split before each part summarises its own with Welford.',
    '<strong>ε</strong>: the privacy budget of one release of a group\'s mean and variance; smaller is more private and noisier. <strong>split</strong>: how much of ε goes to the mean (the rest to the variance). <strong>group size</strong>: how many scores the published group has.',
  ],
};

/* ---------- E10: merging ---------- */

function chanExample() {
  const A = RunningStats.fromArray([2, 4, 4, 4]), B = RunningStats.fromArray([5, 5, 7, 9]), AB = RunningStats.merge(A, B);
  return [
    ...section(1, 'The merge formula, on the worked example', `Two parties hold ${m`\{2, 4, 4, 4\}`} and ${m`\{5, 5, 7, 9\}`}; each shares only its summary ${m`(n, M, S)`}.`),
    el('div', { html: M`(n_A, M_A, S_A) = (${A.n}, ${sig(A.mean)}, ${sig(A.ss)}), \qquad (n_B, M_B, S_B) = (${B.n}, ${sig(B.mean)}, ${sig(B.ss)}), \qquad \delta = M_B - M_A = ${sig(B.mean - A.mean)}` }),
    el('div', { html: M`M &= M_A + \delta\,\frac{n_B}{n} = ${sig(A.mean)} + ${sig(B.mean - A.mean)}\cdot\frac{${B.n}}{${A.n + B.n}} = ${sig(AB.mean)} \\ S &= S_A + S_B + \delta^2\,\frac{n_A n_B}{n} = ${sig(A.ss)} + ${sig(B.ss)} + ${sig((B.mean - A.mean) ** 2)}\cdot\frac{${A.n * B.n}}{${A.n + B.n}} = ${sig(AB.ss)}` }),
    el('p', { class: 'small muted', html: `The same as Welford over all eight values (${m`M = 5`}, ${m`S = 32`}, Welford page). The extra term ${m`\delta^2 n_A n_B / n`} is the spread of the two group means around the joint mean; Welford's update is the case ${m`n_B = 1`}.` }),
  ];
}

/** The balanced merge tree, drawn when there are few shards. */
function treeDiagram(levels) {
  const k = levels[0].length;
  if (k > 16 || k < 2) return el('p', { class: 'small muted', text: k < 2 ? 'One shard: nothing to merge.' : `${k} shards: ${levels.length - 1} levels of pairwise merges (diagram shown up to 16 shards).` });
  const W = 720, rowH = 58, H = levels.length * rowH + 10;
  const NS = 'http://www.w3.org/2000/svg';
  const node = (tag, a, text) => { const n = document.createElementNS(NS, tag); for (const [kk, v] of Object.entries(a)) n.setAttribute(kk, v); if (text !== undefined) n.textContent = text; return n; };
  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'tree', 'aria-label': `balanced merge tree of ${k} shard summaries` });
  // x positions: leaves evenly spaced; a parent sits above the middle of its children
  const xs = [levels[0].map((_, i) => ((i + 0.5) / k) * W)];
  for (let l = 1; l < levels.length; l++) {
    xs.push(levels[l].map((_, i) => (xs[l - 1][2 * i + 1] !== undefined ? (xs[l - 1][2 * i] + xs[l - 1][2 * i + 1]) / 2 : xs[l - 1][2 * i])));
  }
  const y = (l) => H - 24 - l * rowH;
  for (let l = 1; l < levels.length; l++) {
    levels[l].forEach((_, i) => {
      for (const c of [2 * i, 2 * i + 1]) if (xs[l - 1][c] !== undefined) svg.append(node('line', { class: 'edge', x1: xs[l][i], y1: y(l) + 10, x2: xs[l - 1][c], y2: y(l - 1) - 10 }));
    });
  }
  levels.forEach((lev, l) => lev.forEach((s, i) => {
    const bw = Math.min(116, W / lev.length - 6);
    svg.append(node('rect', { class: l === levels.length - 1 ? 'box root' : 'box', x: xs[l][i] - bw / 2, y: y(l) - 10, width: bw, height: 20, rx: 4 }));
    svg.append(node('text', { class: 'lbl', x: xs[l][i], y: y(l) + 4, 'text-anchor': 'middle' }, bw > 104 ? `n ${nice(s.n)} · M ${sig(s.mean, 3)}` : nice(s.n)));
  }));
  return el('div', { class: 'scroll-x' }, [svg]);
}

function mergeView(run, page, got) {
  const res = got.result, c = res.central;
  const row = (name, s) => [name, nice(s.n), sig(s.mean, 12), sig(s.ss, 12), s.relMean !== undefined ? sci(s.relMean) : '—', s.relSS !== undefined ? sci(s.relSS) : '—'];
  const worst = Math.max(res.sequential.relMean, res.sequential.relSS, res.tree.relMean, res.tree.relSS, res.random.relMean, res.random.relSS);
  const K = res.shards.length, idx = K <= 10 ? res.shards.map((_, i) => i) : [0, 1, 2, 3, 4, 5, -1, K - 2, K - 1];
  const shardRows = idx.map((i) => (i < 0 ? ['…', '', '', ''] : [`shard ${i + 1}`, nice(res.shards[i].n), sig(res.shards[i].mean, 6), sig(res.shards[i].ss, 7)]));
  return {
    answer: { text: `${nice(c.n)} scores split into ${page.k} shard${page.k > 1 ? 's' : ''} and merged three ways reproduce the centralised summary to ${worst === 0 ? 'the last bit' : `a relative ${sci(worst)}`}: the same mean ${sig(c.mean, 10)} and sum of squares ${sig(c.ss, 10)}, with no raw score exchanged.`, ok: worst <= 1e-12 },
    body: [
      ...chanExample(),
      ...section(2, `${nice(run.m)} hackers' scores in ${page.k} shards`, `Each shard is a block of hackers (an organisation); it runs Welford on its own ${m`n`} scores per hacker and publishes ${m`(n, M, S)`}. Then the summaries are merged left to right, as a balanced tree, and in a random order (${res.order.map((i) => i + 1).join(', ')}).`),
      el('div', { class: 'cols wide-first' }, [
        table(['', 'n', 'mean M', 'sum of squares S', 'rel. diff. M', 'rel. diff. S'], [
          row('centralised', c), row('left to right', res.sequential), row('balanced tree', res.tree), row('random order', res.random),
        ], 'cmp'),
        table(['shard', 'n', 'M', 'S'], shardRows, 'cmp'),
      ]),
      treeDiagram(res.levels),
    ],
    rows: [['central', c], ['sequential', res.sequential], ['tree', res.tree], ['random', res.random]].map(([k, s]) => ({ how: k, ...s })),
    summary: { k: page.k, m: run.m, n: run.n, seed: run.seed, central: c, worstRelative: worst },
  };
}

function differencing(run) {
  const d = scoreOf(run), rng = stream(run.seed, ID.merge, 99), n = run.n;
  const before = new RunningStats();
  for (let i = 0; i < n; i++) before.push(d.sample(rng));
  const v = d.sample(rng), after = RunningStats.merge(before, RunningStats.fromArray([v]));
  const x = recoverRecord(before, after);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Summaries are not private: the differencing attack' }),
    el('p', { html: `A consortium publishes the summary of a group's ${n} scores, and later the summary after one more attempt was added. Nothing else is published.` }),
    table(['published', 'n', 'mean'], [['yesterday', String(before.n), sig(before.mean, 15)], ['today', String(after.n), sig(after.mean, 15)]], 'cmp'),
    el('div', { html: M`x = (n+1)\,M' - n\,M = ${after.n}\cdot ${sig(after.mean, 12)} - ${before.n}\cdot ${sig(before.mean, 12)} = ${sig(x, 12)}` }),
    el('p', { html: `The added record was ${sig(v, 12)}: recovered exactly (to rounding, ${sci(Math.abs(x - v))}). ${evidenceHtml('T')} Aggregation alone gives no formal privacy: two exact summaries one record apart reveal that record, whatever the group size. Privacy needs noise, calibrated to how much one record can move the summary — the next panel.` }),
  ]);
}

/* ---------- E11: differential privacy ---------- */

function dpView(run, page, got, update) {
  const d = scoreOf(run), res = got.result, n = page.dpn, t = res.truth, sh = res.shown;
  const sens = sensitivities(n), e1 = page.split * page.eps, e2 = (1 - page.split) * page.eps;
  const sdV = Math.sqrt(varS2(d, n)), seM = d.sd / Math.sqrt(n);
  // histograms: the 1000 releases of THIS group (bars) and, as a step line, the exact statistics of 1000 OTHER groups
  const hist = (rel, samp, truthV, centre, title, file) => {
    const all = [...rel, ...samp].sort((a, b) => a - b);
    const lo = all[Math.floor(all.length * 0.005)], hi = all[Math.ceil(all.length * 0.995) - 1];
    const { bars } = densityBars(rel, lo, hi, 50), sb = densityBars(samp, lo, hi, 50).bars;
    const step = sb.flatMap(([a, b, h]) => [[a, h], [b, h]]);
    const node = plot({ x: { min: lo, max: hi, title }, y: { min: 0, title: 'density' }, width: 480, height: 230,
      layers: [
        { type: 'bars', bars, color: 'var(--m2)', label: 'DP releases of this group' },
        { type: 'line', points: step, color: SIM, label: 'exact values of other groups (sampling noise)' },
        { type: 'vline', at: truthV, color: 'var(--ink)', dash: false },
        { type: 'vline', at: centre, color: THEORY, dash: '4 3' },
      ], label: `histogram of 1000 differentially private releases of the group's ${title}, with the sampling distribution of other groups` });
    return { node, file };
  };
  const hm = hist(res.relMeans, res.sampMeans, t.mean, d.mean, 'mean', 'hw05-E11-mean'), hv = hist(res.relVars, res.sampVars, t.s2, d.variance, 'variance', 'hw05-E11-var');
  // noise vs n, log-log, theory
  const ns = Array.from({ length: 121 }, (_, i) => 10 * 10 ** (i / 30));
  const cross = (f, g) => { for (let i = 1; i < ns.length; i++) if (f(ns[i]) < g(ns[i])) return ns[i]; return null; };
  const dpM = (k) => laplaceSD(10 / (k * e1)), dpV = (k) => laplaceSD(100 / (k * e2));
  const smM = (k) => d.sd / Math.sqrt(k), smV = (k) => Math.sqrt(varS2(d, k));
  const cM = cross(dpM, smM), cV = cross(dpV, smV);
  const noisePlot = (dp, sm, c, title) => plot({
    x: { log: true, min: 10, max: 1e5, title: 'group size n' }, y: { log: true, title }, width: 480, height: 240,
    layers: [
      { type: 'line', points: ns.map((k) => [k, dp(k)]), color: 'var(--m2)', label: 'DP noise SD', end: 'DP noise' },
      { type: 'line', points: ns.map((k) => [k, sm(k)]), color: SIM, label: 'sampling SD', end: 'sampling' },
      ...(c ? [{ type: 'vline', at: c, color: MUTED, dash: '4 3', text: `n ≈ ${nice(Math.round(c))}` }] : []),
      { type: 'vline', at: n, color: 'var(--ink)', dash: false },
    ], label: `standard deviation of the privacy noise and of the sampling noise against group size, for the ${title}` });
  const pm = noisePlot(dpM, smM, cM, 'mean: noise SD'), pv = noisePlot(dpV, smV, cV, 'variance: noise SD');
  const t9 = [10, 100, 1000, 10000].map((k) => [nice(k), sig(dpM(k), 3), sig(smM(k), 3), sig(dpV(k), 3), sig(smV(k), 3)]);
  return {
    answer: {
      text: `Group of ${nice(n)}, ε = ${page.eps}: the true mean ${sig(t.mean, 4)} is released as ${sig(sh.mean, 4)} (noise SD ${sig(laplaceSD(sh.bMean), 3)}, against a sampling SE of ${sig(seM, 3)}), the true variance ${sig(t.s2, 4)} as ${sig(sh.s2, 4)} (noise SD ${sig(laplaceSD(sh.bVar), 3)}, sampling SD ${sig(sdV, 3)}). ${cM ? `For the mean the privacy noise drops below the sampling noise from about n = ${nice(Math.round(cM))}` : ''}${cV ? `, for the variance from about n = ${nice(Math.round(cV))}` : ''}: privacy is cheap for large groups and expensive for small ones.`,
      ok: laplaceSD(sh.bMean) <= seM,
    },
    body: [
      ...section(1, 'The release', `Scores clipped to [0, 10], so one record can move the mean by at most ${m`\Delta\bar x = 10/n = ${sig(sens.mean, 3)}`} and the variance by at most ${m`\Delta s^2 = 100/n = ${sig(sens.variance, 3)}`}. With ${m`\varepsilon_1 = ${sig(e1, 3)}`} for the mean and ${m`\varepsilon_2 = ${sig(e2, 3)}`} for the variance (${m`\varepsilon_1 + \varepsilon_2 = \varepsilon`}):`),
      el('div', { html: M`\tilde{x} = \bar x + \mathrm{Lap}\!\left(\frac{\Delta\bar x}{\varepsilon_1}\right), \qquad \tilde{s}^2 = s^2 + \mathrm{Lap}\!\left(\frac{\Delta s^2}{\varepsilon_2}\right), \qquad \text{then clamp to } [0, 10] \text{ and } [0,\ 25\,n/(n-1)].` }),
      el('div', { class: 'row' }, [
        table(['', 'true', 'noise scale b', 'noise SD √2·b', 'released (raw)', 'released (clamped)'], [
          ['mean', sig(t.mean, 5), sig(sh.bMean, 3), sig(laplaceSD(sh.bMean), 3), sig(sh.noisyMean, 5), sig(sh.mean, 5)],
          ['variance', sig(t.s2, 5), sig(sh.bVar, 3), sig(laplaceSD(sh.bVar), 3), sig(sh.noisyS2, 5), sig(sh.s2, 5)],
        ], 'cmp'),
        el('button', { type: 'button', text: 'Draw another release', onclick: () => update({ draw: page.draw + 1 }) }),
      ]),
      ...section(2, 'Privacy noise against sampling noise, this group', `Bars: 1 000 private releases of this one group (spread = privacy noise only). Line: the exact statistics of 1 000 <em>other</em> groups of ${nice(n)} (spread = the sampling noise any estimate has anyway).`),
      el('div', { class: 'cols' }, [figure(hm.node), figure(hv.node)]),
      legend([['bar', 'var(--m2)', 'DP releases of this group'], ['line', SIM, 'exact values of 1 000 other groups'], ['line', 'var(--ink)', 'this group\'s true value'], ['dash', THEORY, 'μ or σ²']]),
      el('div', { class: 'row end' }, [svgButton(hm.node, hm.file), svgButton(hv.node, hv.file)]),
      ...section(3, 'How the two noises scale with the group size', `The privacy noise falls like ${m`1/n`} (the sensitivity does), the sampling noise only like ${m`1/\sqrt{n}`}: on log-log axes, slopes −1 and −½, crossing where privacy becomes cheaper than statistics.`),
      el('div', { class: 'cols' }, [figure(pm), figure(pv)]),
      legend([['line', 'var(--m2)', 'DP noise SD, √2·Δ/ε'], ['line', SIM, 'sampling SD'], ['line', 'var(--ink)', `this group (n = ${nice(n)})`], ['dash', MUTED, 'crossing']]),
      el('div', { class: 'row end' }, [svgButton(pm, 'hw05-E11-scaling-mean'), svgButton(pv, 'hw05-E11-scaling-var')]),
      table(['n', 'DP noise SD (mean)', 'sampling SE of x̄', 'DP noise SD (s²)', 'sampling SD of s²'], t9, 'cmp'),
      el('p', { class: 'info small', html: `${evidenceHtml('S')} This is a <strong>simulation</strong> of the mechanism with the seeded, non-cryptographic generator. A real deployment needs cryptographically secure randomness and floating-point-safe noise: naive Laplace sampling in doubles leaks through the least significant bits (Mironov, <em>On significance of the least significant bits for differential privacy</em>, CCS 2012). It also needs privacy accounting across releases: by sequential composition, 30 daily releases at ε = 0.5 of the same data cost ε = 15, essentially no privacy. Sources to be checked.` }),
    ],
    rows: [{ n, eps: page.eps, split: page.split, trueMean: t.mean, trueS2: t.s2, releasedMean: sh.mean, releasedS2: sh.s2, bMean: sh.bMean, bVar: sh.bVar }],
    summary: { n, eps: page.eps, split: page.split, seed: run.seed, draw: page.draw, truth: t, shown: sh, crossingMean: cM, crossingVar: cV },
  };
}

startPage({
  shell: hw05Shell('privacy.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readInputs(state), page = readPage(state);
    dock(run, update, PAGE, page);
    if (run.error) return [rejected(run.error)];
    const redraw = () => api.draw();
    const sMerge = { kind: 'merge', args: { dist: run.spec, m: run.m, n: run.n, shards: page.k, seed: run.seed } };
    const sDp = { kind: 'dp', args: { dist: run.spec, n: page.dpn, eps: page.eps, split: page.split, draws: 1000, seed: run.seed, resample: page.draw } };
    const gM = getRun(sMerge, redraw, 'merge'), gD = getRun(sDp, redraw, 'dp');
    return [
      labPanel({
        hw: 'hw05', id: 'E10', title: 'E10 · Merging summaries computed apart', name: `E10-k${page.k}-m${run.m}-n${run.n}-seed${run.seed}`,
        question: `${page.k} organisations each summarise their own hackers' scores with Welford and share only (n, M, S). Is the merged summary the one a central server would compute from all the raw scores?`,
        steps: [
          `draw the ${nice(run.m)} × ${run.n} scores of the Hackers page (seed ${run.seed}) and compute the centralised summary with one Welford pass;`,
          `split the hackers into ${page.k} contiguous blocks; each block summarises its scores;`,
          `merge the ${page.k} summaries with Chan's formula left to right, as a balanced tree, and in a random order; compare with the centralised summary.`,
        ],
        flag: updatingFlag(gM), waiting: gM.result ? null : pending(gM, sMerge, redraw),
        view: () => mergeView(run, page, gM),
        why: 'no central server needs the raw logs: mean and variance can be computed in parallel, across organisations, devices or peers, and synced later in any order. This is what makes Welford-type statistics fit local-first and federated analytics.',
        notes: [
          `${evidenceHtml('T')} Chan, Golub & LeVeque: for disjoint A and B, ${m`M = M_A + \delta n_B/n`} and ${m`S = S_A + S_B + \delta^2 n_A n_B / n`}, with ${m`\delta = M_B - M_A`}. Proof: the shift decomposition applied to each part with ${m`c = M`}. Any sequence or tree of merges over a partition gives the summary of the whole, because each merge outputs the summary of the union.`,
          'In floating point the merge orders agree to about 10⁻¹⁵ relative, not exactly: rounding happens in a different order. The draft asks for ≤ 10⁻¹²; the measured value is shown in the table.',
          `Physics reading: ${m`S`} is a moment of inertia, and the merge is two bodies joined, with reduced mass ${m`n_A n_B / n`}.`,
        ],
      }),
      differencing(run),
      labPanel({
        hw: 'hw05', id: 'E11', title: 'E11 · Publishing the averages with differential privacy', name: `E11-n${page.dpn}-eps${page.eps}-seed${run.seed}`,
        question: `A threat-intelligence consortium wants to publish a hacker group's average score and score variance without exposing any single attempt. How much noise does ε = ${page.eps} cost, compared with the noise the statistics have anyway?`,
        steps: [
          `one group of ${nice(page.dpn)} scores (seed ${run.seed}), clipped to [0, 10], summarised with Welford;`,
          `release ${m`\bar x`} and ${m`s^2`} with Laplace noise of scale sensitivity / ε, the budget split ${Math.round(page.split * 100)} / ${Math.round((1 - page.split) * 100)} between them, then clamp to the possible range;`,
          'repeat the release 1 000 times (privacy noise), and compute the exact statistics of 1 000 other groups of the same size (sampling noise); compare the spreads, and how both scale with the group size.',
        ],
        flag: updatingFlag(gD), waiting: gD.result ? null : pending(gD, sDp, redraw),
        view: () => dpView(run, page, gD, update),
        why: 'differential privacy is the rigorous alternative to "anonymised aggregates", which are routinely re-identified (the differencing attack above is the simplest case). Its price is accuracy on small groups; and the sensitivity of the variance, the key number, comes straight from Welford\'s recurrence.',
        notes: [
          `${evidenceHtml('T')} Laplace mechanism: ${m`f(D) + \mathrm{Lap}(\Delta f/\varepsilon)`} is ε-differentially private, because the ratio of output densities for neighbouring data sets is at most ${m`e^{\varepsilon |f(D) - f(D')|/\Delta f} \le e^{\varepsilon}`}. Two releases cost ${m`\varepsilon_1 + \varepsilon_2`} (sequential composition); clamping afterwards is free (post-processing).`,
          `${evidenceHtml('T')} Sensitivity of ${m`s^2`} from Welford: with the other ${m`n-1`} records summarised as ${m`(n-1, M', S')`}, ${m`s^2 = \frac{S'}{n-1} + \frac{(v - M')^2}{n}`}, and only the last term depends on the replaced record ${m`v`}; on [0, 10] it lies in ${m`[0, 100/n]`}. The clamp for the variance is ${m`25\,n/(n-1)`}, the largest ${m`s^2`} possible on [0, 10] (half the scores at each end; ${sig(maxS2(page.dpn), 4)} here).`,
          `${evidenceHtml('O')} Choosing ε is a policy decision, not a technical one; the US Census 2020 TopDown algorithm and its controversy are the best-known real case (to be checked). Next steps not covered here: local DP (each device adds its own noise), (ε, δ)-DP with Gaussian noise, and secure aggregation, where summaries are merged under cryptographic masking so the aggregator sees only the total.`,
        ],
      }),
    ];
  },
});
