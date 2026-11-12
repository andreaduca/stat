/* nature-page.js — layer cakes and bell curves outside mathematics (note 05): examples
   labelled rigorous / historical / analogy, every source marked to be checked; a lake
   whose volume is measured by columns (Riemann) and by contour slabs (Lebesgue); and a
   Galton board, de Moivre–Laplace made of pegs. Everything is computed here, quickly. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot, curve } from '../../../assets/js/ui/plot.js';
import { heatmap } from '../../../assets/js/ui/heatmap.js';
import { nice, sig } from '../../../assets/js/ui/format.js';
import { m } from '../../../assets/js/ui/math.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { binomialPmf } from '../../../assets/js/core/stats.js';
import { lakeGrid, volumeColumns, volumeSlabs, galton } from '../core/nature.js';
import { pdf } from '../core/normal.js';
import { stream, ID } from '../core/experiments.js';
import { readInputs, dock, rejected } from './inputs.js';
import { RIEMANN, LEBESGUE, REF, legend, evidenceHtml, abstract, anchor } from './widgets.js';
import { hw06Shell, STICKY, MEMORY } from './shell.js';

/* ---------- this page's row in the dock ---------- */

function readPage(state) {
  const K = Math.round(numberOr(state.slabs, 10)), rows = Math.round(numberOr(state.rows, 12)), balls = Math.round(numberOr(state.balls, 5000));
  let error = null;
  if (!(K >= 1 && K <= 500)) error = `the number of slabs must be between 1 and 500 (got ${K}).`;
  else if (!(rows >= 1 && rows <= 64)) error = `the rows of pegs must be between 1 and 64 (got ${rows}).`;
  else if (!(balls >= 10 && balls <= 200000)) error = `the balls must be between 10 and 200 000 (got ${balls}).`;
  return { K, rows, balls, error };
}

const OWN = {
  id: 'nature', label: 'this page',
  build(apply, later) {
    const K = el('input', { type: 'number', class: 'num', min: 1, max: 500, 'aria-label': 'contour slabs of the lake' });
    const rows = el('input', { type: 'number', class: 'num', min: 1, max: 64, 'aria-label': 'rows of pegs' });
    const balls = el('input', { type: 'number', class: 'num', min: 10, max: 200000, 'aria-label': 'balls dropped' });
    for (const [node, key] of [[K, 'slabs'], [rows, 'rows'], [balls, 'balls']]) onCommit(node, () => apply({ [key]: node.value }), later);
    return {
      nodes: [el('div', { class: 'row' }, [field('lake: slabs', K), el('span', { class: 'vrule' }), field('Galton: rows', rows), field('balls', balls)])],
      refresh(v) { show(K, v.K); show(rows, v.rows); show(balls, v.balls); },
    };
  },
  summary: (v) => `${v.K} slabs · ${v.rows} rows × ${nice(v.balls)} balls`,
  notes: [
    '<strong>slabs</strong>: how many contour levels cut the lake (the layer cake’s K).',
    '<strong>rows, balls</strong>: the Galton board. Each ball goes left or right at every row with probability ½; the seed decides which.',
  ],
};

/* ---------- the examples ---------- */

const tag = (k) => `<span class="nat-tag ${k}">${k}</span>`;
const item = (kind, title, text, source) => el('li', { html: `${tag(kind)} <strong>${title}.</strong> ${text}${source ? ` <span class="muted small">${evidenceHtml('S')} ${source} — to be checked.</span>` : ''}` });

