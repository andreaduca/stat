/* nature-page.js — where the same three facts show up in physics and biology:
   averages of many independent estimates are unbiased (P1), their noise falls
   like 1/√N (P2), and a variance is itself a measurement (P3). Each example
   has a small picture (exact curves, or a seeded simulation), a label saying
   whether the mathematics is the same [rigorous] or only similar [analogy],
   and its source, to be checked before citing. The photon shot-noise demo is
   driven from the dock. Everything is computed in the page. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice } from '../../../assets/js/ui/format.js';
import { show, setValue } from '../../../assets/js/ui/dock.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { normal } from '../../../assets/js/core/samplers.js';
import { stream, ID } from '../core/experiments.js';
import { padlock, exposure, brownian, ionChannels, heavyTail } from '../core/nature.js';
import { readInputs, dock, rejected } from './inputs.js';
import { SIM, THEORY, MUTED, legend, evidenceHtml, figure, svgButton, sig, densityBars } from './widgets.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

const LEVELS = [1, 3, 10, 30, 100, 300, 1000, 3000];
const tag = (kind) => `<span class="tag ${kind.startsWith('analogy') ? 'analogy' : 'rigorous'}">${kind}</span>`;

/* ---------- this page's row in the dock: the exposure of the shot-noise picture ---------- */

let onExposure = () => {};   // a drag of the slider redraws only the picture
let patchRef = () => {};     // and writes the exposure to the URL without a redraw
const PAGE = {
  id: 'nature', label: 'this page',
  build() {
    const out = el('span', { class: 'eq' });
    const r = el('input', { type: 'range', min: 0, max: LEVELS.length - 1, step: 1, 'aria-label': 'exposure: mean photons per bright pixel',
      oninput: (e) => { const v = LEVELS[Number(e.target.value)]; out.textContent = `${nice(v)} photons`; setValue('nature', { level: v }); patchRef({ photons: v }); onExposure(v); } });
    return {
      nodes: [el('div', { class: 'row' }, [field('shot noise: exposure', r), out])],
      refresh(v) { show(r, LEVELS.indexOf(v.level)); out.textContent = `${nice(v.level)} photons`; },
    };
  },
  summary: (v) => `exposure ${nice(v.level)} photons`,
  notes: ['<strong>exposure</strong>: how many photons, on average, a bright pixel of the shot-noise picture collects. Drag it and watch the padlock come out of the noise like √N.'],
};

const small = (o) => plot({ width: 440, height: 210, ...o });
const item = (title, label, html, chart, source) => el('div', { class: 'nature-item' }, [
  el('h3', { class: 'panel-title', html: `${title} ${tag(label)}` }),
  el('div', { class: 'cols wide-first' }, [
    el('div', {}, [el('p', { html }), source ? el('p', { class: 'small muted', html: `${evidenceHtml('S')} ${source}` }) : null]),
    chart ? figure(chart) : null,
  ]),
]);

/* ---------- P2: averaging suppresses noise ---------- */

