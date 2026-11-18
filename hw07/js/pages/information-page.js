/* information-page.js — dependence measured in bits. Mutual information as the
   uncertainty one variable removes about the other (a bar on Berkeley's gender ×
   department); E7a every dataset of the homework in bits, with G next to χ²; E7b the
   upward bias of the plug-in estimate (worker, 2000 independent tables per N); E7c the
   one-time pad as a table: a fixed key reveals everything, a fresh key nothing.
   [[Mutual information and the G-test]], [[Perfect secrecy as independence]]. */

import { el, pageLink } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, table as dataTable } from '../../../assets/js/ui/lab.js';
import { plot, histogram } from '../../../assets/js/ui/plot.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { nice } from '../../../assets/js/ui/format.js';
import { ContingencyTable } from '../core/table.js';
import { chiSquare, gTest, marginEntropies } from '../core/tests.js';
import { generatorTables, stream } from '../core/experiments.js';
import { square, tableOf } from '../core/datasets.js';
import { shiftTable, H_PLAIN } from '../core/secrecy.js';
import { DEPARTMENTS } from '../../data/berkeley.js';
import { readInputs, dock, rejected } from './inputs.js';
import { legend, evidenceHtml, abstract, anchor, residualGrid, getRun, pending, updatingFlag, MUTED } from './widgets.js';
import { hw07Shell, PAGES, STICKY, MEMORY } from './shell.js';

const HW = 'hw07', OTP_N = 200000, ID_OTP = 30;
const thin = (n) => nice(n);
const link = (href, text) => pageLink(PAGES, href, text);
const T = evidenceHtml('T');
const bits = (v) => (v >= 0.1 ? v.toFixed(2) : v >= 0.001 ? v.toFixed(4) : v.toExponential(1));
const symbols = (items) => el('div', { class: 'symbols' }, [
  el('span', { class: 'label', text: 'Symbols' }),
  el('ul', {}, items.map(([tex, text]) => el('li', {}, [el('span', { class: 'sym', html: m`${tex}` }), el('span', { html: text })]))),
]);

const sum = (k) => DEPARTMENTS.reduce((s, d) => s + d.counts[k], 0);
const POOLED = ContingencyTable.fromCounts(['men', 'women'], ['admitted', 'rejected'], [[sum(0), sum(1)], [sum(2), sum(3)]]);
const GENDER_DEPT = ContingencyTable.fromCounts(['men', 'women'], DEPARTMENTS.map((d) => d.dept),
  [DEPARTMENTS.map((d) => d.counts[0] + d.counts[1]), DEPARTMENTS.map((d) => d.counts[2] + d.counts[3])]);

/* ---------- dependence in bits ---------- */

function bitsCard() {
  const { HX } = marginEntropies(GENDER_DEPT), I = gTest(GENDER_DEPT).mutualInfoBits;
  const share = I / HX;
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Dependence in bits' }),
    el('p', { html: 'χ² says <em>whether</em> two variables are associated; mutual information says <em>how much</em> one tells about the other, in bits — the unit of secrets and keys.' }),
    el('div', { class: 'eq', html: M`I(X; Y) = H(X) - H(X \mid Y)` }),
    symbols([['H(X)', 'the uncertainty about X, in bits (1 bit = one fair coin)'], ['H(X \\mid Y)', 'what remains of it once Y is known'], ['I(X; Y)', 'what Y removes: 0 exactly when X and Y are independent']]),
    el('h3', { class: 'panel-title', text: 'Example: how much does the department tell about the gender of a Berkeley applicant?' }),
    el('div', { class: 'ibar', role: 'img', 'aria-label': `H(gender) = ${HX.toFixed(3)} bits, of which ${I.toFixed(3)} explained by the department` }, [
      el('span', { class: 'ibar-i', style: `width:${(100 * share).toFixed(1)}%`, text: `I = ${I.toFixed(3)}` }),
      el('span', { class: 'ibar-rest', style: `width:${(100 - 100 * share).toFixed(1)}%`, text: `H(gender | department) = ${(HX - I).toFixed(3)}` }),
    ]),
    el('p', { class: 'small', html: `The whole bar is H(gender) = ${HX.toFixed(3)} bits. Knowing the department removes ${I.toFixed(3)} of them (${(100 * share).toFixed(0)} %): a strong association (V = 0.49) is still only a fifth of a bit.` }),
    el('p', { class: 'small muted', html: `${T} G = ${m`2N\,\hat I \ln 2`}: the G statistic of the procedure is mutual information times a constant, and it is close to χ² (E7a).` }),
  ]);
}

/* ---------- E7a · every dataset in bits ---------- */

