/* berkeley-page.js — dataset D2: Berkeley 1973, an association that disappears inside
   every department. E8 (the second animation of hw07) splits the pooled bars into
   departments so that the pooled rate is seen as a width-weighted average; then the two
   associations that make the paradox possible, the test inside each department with the
   CMH summary, and the causal reading (total vs direct effect). [[Simpson's paradox]],
   note 02 D2, note 04 §2. */

import { el, field, pageLink, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, table as dataTable } from '../../../assets/js/ui/lab.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { show, onCommit } from '../../../assets/js/ui/dock.js';
import { ContingencyTable } from '../core/table.js';
import { chiSquare, effectSizes, cmh } from '../core/tests.js';
import { pText } from '../core/interpret.js';
import { DEPARTMENTS, SOURCE } from '../../data/berkeley.js';
import { readInputs, readAlpha, dock, rejected } from './inputs.js';
import { mosaic, legend, categoryColors, evidenceHtml, abstract, anchor, dagFigure } from './widgets.js';
import { hw07Shell, PAGES, STICKY, MEMORY } from './shell.js';

const HW = 'hw07';
const link = (href, text) => pageLink(PAGES, href, text);
const T = evidenceHtml('T'), O = evidenceHtml('O'), S = evidenceHtml('S');
const pc = (x, d = 1) => `${(100 * x).toFixed(d)} %`;
const symbols = (items) => el('div', { class: 'symbols' }, [
  el('span', { class: 'label', text: 'Symbols' }),
  el('ul', {}, items.map(([tex, text]) => el('li', {}, [el('span', { class: 'sym', html: m`${tex}` }), el('span', { html: text })]))),
]);

/* ---------- the data, read once ---------- */

const DEPTS = DEPARTMENTS.map((d) => d.dept);
const G = ['men', 'women'];
/* per gender g and department d: applications n, admitted a, the weight w = n / all of g's applications, the rate y = a / n */
const APPS = G.map((_, g) => DEPARTMENTS.map((d) => ({ n: d.counts[2 * g] + d.counts[2 * g + 1], a: d.counts[2 * g] })));
const TOTAL = APPS.map((row) => row.reduce((s, c) => s + c.n, 0));
const W = APPS.map((row, g) => row.map((c) => c.n / TOTAL[g]));
const Y = APPS.map((row) => row.map((c) => c.a / c.n));
const POOLED = APPS.map((row, g) => row.reduce((s, c) => s + c.a, 0) / TOTAL[g]);
const STRATA = DEPARTMENTS.map((d) => ContingencyTable.fromCounts(G, ['admitted', 'rejected'], [[d.counts[0], d.counts[1]], [d.counts[2], d.counts[3]]]));

/* ---------- the dock: α only ---------- */

const OWN = {
  id: 'berkeley', label: 'this page',
  build(apply, later) {
    const alpha = el('input', { type: 'number', class: 'num', step: 0.001, 'aria-label': 'significance level alpha' });
    onCommit(alpha, () => apply({ alpha: alpha.value }), later);
    return { nodes: [el('div', { class: 'row' }, [field('α', alpha)])], refresh(v) { show(alpha, v.alpha); } };
  },
  summary: (v) => `α = ${v.alpha}`,
  notes: ['<strong>α</strong>: the false-alarm rate of the tests on this page. The Berkeley counts are published data: nothing here is random, so the seed changes nothing.'],
};

/* ---------- E8 · Simpson, step by step (animated) ---------- */

const NS = 'http://www.w3.org/2000/svg';
const svgNode = (tag, attrs = {}, text = null) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== null) n.textContent = text;
  return n;
};

/** The three stages as rectangles: 2 genders × 6 departments, each {x, w, h} (h = a rate in [0, 1]). */
function layout(plotL, plotW) {
  const gap = 28, PW = (plotW - gap) / 2, GW = plotW / 6, BW = GW * 0.34;
  return [1, 2, 3].map((stage) => G.map((_, g) => {
    let cum = 0;
    return DEPTS.map((_, d) => {
      const r = stage < 3
        ? { x: plotL + g * (PW + gap) + PW * cum, w: Math.max(1, PW * W[g][d] - 1.5), h: stage === 1 ? POOLED[g] : Y[g][d] }
        : { x: plotL + d * GW + GW / 2 - BW - 1 + g * (BW + 2), w: BW, h: Y[g][d] };
      cum += W[g][d];
      return r;
    });
  }));
}