function p2(run) {
  const ns = Array.from({ length: 49 }, (_, k) => 10 ** (k / 2));
  const thermo = small({
    x: { log: true, min: 1, max: 1e24, title: 'N (molecules)', ticks: [1, 1e6, 1e12, 1e18, 1e24] }, y: { log: true, min: 1e-12, max: 1, title: 'relative fluctuation' },
    layers: [
      { type: 'line', points: ns.map((N) => [N, 1 / Math.sqrt(N)]), color: THEORY, label: '1/√N' },
      { type: 'points', points: [[1e23, 1 / Math.sqrt(1e23)]], color: SIM, r: 4, label: 'a mole of gas' },
      { type: 'vline', at: 1e23, color: MUTED, dash: '3 3' },
    ], label: 'relative fluctuation one over the square root of N against the number of molecules',
  });
  const rhoN = Array.from({ length: 61 }, (_, k) => 10 ** (k / 20));
  const neural = small({
    x: { log: true, min: 1, max: 1000, title: 'N (neurons pooled)' }, y: { log: true, min: 1e-3, max: 1, title: 'Var(average)/σ²' },
    layers: [0, 0.05, 0.2].map((rho, i) => ({ type: 'line', points: rhoN.map((N) => [N, rho + (1 - rho) / N]), color: ['var(--m1)', 'var(--m2)', 'var(--m3)'][i], label: `ρ = ${rho}`, end: `ρ = ${rho}` })),
    label: 'variance of the average of N correlated signals against N, for three correlations',
  });
  return el('div', { class: 'card' }, [
    el('h2', { html: 'P2 · Averaging suppresses noise, like 1/√N' }),
    el('p', { html: `The fluctuation of an average of N independent contributions is ${m`\sigma/\sqrt{N}`} relative to ${m`\sigma`} (the ${m`\operatorname{Var}(\bar x) = \sigma^2/n`} of this homework).` }),
    item('Thermodynamics', 'rigorous', `A gas of ${m`N \approx 10^{23}`} molecules has relative pressure and energy fluctuations of order ${m`1/\sqrt{N} \approx 3\cdot 10^{-12}`}. Macroscopic quantities look deterministic because they are averages over enormous N: the law of large numbers at work in physics.`, thermo),
    item('Photon shot noise and vision', 'rigorous', `Photon counts are Poisson: mean N, variance N, so one pixel's signal-to-noise ratio is ${m`\sqrt{N}`}. Rod pathways in the retina pool many photoreceptors and astronomers stack exposures, buying signal-to-noise at a cost in resolution or time. See the demo below.`, null, 'Rieke & Baylor, <em>Single-photon detection by rod cells of the retina</em>, Rev. Mod. Phys. 1998.'),
    item('Gene-expression noise', 'rigorous model', `A protein present in N copies per cell fluctuates with relative noise ${m`\sim 1/\sqrt{N}`}: low-copy proteins are noisy, and cells pay to make critical ones abundant.`, null, 'Elowitz et al., <em>Stochastic gene expression in a single cell</em>, Science 2002.'),
    item('Neural populations, and the limit of averaging', 'rigorous', `Pooling N neurons reduces the variance like 1/N only if their noise is independent. With a common correlation ${m`\rho`}, ${m`\operatorname{Var}(\text{average}) = \sigma^2\left(\rho + \frac{1-\rho}{N}\right)`} levels off at ${m`\rho\sigma^2`}: the equicorrelated formula of HW4, and the biological twin of its "monoculture" point.`, neural, 'Zohary, Shadlen & Newsome, Nature 1994.'),
  ]);
}

/* ---------- the shot-noise demo ---------- */