function e7a(inputs) {
  const gens = Object.fromEntries(generatorTables({ seed: inputs.seed, N: 10000, eps: 0.05 }).map((g) => [g.kind, g.table]));
  const sets = [
    ['Berkeley: gender × admission', POOLED],
    ['Berkeley: gender × department', GENDER_DEPT],
    ['xoshiro: output × next', gens.good],
    ['LCG last 4 bits: output × next', gens.lcgLow],
    ['sticky (ε = 0.05): output × next', gens.sticky],
    ['Y = X²', tableOf(square(inputs.seed))],
    ['Caesar (fixed key): plain × cipher', shiftTable(stream(inputs.seed, ID_OTP, 0), OTP_N, 'fixed')],
    ['one-time pad: plain × cipher', shiftTable(stream(inputs.seed, ID_OTP, 1), OTP_N, 'fresh')],
  ].map(([name, t]) => { const x = chiSquare(t), g = gTest(t); return { name, chi2: x.chi2, G: g.G, I: g.mutualInfoBits, bias: g.biasBits }; });
  const fmt = (v) => (v >= 1e4 ? thin(Math.round(v)) : v.toPrecision(4));
  const chart = plot({
    x: { min: 10, max: 1e7, log: true, title: 'χ²' }, y: { min: 10, max: 1e7, log: true, title: 'G' }, width: 400, height: 260,
    layers: [
      { type: 'line', points: [[10, 10], [1e7, 1e7]], dash: true, color: MUTED },
      { type: 'points', points: sets.map((d) => [d.chi2, d.G]), color: 'var(--s1)', r: 5 },
    ],
    label: 'G against chi-square for the eight datasets, on log axes; the points lie along the diagonal',
  });
  return labPanel({
    hw: HW, id: 'E7a', title: 'E7a · Every dataset of the homework, in bits', name: `E7a-seed${inputs.seed}`,
    question: 'We run the eight tables of this homework through both statistics, χ² and G, and convert G into bits of mutual information. Do the two statistics agree, and how many bits does each dependence carry?',
    steps: [
      'table: for each dataset, χ², G, the mutual information Î, and the Î that pure noise would give at this sample size;',
      'plot: G against χ², both on log axes; on the dashed diagonal the two are equal (they should be, close to independence).',
    ],
    view: () => ({
      answer: { text: 'Near independence the points sit on the diagonal: G ≈ χ². For very strong dependence they part (the LCG, Caesar), but both statistics are then far beyond any threshold: <strong>the verdict is the same</strong>. In bits, the dependences range from noise (xoshiro, one-time pad: Î at the noise level) to everything (Caesar: Î = H(M), the ciphertext tells all about the letter).' },
      body: [el('div', { class: 'cols wide-first' }, [
        dataTable(['dataset', 'χ²', 'G', 'Î (bits)', 'noise level'], sets.map((d) => [d.name, fmt(d.chi2), fmt(d.G), bits(d.I), bits(d.bias)]), 'words'),
        el('div', {}, [chart, legend([['dot', 'var(--s1)', 'one dataset'], ['dash', MUTED, 'G = χ²']])]),
      ])],
      rows: sets,
      summary: { seed: inputs.seed },
    }),
    why: 'bits are comparable across tables of any size and any N: “0.002 bits” means nothing leaks, “3.9 bits” means a letter is fully revealed.',
  });
}

/* ---------- E7b · bits from nothing ---------- */

function e7b(inputs, redraw) {
  const spec = { kind: 'miBias', args: { seed: inputs.seed } };
  const got = getRun(spec, redraw, 'bias');
  const view = () => {
    const r = got.result;
    const hists = r.results.map((o) => {
      const mean = Array.from(o.values).reduce((s, v) => s + v, 0) / o.values.length;
      return { N: o.N, mean, base: o.baseline, node: histogram({ values: o.values, lo: 0, hi: 4 * o.baseline, bins: 30, refs: [{ at: o.baseline, text: 'expected noise', dash: true }], xTitle: 'Î (bits)', label: `the measured mutual information of independent tables with N = ${o.N}`, width: 300, height: 200, barLabel: 'measured Î' }) };
    });
    return {
      answer: { text: `Every one of these tables is independent, yet Î is never 0: on average ${hists.map((h) => `${bits(h.mean)} bits at N = ${thin(h.N)}`).join(', ')} — just what the formula predicts. <strong>A “leak” of a few hundredths of a bit measured on 100 samples is noise.</strong>` },
      body: [
        el('div', { class: 'cols three' }, hists.map((h) => el('div', {}, [el('h3', { class: 'panel-title', text: `N = ${thin(h.N)}` }), h.node, el('p', { class: 'small muted', text: `mean ${bits(h.mean)} · formula ${bits(h.base)}` })]))),
        el('div', { class: 'eq', html: M`\mathbb{E}[\hat I] \approx \frac{(r-1)(c-1)}{2N \ln 2}\ \text{bits under independence}` }),
      ],
      summary: { seed: inputs.seed, means: hists.map((h) => ({ N: h.N, mean: h.mean, formula: h.base })) },
    };
  };
  return labPanel({
    hw: HW, id: 'E7b', title: 'E7b · Bits from nothing', name: `E7b-seed${inputs.seed}`,
    question: 'We fill 2 000 tables of 4 × 4 cells with pairs that are independent by construction, for three sample sizes, and measure Î on each. Independent means 0 bits — what does the estimate say?',
    steps: [
      'one histogram per sample size N: how often each value of the measured Î occurs;',
      'the dashed line is the noise level the formula predicts, (r − 1)(c − 1)/(2N ln 2).',
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw), view: got.result ? view : null,
    why: `estimated information is always positive, so on small samples it overstates. Compare it with the noise level, or test it with G (${link('procedure.html', 'procedure')}).`,
  });
}