function simpsonFigure() {
  const width = 680, height = 310, pad = { l: 44, r: 10, t: 26, b: 46 };
  const plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;
  const yOf = (rate) => pad.t + plotH * (1 - rate);
  const L = layout(pad.l, plotW);
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', class: 'simpson', 'aria-label': 'admission rates of men and women, pooled and by department' });
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(svgNode('line', { class: 'grid', x1: pad.l, x2: width - pad.r, y1: yOf(t), y2: yOf(t) }));
    svg.append(svgNode('text', { class: 'tick', x: pad.l - 6, y: yOf(t) + 4, 'text-anchor': 'end' }, `${100 * t} %`));
  }
  svg.append(svgNode('text', { class: 'axis-ttl', x: 4, y: 11 }, 'admitted'));
  const colors = ['var(--s1)', 'var(--s2)'];
  const rects = G.map((_, g) => DEPTS.map(() => {
    const r = svgNode('rect', { class: 'sbar', fill: colors[g] });
    svg.append(r);
    return r;
  }));
  // labels per stage, faded in and out
  const groups = [1, 2, 3].map(() => { const n = svgNode('g', { class: 'slabels' }); svg.append(n); return n; });
  const gap = 28, PW = (plotW - gap) / 2, GW = plotW / 6;
  G.forEach((name, g) => {
    const cx = pad.l + g * (PW + gap) + PW / 2;
    groups[0].append(svgNode('text', { class: 'slbl big', x: cx, y: yOf(POOLED[g]) - 8, 'text-anchor': 'middle' }, `${name}: ${pc(POOLED[g])}`));
    groups[0].append(svgNode('text', { class: 'tick', x: cx, y: height - 26, 'text-anchor': 'middle' }, `all ${TOTAL[g].toLocaleString('en-US').replace(',', ' ')} ${name}`));
    groups[1].append(svgNode('line', { class: 'pooled', x1: pad.l + g * (PW + gap), x2: pad.l + g * (PW + gap) + PW, y1: yOf(POOLED[g]), y2: yOf(POOLED[g]) }));
    groups[1].append(svgNode('text', { class: 'slbl', x: pad.l + g * (PW + gap) + PW, y: yOf(POOLED[g]) - 5, 'text-anchor': 'end' }, `${name}, average ${pc(POOLED[g], 1)}`));
    L[1][g].forEach((r, d) => { if (r.w > 13) groups[1].append(svgNode('text', { class: 'tick', x: r.x + r.w / 2, y: height - 30, 'text-anchor': 'middle' }, DEPTS[d])); });
    groups[1].append(svgNode('text', { class: 'tick muted-tick', x: cx, y: height - 14, 'text-anchor': 'middle' }, `${name}: width = share of applications`));
  });
  DEPTS.forEach((dept, d) => groups[2].append(svgNode('text', { class: 'tick', x: pad.l + d * GW + GW / 2, y: height - 30, 'text-anchor': 'middle' }, `dept ${dept}`)));

  const place = (geom) => G.forEach((_, g) => DEPTS.forEach((_, d) => {
    const r = geom[g][d], rect = rects[g][d];
    rect.setAttribute('x', r.x); rect.setAttribute('width', r.w);
    rect.setAttribute('y', yOf(r.h)); rect.setAttribute('height', Math.max(0, yOf(0) - yOf(r.h)));
  }));
  const mix = (A, B, t) => A.map((row, g) => row.map((a, d) => { const b = B[g][d]; return { x: a.x + (b.x - a.x) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t }; }));
  let stage = 1, raf = null;
  const showLabels = (s) => groups.forEach((n, i) => n.setAttribute('class', i === s - 1 ? 'slabels on' : 'slabels'));
  const go = (to, done) => {
    cancelAnimationFrame(raf);
    const from = L[stage - 1], target = L[to - 1], t0 = performance.now(), dur = to === 1 ? 1 : 1100;
    showLabels(0);
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      place(mix(from, target, e));
      if (t < 1) raf = requestAnimationFrame(frame);
      else { stage = to; showLabels(to); done?.(); }
    };
    raf = requestAnimationFrame(frame);
  };
  place(L[0]); showLabels(1);
  return { svg, go, get stage() { return stage; } };
}