const PATTERN = padlock(48, 48);
const rowCache = new Map();   // the exposure table depends on the seed only
const tableRows = (seed) => {
  if (!rowCache.has(seed)) rowCache.set(seed, LEVELS.map((v) => { const q = exposure(stream(seed, ID.shot, v), PATTERN, v); return [nice(v), sig(q.mean, 4), sig(q.sd, 3), sig(q.snr, 3), sig(Math.sqrt(v), 3)]; }));
  return rowCache.get(seed);
};
function shotNoise(run, level) {
  const host = el('div');
  const draw = (L) => {
    const rng = stream(run.seed, ID.shot, L), e = exposure(rng, PATTERN, L);
    const NS = 'http://www.w3.org/2000/svg', cell = 6, { w, h } = PATTERN;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w * cell} ${h * cell}`);
    svg.setAttribute('class', 'shot'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `a padlock photographed with ${L} photons per bright pixel on average`);
    const top = Math.max(1, L * 1.6);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x * cell); r.setAttribute('y', y * cell); r.setAttribute('width', cell); r.setAttribute('height', cell);
      r.setAttribute('style', `fill: color-mix(in srgb, var(--ink) ${Math.round(Math.min(1, e.counts[y * w + x] / top) * 100)}%, var(--panel))`);
      svg.append(r);
    }
    const rows = tableRows(run.seed);
    const tbl = table(['photons N', 'mean count', 'SD', 'SNR = mean/SD', '√N'], rows, 'cmp');
    tbl.querySelectorAll?.('tbody tr')?.[LEVELS.indexOf(L)]?.classList.add('sel');
    host.replaceChildren(el('div', { class: 'cols' }, [
      el('div', {}, [svg, el('p', { class: 'small muted', html: `${nice(L)} photons per bright pixel on average. In the uniform body of the lock: mean ${sig(e.mean, 4)}, SD ${sig(e.sd, 3)}, SNR ${sig(e.snr, 3)} (theory ${m`\sqrt{N} = ${sig(Math.sqrt(L), 3)}`}).` })]),
      el('div', {}, [tbl, el('p', { class: 'small muted', text: 'Each row is one exposure of the same picture (seed from the dock). The SNR grows like √N: a hundred times more light, ten times less noise.' })]),
    ]));
  };
  onExposure = draw;
  draw(level);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Demo: photon shot noise' }),
    el('p', { html: `A padlock photographed with very little light. Every pixel counts photons, Poisson with mean ${m`N\cdot f`} (${m`f`} its brightness). Move the exposure in the dock.` }),
    host,
    explain([
      `${evidenceHtml('T')} A Poisson count has mean = variance = N, so one pixel's relative noise is ${m`1/\sqrt{N}`}. A longer exposure is an average over more photons: the same ${m`1/\sqrt{n}`} as the hackers' sample means, with photons instead of systems.`,
      'The counts are exact Poisson draws (Knuth\'s method, large means split into chunks), not a normal approximation, so the darkest exposures show the true graininess of single photons.',
    ]),
  ]);
}

/* ---------- P1: unbiased estimates, pooled ---------- */

function p1(run) {
  const rng = stream(run.seed, ID.shot, 7), truth = 100, sd = 15, n = 800;
  const guesses = Float64Array.from({ length: n }, () => truth + sd * normal(rng));
  const mean = guesses.reduce((a, b) => a + b, 0) / n;
  const { bars } = densityBars(guesses, 40, 160, 40);
  const crowd = small({
    x: { min: 40, max: 160, title: 'guess (true value 100)' }, y: { min: 0, title: 'density' },
    layers: [{ type: 'bars', bars, color: SIM, label: `${n} independent guesses` },
      { type: 'vline', at: truth, color: THEORY, dash: false, text: 'truth' }, { type: 'vline', at: mean, color: 'var(--ink)', dash: '4 3' }],
    label: 'histogram of 800 simulated guesses with the truth and their average',
  });
  const Ns = Array.from({ length: 61 }, (_, k) => 10 ** (k / 20));
  const herd = small({
    x: { log: true, min: 1, max: 1000, title: 'crowd size N' }, y: { log: true, min: 0.1, max: 20, title: 'error of the crowd average' },
    layers: [
      { type: 'line', points: Ns.map((N) => [N, sd / Math.sqrt(N)]), color: 'var(--m1)', label: 'independent', end: 'independent' },
      { type: 'line', points: Ns.map((N) => [N, sd * Math.sqrt(0.1 + 0.9 / N)]), color: 'var(--m2)', label: 'herding ρ = 0.1', end: 'herding' },
    ], label: 'error of the crowd average against crowd size, independent and correlated guesses',
  });
  return el('div', { class: 'card' }, [
    el('h2', { text: 'P1 · Unbiased estimates, pooled, hit the truth' }),
    el('p', { html: `The average of many independent, unbiased estimates converges to the truth: the averages ${m`\overline{\bar x}`} and ${m`\overline{s^2}`} of this homework.` }),
    item('Wisdom of crowds', 'rigorous if the errors are independent and unbiased', `Galton's ox-weighing contest (1907): individual guesses were far off, the crowd's central estimate was close to the true weight. Left: a simulated illustration, not Galton's data — 800 guesses with SD ${sd} around 100, averaging ${sig(mean, 4)}. Right: crowds fail when the errors are correlated (herding): the error stops shrinking, the same caveat as the neurons above.`, crowd, 'Galton, <em>Vox populi</em>, Nature 1907 (check which statistic, median or mean, and the exact numbers).'),
    el('div', { class: 'cols' }, [figure(herd), el('p', { class: 'small', html: `${evidenceHtml('T')} Error of the average of N guesses with common correlation ${m`\rho`}: ${m`\sigma\sqrt{\rho + (1-\rho)/N}`}. Independent (${m`\rho = 0`}): ${m`\sigma/\sqrt{N}`}, as for the hackers. Herding (${m`\rho = 0.1`}): it levels off at ${m`\sigma\sqrt{\rho} \approx ${sig(sd * Math.sqrt(0.1), 2)}`}, however large the crowd.` })]),
    item('Collective sensing in animal groups', 'analogy, partly rigorous', 'Fish schools track light gradients that single fish cannot detect, by aggregating noisy individual cues.', null, 'Berdahl et al., Science 2013.'),
  ]);
}

/* ---------- P3: variance as a measurement ---------- */