function integrationExamples() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Cutting the domain, cutting the range' }),
    el('ul', { class: 'nat-list' }, [
      item('historical', 'Archimedes and exhaustion', 'The area of a parabolic segment, filled with triangles whose total converges (3rd c. BC): the ancestor of Riemann’s idea, simple pieces of the domain.', 'Quadrature of the Parabola'),
      item('rigorous', 'Cavalieri’s principle (1635)', 'Two solids whose slices at every height have equal area have equal volume. Slicing by height is the layer cake; its modern form is Fubini–Tonelli.', 'Cavalieri, Geometria indivisibilibus'),
      item('rigorous', 'Lakes and mountains', `Limnologists get a lake’s volume from the areas of its depth contours, ${m`V = \int A(z)\,dz`}; geographers draw the hypsometric curve, the area of land above each height. Both are ${m`\int \lambda\{f > t\}\,dt`}, the Lebesgue integral, used before Lebesgue (demo below).`, 'Wetzel, Limnology; geomorphology textbooks on hypsometry'),
      item('historical', 'Riemann 1854, Lebesgue 1902', 'Riemann’s integral appears in his habilitation on trigonometric series; Lebesgue’s thesis “Intégrale, longueur, aire” was driven by limits of functions that Riemann could not integrate, which Fourier series kept producing.', 'Riemann 1854; Lebesgue 1902'),
      item('analogy', 'Measure zero and measurement', 'No experiment can tell a rational from an irrational value: physical laws are stated up to sets of measure zero, as in the spaces L² of quantum mechanics. The Dirichlet function is invisible to nature, as it is to floating point (Pathological page).', null),
      item('rigorous', 'Errors on telephone lines', 'Berger and Mandelbrot (1963) modelled the clustering of transmission errors with a Cantor-like process: bursts within bursts, no characteristic scale.', 'IBM J. Res. Dev. 7 (1963)'),
    ]),
    el('p', { class: 'small muted', html: `${tag('rigorous')} the same mathematics governs it · ${tag('historical')} where the idea came from · ${tag('analogy')} a resemblance, not an identity.` }),
  ]);
}

function normalExamples() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The bell curve and its integral' }),
    el('ul', { class: 'nat-list' }, [
      item('historical', 'De Moivre (1733)', 'The normal curve first appears as an approximation of binomial probabilities for many coin tosses (Galton board below).', 'de Moivre, The Doctrine of Chances, 2nd ed. 1738'),
      item('historical', 'Gauss and the asteroid Ceres (1809)', 'The normal law of errors, derived while fitting astronomical observations; Laplace tied it to the central limit theorem. “Error function” comes from this theory of errors.', 'Gauss, Theoria motus 1809'),
      item('rigorous', 'Heat and the age of the Earth', `A half-space whose surface is suddenly held at a fixed temperature has the profile ${m`T(x, t) = T_s + (T_0 - T_s)\operatorname{erf}\big(x/(2\sqrt{\kappa t})\big)`}. Kelvin (1862) fitted it to the geothermal gradient and got an Earth 20–400 million years old: the mathematics right, the model wrong (no radioactivity, no convection; Perry 1895).`, 'Kelvin 1862; Perry 1895'),
      item('rigorous', 'Diffusion into silicon', 'The same erfc profile describes dye spreading in water, a drug entering tissue, and dopant atoms diffused into silicon in chip manufacturing; diffusion lengths grow like √t.', 'Sze, Semiconductor Devices'),
      item('rigorous', '5σ and genome-wide significance', `The Higgs boson (2012) was announced at 5σ, a one-sided ${m`p \approx 2.87 \cdot 10^{-7}`}; genome-wide studies use ${m`p < 5 \cdot 10^{-8}`}, a Bonferroni correction for about a million tests. Both are far-tail values of ${m`\Phi`} (Normal CDF and Inference pages).`, 'ATLAS and CMS 2012; GWAS conventions'),
      item('historical', 'Impossibility as discovery', 'Liouville’s work on integration in finite terms (1830s) belongs with Abel–Ruffini and Galois: proving that something cannot be done by understanding its structure (Liouville page).', 'Liouville 1835'),
    ]),
  ]);
}

/* ---------- the lake ---------- */

const LAKE = lakeGrid(160);

