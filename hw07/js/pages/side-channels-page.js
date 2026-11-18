/* side-channels-page.js — leakage is dependence: a simulated power side channel on one
   4-bit S-box output, without and with first-order masking. The setting as a flow; E6a
   what the leak looks like (masking keeps every class centred on 4 but changes its width,
   the exact lemma); E6b which test sees it (χ² of independence vs Welch's t of means, on
   one growing stream and over 200 repeats in the worker). Simulated traces only.
   [[Chi-square leakage detection in side channels]], note 06. */

import { el, field, pageLink } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, table as dataTable } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { nice, sup } from '../../../assets/js/ui/format.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { traces, lemmaTable } from '../core/sidechannel.js';
import { sideDetectionPath, stream, ID } from '../core/experiments.js';
import { readInputs, readAlpha, dock, rejected } from './inputs.js';
import { legend, categoryColors, evidenceHtml, abstract, anchor, getRun, pending, updatingFlag, MUTED } from './widgets.js';
import { hw07Shell, PAGES, STICKY, MEMORY } from './shell.js';

const HW = 'hw07', KEY = 0xb;
const thin = (n) => nice(n);
const link = (href, text) => pageLink(PAGES, href, text);
const T = evidenceHtml('T'), S = evidenceHtml('S');
const symbols = (items) => el('div', { class: 'symbols' }, [
  el('span', { class: 'label', text: 'Symbols' }),
  el('ul', {}, items.map(([tex, text]) => el('li', {}, [el('span', { class: 'sym', html: m`${tex}` }), el('span', { html: text })]))),
]);

/* ---------- the dock ---------- */

function readPage(state) {
  const masked = state.impl !== 'plain', sigma = numberOr(state.sigma, 1), n = Math.round(numberOr(state.n, 10000));
  const { alpha, error: aErr } = readAlpha(state, 0.01);
  let error = aErr;
  if (!error && !(sigma >= 0.25 && sigma <= 4)) error = `the noise σ must be between 0.25 and 4 (got ${sigma}).`;
  if (!error && !(n >= 200 && n <= 50000)) error = `the number of traces must be between 200 and 50 000 (got ${n}).`;
  return { masked, sigma, n, alpha, error };
}

const OWN = {
  id: 'side', label: 'this page',
  build(apply, later) {
    const impl = el('select', { 'aria-label': 'implementation', onchange: (e) => apply({ impl: e.target.value }) },
      [['masked', 'masked'], ['plain', 'unprotected']].map(([v, t]) => el('option', { value: v, text: t })));
    const num = (label, key, step) => { const i = el('input', { type: 'number', class: 'num', step, 'aria-label': label }); onCommit(i, () => apply({ [key]: i.value }), later); return i; };
    const sigma = num('noise sigma', 'sigma', 0.25), n = num('number of traces', 'n', 1000), alpha = num('significance level alpha', 'alpha', 0.001);
    return {
      nodes: [el('div', { class: 'row' }, [field('implementation', impl), field('noise σ', sigma), field('traces', n), field('α', alpha)])],
      refresh(v) { if (document.activeElement !== impl) impl.value = v.masked ? 'masked' : 'plain'; show(sigma, v.sigma); show(n, v.n); show(alpha, v.alpha); },
    };
  },
  summary: (v) => `${v.masked ? 'masked' : 'unprotected'} · σ = ${v.sigma} · ${thin(v.n)} traces · α = ${v.alpha}`,
  notes: [
    '<strong>implementation</strong>: unprotected (the device handles v directly) or masked (only the two shares v ⊕ m and m).',
    '<strong>noise σ</strong>: the measurement noise added to every trace (0.25 – 4).',
    '<strong>traces</strong>: how many encryptions are measured (200 – 50 000).',
    '<strong>α</strong>: the false-alarm rate (0.01, as in real leakage evaluations, which run many tests).',
  ],
};

/* ---------- the setting ---------- */