function e8() {
  const fig = simpsonFigure();
  const caption = el('p', { class: 'simpson-caption' });
  const chips = [1, 2, 3].map((s) => el('span', { class: 'chip', text: ['1 · pooled', '2 · split by department', '3 · same department, side by side'][s - 1] }));
  const big = (g) => DEPTS.map((d, i) => [d, W[g][i]]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const [m1, m2] = big(0), [w1, w2] = big(1);
  const better = DEPTS.filter((_, d) => Y[1][d] > Y[0][d]);
  const gap = (100 * (POOLED[0] - POOLED[1])).toFixed(1);
  const CAPTIONS = [
    `<strong>Step 1 · pooled.</strong> ${pc(POOLED[0])} of men admitted, ${pc(POOLED[1])} of women: a ${gap}-point gap.`,
    `<strong>Step 2 · split.</strong> Same bars, cut by department. Men applied mostly to ${m1[0]} and ${m2[0]} (wide slices, high rates); women mostly to ${w1[0]} and ${w2[0]} (wide slices, low rates). The dashed line, each pooled rate, is the average of the slices weighted by their width.`,
    `<strong>Step 3 · same department.</strong> Women are admitted more often in ${better.join(', ')}; men in ${DEPTS.filter((d) => !better.includes(d)).join(' and ')}, by a few points. No department shows the ${gap}-point gap.`,
  ];
  const step = el('button', { type: 'button', class: 'primary' });
  const setStage = (s) => {
    caption.innerHTML = CAPTIONS[s - 1];
    chips.forEach((c, i) => { c.className = i === s - 1 ? 'chip on' : 'chip'; });
    step.textContent = s === 3 ? '↺ Back to step 1' : `Next step ▸ (${s + 1} of 3)`;
  };
  step.addEventListener('click', () => { const to = fig.stage % 3 + 1; fig.go(to); setStage(to); });
  setStage(1);
  const terms = (g) => DEPTS.map((_, d) => `${W[g][d].toFixed(2)} \\cdot ${Y[g][d].toFixed(2)}`).join(' + ');
  return labPanel({
    hw: HW, id: 'E8', title: 'E8 · Simpson’s paradox, step by step', name: 'E8-simpson',
    question: `Men were admitted more often than women (${pc(POOLED[0])} vs ${pc(POOLED[1])}). But each department decides its own admissions, so the fair comparison is <em>inside</em> each department. Three steps take the pooled numbers apart to see where the gap comes from.`,
    steps: [
      '<strong>pooled</strong>: one bar per gender; height = share admitted (teal = men, orange = women);',
      '<strong>split</strong>: each bar is cut into six slices, one per department. Width = the share of that gender’s applications sent there; height = the admission rate there. The area stays the same, so the bar’s height is the slices’ width-weighted average;',
      '<strong>same department</strong>: men and women side by side in each department — the like-for-like comparison. Press “Next step” to move on.',
    ],
    controls: [step],
    view: () => ({
      answer: { text: `Inside the departments the gap disappears: women do better in ${better.length} of 6. The pooled gap comes from <strong>where</strong> each gender applied: most women applied to the departments that admit few.` },
      body: [
        el('div', { class: 'row chips' }, chips),
        el('div', { class: 'chart' }, [fig.svg]),
        legend([['bar', 'var(--s1)', 'men'], ['bar', 'var(--s2)', 'women'], ['dash', 'var(--ink)', 'pooled rate (step 2)']]),
        caption,
        el('h3', { class: 'panel-title', text: 'Step 2 in numbers: the pooled rate is a weighted average' }),
        el('div', { class: 'eq', html: M`P(\text{admitted} \mid g) &= \sum_d w_{g,d}\; y_{g,d} \\ \text{men:}\ \ ${POOLED[0].toFixed(3)} &= ${terms(0)} \\ \text{women:}\ \ ${POOLED[1].toFixed(3)} &= ${terms(1)}` }),
        symbols([['d', 'a department, A … F'], ['w_{g,d}', 'the share of gender g’s applications that went to department d (the slice widths)'], ['y_{g,d}', 'the admission rate of gender g in department d (the slice heights)']]),
      ],
      rows: G.flatMap((g, gi) => DEPTS.map((d, di) => ({ gender: g, dept: d, weight: W[gi][di], rate: Y[gi][di] }))),
      summary: { pooled: { men: POOLED[0], women: POOLED[1] } },
    }),
    why: 'pooled and department-by-department give opposite answers. Neither is wrong; they answer different questions (last card).',
  });
}

/* ---------- the two associations behind the paradox ---------- */

function twoAssociations() {
  const gd = ContingencyTable.fromCounts(G, DEPTS, APPS.map((row) => row.map((c) => c.n)));
  const da = ContingencyTable.fromCounts(DEPTS, ['admitted', 'rejected'], DEPARTMENTS.map((d) => [d.counts[0] + d.counts[2], d.counts[1] + d.counts[3]]));
  const vg = effectSizes(chiSquare(gd)).cramerV, va = effectSizes(chiSquare(da)).cramerV;
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The paradox needs two associations' }),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('h3', { class: 'panel-title', text: `1 · Gender and department (V = ${vg.toFixed(2)})` }),
        mosaic({ table: gd, label: 'mosaic of department by gender: men applied mostly to A and B, women to C to F', width: 300, height: 230 }),
        legend(DEPTS.map((d, i) => ['bar', categoryColors(6)[i], d])),
        el('p', { class: 'small', text: 'Where each gender applied: men mostly to A and B, women mostly to C–F.' }),
      ]),
      el('div', {}, [
        el('h3', { class: 'panel-title', text: `2 · Department and admission (V = ${va.toFixed(2)})` }),
        mosaic({ table: da, marginLine: true, label: 'mosaic of admission by department: A and B admit most applicants, C to F few', width: 300, height: 230 }),
        legend([['bar', categoryColors(2)[0], 'admitted'], ['bar', categoryColors(2)[1], 'rejected']]),
        el('p', { class: 'small', text: 'How hard each department is: A and B admit most applicants, F almost none.' }),
      ]),
    ]),
    el('p', { html: `Both are strong, far stronger than the pooled gender gap (V = 0.14). Together they produce it: women applied where admission is hard. ${T} Without the first one there is no paradox: if both genders had the same department mix (the same weights ${m`w_d`}), a gender that does at least as well in every department would do at least as well overall.` }),
    explain([`With common weights the difference of the pooled rates is ${M`\sum_d w_d\,(y_{\text{women},d} - y_{\text{men},d}),`} a sum of terms that are all ≥ 0 if women do at least as well in every department. ∎`], 'Proof'),
  ]);
}