function lake(page) {
  const cols = volumeColumns(LAKE), slabs = volumeSlabs(LAKE, page.K);
  const exact = volumeSlabs(LAKE, 500).volume;
  const max = Math.max(...LAKE.d);
  const map = heatmap({ values: LAKE.d, n: LAKE.n, size: 300, tip: (u, v, val) => `depth ${val.toFixed(1)} m` });
  // the hypsometric curve: area deeper than z
  const area = (z) => { let c = 0; for (const v of LAKE.d) if (v > z) c++; return c * LAKE.cell; };
  const hyp = curve(area, 0, max, 200);
  const hypPlot = plot({
    x: { min: 0, max, title: 'depth z (m)' }, y: { min: 0, title: 'area deeper than z (km²)' }, width: 420, height: 280,
    layers: [
      ...slabs.slabs.flatMap((s) => {
        const a = s.t - slabs.dt / 2, b = s.t + slabs.dt / 2;
        return [{ type: 'band', band: [[a, 0, s.area], [b, 0, s.area]], color: LEBESGUE },
          { type: 'line', points: [[a, 0], [a, s.area], [b, s.area], [b, 0]], color: LEBESGUE, thin: true, hover: false }];
      }),
      { type: 'line', points: hyp, color: REF, label: 'A(z)' },
    ],
    label: 'the hypsometric curve of the lake: the area deeper than each depth, with the contour slabs under it',
  });
  return labPanel({
    hw: 'hw06', id: 'lake', title: 'A lake measured two ways', name: `lake-K${page.K}`,
    question: 'How much water is in the lake? Sum depth × area over a grid (Riemann), or area × thickness over the depth contours (Lebesgue)?',
    steps: [
      `a synthetic lake of 1 km × 1 km, depth known on a ${LAKE.n} × ${LAKE.n} grid (no real bathymetry);`,
      `columns: ${m`V \approx \sum \text{depth} \times \text{cell area}`};`,
      `slabs: cut the depth into ${page.K} layers; each layer contributes the area inside its contour times its thickness, ${m`V = \int_0^{\max} A(z)\,dz`}.`,
    ],
    view: () => ({
      answer: { text: `Columns give <strong>${sig(cols, 6)}</strong> million m³; ${page.K} slab${page.K === 1 ? '' : 's'} give${page.K === 1 ? 's' : ''} <strong>${sig(slabs.volume, 6)}</strong>, ${sig(Math.abs(slabs.volume - cols) / cols * 100, 2)} % apart. With 500 slabs the gap is ${(Math.abs(exact - cols) / cols).toExponential(0)}: the same water, added in another order.` },
      body: [
        ...section(1, 'The lake, and its contour areas', 'Left: the depth (brighter is deeper; hover for values). Right: the area deeper than each depth; the orange slabs are the layer cake, their total area is the volume.'),
        el('div', { class: 'cols' }, [map, hypPlot]),
        ...section(2, 'Volume', 'Millions of cubic metres.'),
        table(['method', 'volume'], [['columns (Riemann, 160 × 160 cells)', sig(cols, 8)], [`slabs (Lebesgue, K = ${page.K})`, sig(slabs.volume, 8)], ['slabs, K = 500', sig(exact, 8)]]),
      ],
      summary: { columns: cols, slabs: slabs.volume, K: page.K },
    }),
    why: 'a contour map is a table of the measures λ{depth > z}: nature, and the people who measure it, hand you the Lebesgue integral for free.',
    notes: ['Real lakes are surveyed exactly this way: a few depth contours from a sonar survey, their areas planimetered, and V = Σ A(z) Δz. The same curve for land above sea level is the hypsometric curve of a region or of the whole Earth.'],
  });
}

/* ---------- the Galton board ---------- */