function setting() {
  const box = (n, title, big, small) => el('div', { class: 'fbox' }, [
    el('span', { class: 'fn', text: n }), el('div', { class: 'ft', text: title }), el('div', { class: 'fbig', html: big }), el('div', { class: 'fsmall', html: small }),
  ]);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The setting: a chip that leaks through its power' }),
    el('p', { html: `A chip encrypts. Its power consumption depends a little on the bits it handles, and an attacker can measure it. The device is safe exactly when what is measured is <strong>independent</strong> of the secret (${link('theory.html', 'theory')}: leakage is dependence). We simulate one step of a real cipher and test that independence.` }),
    el('div', { class: 'flow' }, [
      box('1', 'known input', 'p', 'a 4-bit plaintext nibble, random'),
      box('2', 'secret key', 'k', `a 4-bit key nibble (here ${KEY.toString(16).toUpperCase()})`),
      box('3', 'S-box', 'v = S(p ⊕ k)', 'a fixed substitution table (PRESENT cipher)'),
      box('4', 'measured power', 'L = HW(v) + noise', 'HW = number of 1 bits of v'),
      box('5', 'the test', 'L ⊥ HW(v) ?', 'independent → no leak'),
    ]),
    el('p', { html: '<strong>Masking</strong>, the standard defence: the chip never handles v itself, only two <em>shares</em>, v ⊕ m and m, with a fresh random mask m each time. The power is then HW(v ⊕ m) + HW(m) + noise.' }),
    symbols([['\\oplus', 'bitwise XOR'], ['\\text{HW}(v)', 'Hamming weight: the number of 1 bits of v, 0 … 4; the classes we group the traces by'], ['m', 'a fresh uniform 4-bit mask, new for every trace']]),
  ]);
}

/* ---------- E6a · what a leak looks like ---------- */

function densities(masked, sigma, seed) {
  const { labels, leaks } = traces(stream(seed, ID.sideDetection, masked ? 3 : 2), 20000, { masked, sigma, key: KEY });
  const lo = -1 - 3 * sigma, hi = 8 + 3 * sigma, bins = 46, w = (hi - lo) / bins;
  const counts = Array.from({ length: 5 }, () => new Float64Array(bins)), tot = new Float64Array(5);
  for (let i = 0; i < labels.length; i++) { const b = Math.floor((leaks[i] - lo) / w); if (b >= 0 && b < bins) counts[labels[i]][b]++; tot[labels[i]]++; }
  const colors = categoryColors(5);
  return plot({
    x: { min: lo, max: hi, title: 'measured power L' }, y: { min: 0, title: 'density' }, width: 420, height: 220,
    layers: counts.map((c, h) => ({ type: 'line', points: Array.from(c, (v, b) => [lo + (b + 0.5) * w, v / (tot[h] * w)]), color: colors[h] })),
    label: `the distribution of the measured power for each Hamming weight class, ${masked ? 'masked' : 'unprotected'}`,
  });
}

function e6a(page, inputs) {
  const colors = categoryColors(5);
  const byHW = [0, 1, 2, 3, 4].map((h) => {
    const rows = lemmaTable().filter((r) => r.hw === h);
    return [`HW ${h}`, rows.map((r) => r.v.toString(16).toUpperCase()).join(' '), String(rows[0].mean), String(rows[0].variance)];
  });
  return labPanel({
    hw: HW, id: 'E6a', title: 'E6a · What a leak looks like', name: `E6a-sigma${page.sigma}`,
    question: `We simulate 20 000 traces of each implementation (noise σ = ${page.sigma}) and draw, for each class HW(v) = 0 … 4, how the measured power is spread. If the five curves were the same, the power would tell nothing about v.`,
    steps: [
      'one curve per class HW(v) (colours in the legend); x: the measured power, y: how often each value occurs;',
      'left, unprotected: the curves sit at different places — the power reveals HW(v);',
      'right, masked: all five are centred on the same value, but they have <strong>different widths</strong>.',
    ],
    view: () => ({
      answer: { text: 'Masking removes the difference in the <strong>averages</strong> (every class is centred on 4), but not in the <strong>spread</strong>: the power still depends on v. The table shows why, exactly.' },
      body: [
        el('div', { class: 'cols' }, [
          el('div', {}, [el('h3', { class: 'panel-title', text: 'Unprotected' }), densities(false, page.sigma, inputs.seed)]),
          el('div', {}, [el('h3', { class: 'panel-title', text: 'Masked' }), densities(true, page.sigma, inputs.seed)]),
        ]),
        legend([0, 1, 2, 3, 4].map((h) => ['line', colors[h], `HW(v) = ${h}`])),
        el('h3', { class: 'panel-title', text: 'Masked power, without noise: exact mean and variance (all 16 masks enumerated)' }),
        dataTable(['class', 'values of v', 'mean', 'variance'], byHW),
        el('p', { class: 'small', html: `${T} Bit by bit: where v has a 0, the two shares contribute ${m`2m_b \in \{0, 2\}`} (mean 1, variance 1); where v has a 1 they contribute ${m`(1 - m_b) + m_b = 1`} (mean 1, variance 0). So the mean is 4 for every v, the variance ${m`4 - \text{HW}(v)`}.` }),
      ],
      summary: { sigma: page.sigma, lemma: lemmaTable() },
    }),
    why: 'masking is designed to hide the averages, because the classic leakage test compares averages. The information has moved, not gone.',
  });
}