function p3(run) {
  const b = brownian(stream(run.seed, ID.shot, 11));
  const msd = small({
    x: { min: 0, max: 200, title: 't (steps)' }, y: { min: 0, title: 'sample variance of positions' },
    layers: [{ type: 'line', points: [[0, 0], [200, 2 * b.D * 200]], color: THEORY, label: '2Dt' }, { type: 'points', points: b.points.filter((_, i) => i % 4 === 0), color: SIM, r: 2.4, label: '400 walkers' }],
    label: 'sample variance of 400 diffusing particles against time, with the line two D t',
  });
  const ic = ionChannels(stream(run.seed, ID.shot, 13));
  const Imax = ic.N * ic.i;
  const parab = small({
    x: { min: 0, max: Imax, title: 'mean current I (pA)' }, y: { min: 0, title: 'variance σ² (pA²)' },
    layers: [{ type: 'line', points: Array.from({ length: 101 }, (_, k) => { const I = (Imax * k) / 100; return [I, ic.i * I - (I * I) / ic.N]; }), color: THEORY, label: 'σ² = iI − I²/N' },
      { type: 'points', points: ic.points, color: SIM, r: 3.5, label: 'measured' }],
    label: 'variance of the ion current against its mean: a parabola whose shape gives the single-channel current and the number of channels',
  });
  const h = heavyTail(stream(run.seed, ID.shot, 17));
  const heavy = small({
    x: { log: true, min: 10, max: 1e5, title: 'k (values so far)' }, y: { log: true, title: 'running s²' },
    layers: [{ type: 'line', points: h.points.map((p) => [p[0], p[1]]), color: 'var(--m2)', label: `Pareto α = ${h.alpha}`, end: `Pareto ${h.alpha}` },
      { type: 'line', points: h.points.map((p) => [p[0], p[2]]), color: 'var(--m1)', label: 'Exp(1)', end: 'Exp(1)' }],
    label: 'running sample variance of a heavy-tailed stream and of an exponential stream',
  });
  return el('div', { class: 'card' }, [
    el('h2', { text: 'P3 · A variance is itself a measurement' }),
    el('p', { html: `Second moments carry information first moments cannot: a sample variance can measure a hidden quantity — and it is only as reliable as the tails allow (${m`\operatorname{Var}(s^2)`} involves ${m`\mu_4`}).` }),
    item('Brownian motion and Avogadro\'s number', 'rigorous', `A diffusing particle's mean squared displacement grows like ${m`\langle x^2\rangle = 2Dt`}, so a sample variance of displacements estimates the diffusion constant D. Here 400 simulated walkers with D = ${b.D}: the slope gives ${m`\hat D = ${sig(b.Dhat, 3)}`}. Perrin used such measurements to estimate Avogadro's number.`, msd, 'Einstein 1905; Perrin, <em>Les Atomes</em>, 1913.'),
    item('Ion channels: hidden numbers from mean and variance', 'rigorous', `A membrane with N channels, each passing current i with open probability p: mean ${m`I = Nip`}, variance ${m`\sigma^2 = iI - I^2/N`}. Measuring the variance–mean relation reveals i and N, which cannot be seen directly. Simulated with N = ${ic.N}, i = ${ic.i} pA: the fit of ${m`\sigma^2/I = i - I/N`} recovers ${m`\hat i = ${sig(ic.iHat, 3)}`} pA and ${m`\hat N = ${nice(Math.round(ic.Nhat))}`} — inference from first and second moments.`, parab, 'Sigworth, <em>The variance of sodium current fluctuations at the node of Ranvier</em>, J. Physiol. 1980.'),
    item('Heavy tails: when the sample variance misbehaves', 'rigorous', `Earthquake energies, city sizes and price changes have tails so heavy that ${m`\mu_4`}, and sometimes even ${m`\sigma^2`}, is infinite. Then ${m`s^2`} never settles: each rare huge value resets it. Simulated: a Pareto stream with α = ${h.alpha} (infinite variance) against Exp(1), whose ${m`s^2`} settles on 1.`, heavy, 'Mandelbrot, <em>The variation of certain speculative prices</em>, J. Business 1963.'),
    el('p', { class: 'small muted', html: `Also in the notes: the ecological portfolio effect — many partly independent salmon populations make the total catch far steadier than any one (Schindler et al., Nature 2010) ${tag('rigorous model')}.` }),
  ]);
}

startPage({
  shell: hw05Shell('nature.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: ({ state, update, patch }) => {
    patchRef = patch;
    const run = readInputs(state);
    const level = LEVELS.includes(Number(state.photons)) ? Number(state.photons) : 30;
    dock(run, update, PAGE, { level });
    if (run.error) return [rejected(run.error)];
    return [
      el('div', { class: 'card' }, [
        el('h2', { text: 'Three properties, in nature' }),
        el('ol', {}, [
          el('li', { html: '<strong>P1</strong>: averages of many independent, unbiased estimates are unbiased: they hit the truth.' }),
          el('li', { html: '<strong>P2</strong>: the fluctuations of an average shrink like 1/√N.' }),
          el('li', { html: '<strong>P3</strong>: a variance is itself an observable, and how reliable it is depends on the tails.' }),
        ]),
        el('p', { class: 'small muted', html: `Each example is labelled ${tag('rigorous')} when the same mathematics governs the phenomenon, ${tag('analogy')} when it only resembles it. Every source is marked ${evidenceHtml('S')}: to be checked before citing. The pictures are exact curves or seeded simulations, not data.` }),
      ]),
      p2(run), shotNoise(run, level), p1(run), p3(run),
    ];
  },
});