function galtonPanel(page, inputs) {
  const counts = galton(page.rows, page.balls, stream(inputs.seed, ID.galton));
  const n = page.rows, mean = n / 2, sd = Math.sqrt(n / 4);
  const rng = stream(inputs.seed, ID.galton, 1), paths = [];
  for (let b = 0; b < 30; b++) {
    let pos = 0;
    const path = [[0, 0]];
    for (let r = 1; r <= n; r++) { pos += rng.u32() & 1 ? 0.5 : -0.5; path.push([r, pos]); }
    paths.push(path);
  }
  const board = plot({
    x: { min: 0, max: n, title: 'row' }, y: { min: -n / 2 - 0.5, max: n / 2 + 0.5, title: 'position' }, width: 420, height: 280,
    layers: [{ type: 'paths', paths, color: RIEMANN, label: 'ball' }],
    label: 'thirty balls falling through the pegs, each stepping half a unit left or right per row',
  });
  const bars = counts.map((c, k) => [k - 0.45, k + 0.45, c / page.balls]);
  const hist = plot({
    x: { min: -0.6, max: n + 0.6, title: 'bin (number of right turns)' }, y: { min: 0, title: 'fraction of balls' }, width: 420, height: 280,
    layers: [
      { type: 'bars', bars, color: RIEMANN, label: 'balls' },
      { type: 'line', points: curve((x) => pdf((x - mean) / sd) / sd, -0.5, n + 0.5, 200), color: REF, label: 'normal N(n/2, n/4)' },
      { type: 'points', points: counts.map((_, k) => [k, binomialPmf(n, k, 0.5)]), color: LEBESGUE, r: 3, label: 'binomial' },
    ],
    label: 'the fraction of balls in each bin against the binomial probabilities and the normal density',
  });
  const dev = Math.max(...counts.map((c, k) => Math.abs(c / page.balls - binomialPmf(n, k, 0.5))));
  const gap = Math.max(...counts.map((_, k) => Math.abs(binomialPmf(n, k, 0.5) - pdf((k - mean) / sd) / sd)));
  return labPanel({
    hw: 'hw06', id: 'galton', title: 'The Galton board', name: `galton-${n}x${page.balls}-seed${inputs.seed}`,
    question: 'Balls fall through rows of pegs, bouncing left or right. Why do they pile up in a bell?',
    steps: [`${nice(page.balls)} balls, ${n} rows, each bounce right with probability ½ (seed ${inputs.seed});`, 'count the balls in each bin: the number of right turns;', 'compare with the binomial law and with the normal curve.'],
    view: () => ({
      answer: { text: `The bins follow the binomial law (largest gap ${sig(dev, 2)}, sampling noise), and the binomial is already close to the normal curve at ${n} rows (largest gap ${sig(gap, 2)}): de Moivre’s theorem, made of pegs.` },
      body: [
        ...section(1, 'Paths and piles', 'Left: thirty of the balls. Right: where all of them land.'),
        el('div', { class: 'cols' }, [board, hist]),
        legend([['bar', RIEMANN, 'balls per bin'], ['dot', LEBESGUE, 'binomial(n, ½)'], ['line', REF, 'normal N(n/2, n/4)']]),
      ],
      summary: { rows: n, balls: page.balls, seed: inputs.seed, counts },
    }),
    why: `every sum of many small independent pushes ends up normal (the central limit theorem): measurement errors, heights, the position of a diffusing molecule. That is why ${m`\Phi`} is everywhere, and why it has to be computed well.`,
    notes: ['Galton’s quincunx (1889, Natural Inheritance) [S, to be checked]. A ball’s path is a random walk with ±½ steps, the walk of HW4; the bin is the number of right turns, Binomial(n, ½).'],
  });
}

startPage({
  shell: hw06Shell('nature.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const inputs = readInputs(api.state), page = readPage(api.state);
    const error = inputs.error ?? page.error;
    dock({ ...inputs, error }, api.update, OWN, page);
    if (error) return [rejected(error)];
    return [
      abstract({
        question: 'Where do the layer cake and the bell curve appear outside mathematics, and how far can each example be trusted?',
        findings: [
          '<strong>Lebesgue before Lebesgue</strong>: a lake’s volume from its depth contours, and the hypsometric curve of a landscape, are exactly ∫ λ{f > t} dt. The demo measures one lake both ways and gets the same water.',
          '<strong>The bell everywhere</strong>: from de Moivre’s coin tosses and Gauss’s astronomy to heat in the Earth, dopants in silicon and the 5σ of the Higgs boson. The Galton board shows why: many small independent pushes add up to a normal.',
          '<strong>Labelled honestly</strong>: each example is marked rigorous (same mathematics), historical or analogy, and every source is still to be checked.',
        ],
        sections: [['integration', 'Cutting the domain, cutting the range'], ['lake', 'A lake measured two ways'], ['normal', 'The bell curve and its integral'], ['galton', 'The Galton board']],
      }),
      anchor('integration', integrationExamples()), anchor('lake', lake(page)), anchor('normal', normalExamples()), anchor('galton', galtonPanel(page, inputs)),
    ];
  },
});