/* ---------- E7c · the one-time pad ---------- */

function e7c(inputs) {
  const fixed = shiftTable(stream(inputs.seed, ID_OTP, 0), OTP_N, 'fixed'), fresh = shiftTable(stream(inputs.seed, ID_OTP, 1), OTP_N, 'fresh');
  const If = gTest(fixed).mutualInfoBits, Ir = gTest(fresh).mutualInfoBits, xr = chiSquare(fresh);
  const bars = barChart({
    categories: ['Caesar (fixed key)', 'one-time pad (fresh key)'],
    series: [{ label: 'Î(M; C), bits', color: 'var(--s2)', values: [If, Ir] }],
    refLines: [{ y: H_PLAIN, label: `H(M) = ${H_PLAIN.toFixed(2)} bits: everything` }],
    yTitle: 'bits revealed per letter', width: 360, height: 220,
  });
  return labPanel({
    hw: HW, id: 'E7c', title: 'E7c · The one-time pad as a table', name: `E7c-seed${inputs.seed}`,
    question: `We encrypt ${thin(OTP_N)} letters of a skewed synthetic text by shifting each one, C = (M + K) mod 26 — once with the same key for every letter (Caesar, HW3), once with a fresh random key per letter (the one-time pad) — and tabulate plaintext × ciphertext. How many bits does the ciphertext reveal?`,
    steps: [
      'grids: 26 × 26, row = plaintext letter, column = ciphertext letter; orange = more pairs than independence predicts, blue = fewer;',
      'bars: the measured mutual information, against H(M), the total uncertainty of a letter (dashed line).',
    ],
    view: () => ({
      answer: { text: `Caesar: one bright diagonal, Î = <strong>${If.toFixed(2)} bits = H(M)</strong>: the ciphertext reveals each letter completely. One-time pad: noise, Î = ${bits(Ir)} bits (χ² = ${xr.chi2.toFixed(0)} on 625 df, p = ${xr.p.toFixed(2)}): nothing revealed — Shannon’s perfect secrecy, seen as independence.` },
      body: [el('div', { class: 'cols three' }, [
        el('div', {}, [el('h3', { class: 'panel-title', text: 'Caesar (fixed key)' }), residualGrid({ table: fixed, rowName: 'plaintext', colName: 'ciphertext', label: 'plaintext by ciphertext residuals for a fixed key: one diagonal' })]),
        el('div', {}, [el('h3', { class: 'panel-title', text: 'One-time pad (fresh key)' }), residualGrid({ table: fresh, rowName: 'plaintext', colName: 'ciphertext', label: 'plaintext by ciphertext residuals for a fresh key: noise' })]),
        el('div', {}, [el('h3', { class: 'panel-title', text: 'Bits revealed' }), bars, el('p', { class: 'small muted', text: `one-time pad: ${bits(Ir)} bits, too small to see` })]),
      ]), legend([['bar', 'var(--m2)', 'more pairs than expected'], ['bar', 'var(--m1)', 'fewer pairs than expected']])],
      summary: { seed: inputs.seed, fixedBits: If, freshBits: Ir, H: H_PLAIN, freshChi2: xr.chi2 },
    }),
    why: 'perfect secrecy is a statement of independence, P(M | C) = P(M), so it can be checked like any table; a key used twice breaks it, and the table shows it.',
  });
}

startPage({
  shell: hw07Shell('information.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const inputs = readInputs(api.state);
    dock(inputs, api.update);
    if (inputs.error) return [rejected(inputs.error)];
    const redraw = () => api.draw();
    return [
      abstract({
        question: 'How much does one variable tell about the other — in bits, the unit of keys and secrets?',
        findings: [
          '<strong>Mutual information</strong> is the uncertainty one variable removes about the other; G = 2N·Î·ln 2 gives the same verdict as χ² (and nearly the same value, near independence).',
          '<strong>Measured bits are biased upward</strong>: independent 4 × 4 tables of 100 pairs show about 0.07 bits.',
          '<strong>The one-time pad reveals nothing</strong> (0.002 bits, noise); a fixed key reveals everything (Î = H(M) = 3.93 bits).',
        ],
        sections: [['bits', 'Dependence in bits'], ['E7a', 'E7a · every dataset'], ['E7b', 'E7b · bits from nothing'], ['E7c', 'E7c · the one-time pad']],
      }),
      anchor('bits', bitsCard()), anchor('E7a', e7a(inputs)), anchor('E7b', e7b(inputs, redraw)), anchor('E7c', e7c(inputs)),
    ];
  },
});