/* ---------- the test inside each department ---------- */

function withinDepartments(alpha) {
  const rows = STRATA.map((t, d) => {
    const x = chiSquare(t), sig = x.p <= alpha;
    const fav = Y[1][d] > Y[0][d] ? 'women' : 'men';
    return [DEPTS[d], pc(Y[0][d]), pc(Y[1][d]), x.chi2.toFixed(2), pText(x), sig ? `✓ yes, favours ${fav}` : 'no'];
  });
  const c = cmh(STRATA);
  return labPanel({
    hw: HW, id: 'E8b', title: 'E8b · Is there a gap inside the departments?', name: 'E8b-within',
    question: 'Department by department, is admission independent of gender?',
    steps: [
      'one χ² test per department, on its own 2 × 2 table (gender × admitted or not);',
      `then one test that adds up the six departments’ evidence <em>without mixing them</em> (Cochran–Mantel–Haenszel): in each department it compares the men admitted with what independence predicts there, and sums these gaps.`,
    ],
    view: () => ({
      answer: { text: `Only department A shows a significant gap, and it favours <strong>women</strong>. Adding up all six departments: CMH p = <strong>${pText(c)}</strong> ${c.p > alpha ? '>' : '≤'} α = ${alpha}, ${c.p > alpha ? 'no evidence of a gender gap once the department is fixed' : 'a gender gap within departments'}. Men’s odds of admission are ${c.mhOR.toFixed(2)} times women’s inside a department (1 = no gap).` },
      body: [
        dataTable(['dept', 'men admitted', 'women admitted', 'χ²', 'p', `significant at α = ${alpha}?`], rows),
        symbols([['\\text{CMH}', 'the Cochran–Mantel–Haenszel statistic: the six departments’ gaps added up, compared with a χ² law with 1 df'],
          ['\\text{odds}', 'admitted ÷ rejected; the common odds ratio 0.90 compares men’s odds with women’s, department by department']]),
      ],
      rows: STRATA.map((t, d) => ({ dept: DEPTS[d], men: Y[0][d], women: Y[1][d], chi2: chiSquare(t).chi2, p: chiSquare(t).p })),
      summary: { cmh: c.cmh, p: c.p, mhOR: c.mhOR, alpha },
    }),
    why: 'the pooled table mixes departments with very different admission rates; testing inside each department removes that mixing.',
  });
}