/* ---------- E6b · which test sees it ---------- */

function e6b(page, inputs, redraw) {
  const path = sideDetectionPath({ masked: page.masked, sigma: page.sigma, N: page.n, seed: inputs.seed });
  const la = Math.log10(page.alpha), ymin = -15;
  const stay = (key) => { let last = 0; for (const q of path) if (q[key] > la) last = q.n; return path.at(-1)[key] <= la ? (path.find((q) => q.n > last)?.n ?? null) : null; };
  const cChi = stay('chi'), cT = stay('t');
  const chart = plot({
    x: { min: 100, max: page.n, log: true, title: 'traces measured so far' },
    y: { min: ymin, max: 0, ticks: [0, -5, -10, -15], format: (v) => (v === 0 ? '1' : `10${sup(v)}`), title: 'p-value (log scale)' }, width: 520, height: 240,
    layers: [
      { type: 'shade', y0: ymin, y1: la, color: 'var(--m2)' },
      { type: 'hline', at: la, dash: true, color: MUTED, text: `α = ${page.alpha}` },
      { type: 'line', points: path.map((q) => [q.n, Math.max(ymin - 1, q.t)]), color: 'var(--s1)' },
      { type: 'line', points: path.map((q) => [q.n, Math.max(ymin - 1, q.chi)]), color: 'var(--s2)' },
    ],
    label: 'the p-values of the chi-square test and of the t-test against the number of traces',
  });
  const spec = { kind: 'sideChannelRuns', args: { masked: page.masked, sigma: page.sigma, n: page.n, R: 200, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'side');
  let bars;
  if (got.result) {
    const r = got.result, rate = (arr) => arr.filter((p) => p <= page.alpha).length / r.R;
    const row = (name, q, color) => el('div', { class: 'pb-row' }, [
      el('span', { class: 'pb-v', text: name }),
      el('span', { class: 'pb-track' }, [el('span', { class: 'pb-fill', style: `width:${(100 * q).toFixed(1)}%; background:${color}` })]),
      el('span', { class: 'pb-pct', text: `${Math.round(100 * q)} % of repeats` }),
    ]);
    bars = el('div', { class: 'power-bars' }, [row('χ² test', rate(Array.from(r.chiP)), 'var(--s2)'), row('t-test', rate(Array.from(r.tP)), 'var(--s1)')]);
  } else bars = pending(got, spec, redraw);
  return labPanel({
    hw: HW, id: 'E6b', title: 'E6b · Which test sees the leak?', name: `E6b-${page.masked ? 'masked' : 'plain'}-s${page.sigma}-n${page.n}`,
    question: `Two tests on the same ${page.masked ? 'masked' : 'unprotected'} traces. The <strong>χ² test of independence</strong> compares the whole distribution of the power across the five classes (5 classes × 9 power bins, df 32). <strong>Welch’s t-test</strong> compares only the average power of HW 0 and HW 4 — what the standard leakage check (TVLA) does. Which one notices the leak, and after how many traces?`,
    steps: [
      'left: one growing set of traces; after every few, both p-values are recomputed. x: traces so far, y: p (log scale); inside the tinted band, below α, the leak is <strong>detected</strong>;',
      `right: the whole experiment with ${thin(page.n)} traces, repeated 200 times: how often each test detects the leak.`,
    ],
    flag: updatingFlag(got),
    view: () => ({
      answer: { text: `χ² test: ${cChi ? `detected for good from about <strong>${thin(cChi)} traces</strong>` : `not detected for good within ${thin(page.n)} traces`}. t-test: ${cT ? `detected for good from about ${thin(cT)} traces` : `<strong>not detected</strong> for good within ${thin(page.n)} traces`}. ${page.masked ? 'With masking the averages are equal, so a test of averages is blind; a test of independence is not.' : 'Unprotected, both tests see the leak at once.'}` },
      body: [el('div', { class: 'cols wide-first' }, [
        el('div', {}, [chart, legend([['line', 'var(--s2)', 'χ² test of independence'], ['line', 'var(--s1)', 'Welch’s t-test (averages only)'], ['dash', MUTED, `α = ${page.alpha}`]]), el('p', { class: 'small muted', text: 'Same colours in the bars on the right.' })]),
        el('div', {}, [el('h3', { class: 'panel-title', text: 'Detected in 200 repeats' }), bars,
          el('p', { class: 'small muted', text: 'A single run can be lucky or unlucky; the repeats give the detection rate.' })]),
      ])],
      rows: path.map((q) => ({ traces: q.n, log10pChi: q.chi, log10pT: q.t })),
      summary: { masked: page.masked, sigma: page.sigma, n: page.n, alpha: page.alpha, chiFrom: cChi, tFrom: cT },
    }),
    why: `a device evaluated only with a test of averages can pass and still leak. More noise only delays detection: in this model, doubling the noise from σ = 1 to σ = 2 multiplies the traces the χ² test needs by about 5 (median of 7 runs: 447 → 2 091) ${evidenceHtml('M')}; for large noise the traces grow like a power of the noise whose exponent rises with the number of shares, the reason masking works (Chari et al. 1999 ${S}).`,
  });
}

/* ---------- what it means ---------- */

function meaning() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'What it means' }),
    el('p', { html: 'Masking moves the leak from the <strong>average</strong> of the power to its <strong>spread</strong>, a higher moment. A test that compares averages is blind to it by construction; a test of independence compares whole distributions and finds it. Real masked implementations use more shares (higher-order masking), which pushes the leak to ever higher moments and multiplies the traces an attacker needs — but does not make it vanish.' }),
    el('p', { class: 'small muted', html: `${S} A. Moradi, B. Richter, T. Schneider, F.-X. Standaert, “Leakage detection with the χ²-test”, IACR TCHES 2018(1) 209–237 · G. Goodwill, B. Jun, J. Jaffe, P. Rohatgi, “A testing methodology for side-channel resistance validation” (TVLA), NIST Non-Invasive Attack Testing workshop 2011 · A. Bogdanov et al., “PRESENT: an ultra-lightweight block cipher”, CHES 2007, LNCS 4727, 450–466 · S. Chari, C. S. Jutla, J. R. Rao, P. Rohatgi, “Towards sound approaches to counteract power-analysis attacks”, CRYPTO 1999, LNCS 1666, 398–412. Sources checked on 18 Nov 2026. Simulated traces only: no real device was measured.` }),
  ]);
}

startPage({
  shell: hw07Shell('side-channels.html'),
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
        question: 'A chip is safe when its power consumption is independent of its secret key. Masking hides the key from the classic test — does it hide it from a test of independence?',
        findings: [
          '<strong>Masking hides the averages, not the spread</strong>: every class is centred on 4, with variance 4 − HW(v).',
          '<strong>The t-test is blind</strong> to a masked leak whatever the number of traces; the χ² test finds it (σ = 1: from about 500 traces, and in every one of 200 repeats with 10 000).',
          '<strong>Leakage is dependence</strong>, so the right tool is a test of independence.',
        ],
        sections: [['setting', 'The setting'], ['E6a', 'E6a · what a leak looks like'], ['E6b', 'E6b · which test sees it'], ['meaning', 'What it means']],
      }),
      anchor('setting', setting()), anchor('E6a', e6a(page, inputs)), anchor('E6b', e6b(page, inputs, () => api.draw())), anchor('meaning', meaning()),
    ];
  },
});