/* ---------- which table is right? ---------- */

const dag = () => dagFigure({
  nodes: { g: [70, 105, 'gender'], d: [210, 30, 'department'], a: [350, 105, 'admission'] },
  edges: [['g', 'd'], ['d', 'a'], ['g', 'a', 'direct']],
  label: 'gender points to department and to admission; department points to admission',
  note: 'direct path (dashed): what the departments decide',
});

function whichTable() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Which table is right?' }),
    el('div', { class: 'cols' }, [
      el('div', {}, [dag()]),
      el('div', {}, [
        el('p', { html: '<strong>Pooled table</strong> → the <em>total</em> effect of gender on admission, through both paths: it includes the choice of department. Answer: women were admitted less often.' }),
        el('p', { html: '<strong>Department by department</strong> → the <em>direct</em> effect, the dashed path: how departments treated equal applicants. Answer: no evidence of a gap against women.' }),
      ]),
    ]),
    el('p', { class: 'small', html: `Statistics shows that the answer changes when one conditions on the department; <em>which</em> question matters is not a statistical choice ${O}. For “did admission committees discriminate?” the direct effect is the relevant one. Why women applied to the harder departments is a further question the data cannot answer (more in ${link('causality.html', 'causality')}).` }),
    el('p', { class: 'small muted', html: `Data: ${SOURCE.citation} ${S}. ${SOURCE.scope}` }),
  ]);
}

startPage({
  shell: hw07Shell('berkeley.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const inputs = readInputs(api.state), { alpha, error: aErr } = readAlpha(api.state, 0.05);
    const error = inputs.error ?? aErr;
    dock({ ...inputs, error }, api.update, OWN, { alpha });
    if (error) return [rejected(error)];
    return [
      abstract({
        question: 'Berkeley 1973: 44.5 % of men admitted, 30.4 % of women. Were the departments biased against women?',
        findings: [
          '<strong>Overall</strong>: a real gap (p ≈ 8 × 10⁻²²).',
          '<strong>Inside the departments</strong>: no gap against women (4 of 6 favour women; all six together p = 0.22).',
          '<strong>Why</strong>: women applied mostly to the departments that admit few — Simpson’s paradox.',
        ],
        sections: [['E8', 'E8 · Simpson, step by step'], ['two', 'Two associations'], ['E8b', 'E8b · inside the departments'], ['which', 'Which table is right?']],
      }),
      anchor('E8', e8()), anchor('two', twoAssociations()), anchor('E8b', withinDepartments(alpha)), anchor('which', whichTable()),
    ];
  },
});
