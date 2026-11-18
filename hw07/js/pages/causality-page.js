/* causality-page.js — association without cause. E9: three causal structures (a common
   cause, a mediator, a selection) that make a χ² test find, or lose, a dependence; E10:
   what randomisation and the back-door adjustment do; E11: a 99 %-accurate alarm for a
   rare target, mostly wrong (Bayes). The models are synthetic and say so.
   [[Causal graphs - confounders, mediators, colliders]], [[Bayes theorem and base rates]],
   note 04. */

import { el, field, pageLink } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel } from '../../../assets/js/ui/lab.js';
import { barChart } from '../../../assets/js/ui/barchart.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { nice } from '../../../assets/js/ui/format.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { chiSquare } from '../core/tests.js';
import { collider, confounder, mediator, rates, backdoor, ppv, baseRateTable } from '../core/causal.js';
import { stream, ID } from '../core/experiments.js';
import { pText } from '../core/interpret.js';
import { readInputs, dock, rejected } from './inputs.js';
import { legend, evidenceHtml, abstract, anchor, viewSwitch, cellTable, dagFigure } from './widgets.js';
import { hw07Shell, PAGES, STICKY, MEMORY } from './shell.js';

const HW = 'hw07';
const link = (href, text) => pageLink(PAGES, href, text);
const T = evidenceHtml('T'), O = evidenceHtml('O'), S = evidenceHtml('S');
const pc = (x, d = 1) => `${(100 * x).toFixed(d)} %`;
const thin = (n) => nice(n);
const symbols = (items) => el('div', { class: 'symbols' }, [
  el('span', { class: 'label', text: 'Symbols' }),
  el('ul', {}, items.map(([tex, text]) => el('li', {}, [el('span', { class: 'sym', html: m`${tex}` }), el('span', { html: text })]))),
]);
const ALPHA = 0.05;

/* ---------- the dock: the alarm of E11 ---------- */

function readPage(state) {
  const s = numberOr(state.s, 0.99), t = numberOr(state.t, 0.99), pi = numberOr(state.pi, 1e-5);
  let error = null;
  if (!(s > 0 && s <= 1)) error = `the sensitivity must be in (0, 1] (got ${s}).`;
  else if (!(t >= 0.5 && t < 1)) error = `the specificity must be in [0.5, 1) (got ${t}).`;
  else if (!(pi >= 1e-7 && pi <= 0.5)) error = `the base rate must be between 10⁻⁷ and 0.5 (got ${pi}).`;
  return { s, t, pi, error };
}

const OWN = {
  id: 'causality', label: 'this page (E11)',
  build(apply, later) {
    const num = (label, key) => { const i = el('input', { type: 'number', class: 'num', step: 'any', 'aria-label': label }); onCommit(i, () => apply({ [key]: i.value }), later); return i; };
    const s = num('sensitivity', 's'), t = num('specificity', 't'), pi = num('base rate', 'pi');
    pi.style.width = '13ch';
    return { nodes: [el('div', { class: 'row' }, [field('sensitivity s', s), field('specificity t', t), field('base rate π', pi)])], refresh(v) { show(s, v.s); show(t, v.t); show(pi, v.pi); } };
  },
  summary: (v) => `alarm: s = ${v.s}, t = ${v.t}, π = ${v.pi}`,
  notes: [
    '<strong>sensitivity s</strong>: the share of real targets that raise the alarm.',
    '<strong>specificity t</strong>: the share of innocent cases that do not raise it (1 − t raise it by mistake).',
    '<strong>base rate π</strong>: the share of real targets in the population (10⁻⁵ = 1 in 100 000).',
    'The simulations of E9 and E10 use the shared seed with fixed, synthetic parameters.',
  ],
};

/* ---------- association is not cause ---------- */

function idea(inputs) {
  const obs = rates(confounder(stream(inputs.seed, ID.causal, 1)).marginal);
  const rnd = rates(confounder(stream(inputs.seed, ID.causal, 4), { randomised: true }).marginal);
  const side = (title, tex, meaning, example) => el('div', { class: 'see-do' }, [
    el('h3', { class: 'panel-title', text: title }), el('div', { class: 'eq', html: M`${tex}` }), el('p', { class: 'small', html: meaning }), el('p', { class: 'example', html: example }),
  ]);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Seeing together is not making happen' }),
    el('p', { html: 'Two different questions about an old operating system (X) and infection (Y), on the same simulated devices:' }),
    el('div', { class: 'cols' }, [
      side('Seeing', 'P(Y \\mid X)', 'Among the devices that <em>happen</em> to run an old OS, how many are infected? What the data show, and what χ² compares.',
        `old OS: <strong>${pc(obs.yes)}</strong> infected · other OS: <strong>${pc(obs.no)}</strong>`),
      side('Making happen', 'P(Y \\mid do(X))', 'If <em>we</em> installed the old OS on a device, would it get infected more often? The causal effect.',
        `OS set by a coin flip: <strong>${pc(rnd.yes)}</strong> vs <strong>${pc(rnd.no)}</strong> — no effect`),
    ]),
    el('p', { html: 'The gap on the left is real, but the OS does not cause it: old devices more often have <em>both</em> an old OS and an infection. A χ² test sees only the left side. The two sides agree only when nothing else links X and Y — E9 shows three ways they can disagree, E10 how to get from one to the other.' }),
  ]);
}

/* ---------- E9 · three structures ---------- */

let e9View = 'fork';

function rateBars(groups, xName, yName) {
  // groups: [{label, table}] → bars of P(Y yes | X yes) and P(Y yes | X no) per group, one chart
  return barChart({
    categories: groups.map((g) => g.label),
    series: [
      { label: `${xName}: yes`, color: 'var(--s1)', values: groups.map((g) => rates(g.table).yes) },
      { label: `${xName}: no`, color: 'var(--s2)', values: groups.map((g) => rates(g.table).no) },
    ],
    yTitle: `share ${yName}`, width: 620, height: 220,
  });
}

/** One χ² verdict as a chip: the group, then dependent or not, with p. */
function verdict(label, t) {
  const x = chiSquare(t), dep = x.p <= ALPHA;
  return el('span', { class: `vchip ${dep ? 'dep' : 'indep'}`, html: `${label}: <strong>${dep ? 'associated' : 'no association'}</strong> (p = ${pText(x)})` });
}

function e9(inputs) {
  const f = confounder(stream(inputs.seed, ID.causal, 1));
  const md = mediator(stream(inputs.seed, ID.causal, 2));
  const col = collider(stream(inputs.seed, ID.causal, 3));
  const VIEWS = {
    fork: {
      label: 'a common cause',
      dag: dagFigure({ nodes: { x: [80, 110, 'old OS'], z: [210, 32, 'legacy device'], y: [340, 110, 'infected'] }, edges: [['z', 'x'], ['z', 'y']], boxed: ['z'], label: 'legacy device points to old OS and to infected; no arrow between them' }),
      story: 'Legacy devices more often run an old OS <em>and</em> more often get infected. The OS itself does nothing.',
      xName: 'old OS', yName: 'infected',
      left: [{ label: 'all devices', table: f.marginal }],
      right: f.strata.map((t) => ({ label: t.stratum === 'legacy device' ? 'legacy devices' : 'other devices', table: t })),
      rule: 'Lesson: a common cause fakes an effect. <strong>Compare inside its groups</strong> and the gap goes away.',
    },
    chain: {
      label: 'a mediator',
      dag: dagFigure({ nodes: { x: [70, 110, 'clicked link'], m: [210, 32, 'credentials stolen'], y: [350, 110, 'account misused'] }, edges: [['x', 'm'], ['m', 'y']], boxed: ['m'], label: 'clicked link points to credentials stolen, which points to account misused' }),
      story: 'Clicking a phishing link gets credentials stolen, and stolen credentials get the account misused. Here the effect is real.',
      xName: 'clicked', yName: 'misused',
      left: [{ label: 'all users', table: md.marginal }],
      right: md.strata.map((t) => ({ label: t.stratum, table: t })),
      rule: 'Lesson: inside the groups the gap also goes away, yet clicking <em>does</em> cause misuse, through the stolen credentials. <strong>Don’t split by a mediator</strong> when you want the whole effect.',
    },
    collider: {
      label: 'a selection',
      dag: dagFigure({ nodes: { x: [80, 40, 'alarm X fires'], s: [210, 115, 'case is kept'], y: [340, 40, 'alarm Y fires'] }, edges: [['x', 's'], ['y', 's']], boxed: ['s'], label: 'two independent alarms both point to case is kept' }),
      story: 'Two independent alarms, each firing in 30 % of cases. Only the cases where at least one fired reach the analyst.',
      xName: 'alarm X fired', yName: 'alarm Y fired',
      left: [{ label: 'all cases', table: col.all }],
      right: [{ label: 'only the kept cases', table: col.selected }],
      rule: 'Lesson: independent in reality, associated in the kept data (if X did not fire, Y must have). <strong>Never select on a common effect.</strong>',
    },
  };
  const holder = el('div');
  const draw = (key) => {
    const v = VIEWS[key];
    const groups = [...v.left, ...v.right];
    holder.replaceChildren(
      el('div', { class: 'cols wide-first' }, [el('div', {}, [v.dag]), el('div', {}, [el('p', { html: v.story }), el('p', { class: 'rule', html: v.rule })])]),
      rateBars(groups, v.xName, v.yName),
      legend([['bar', 'var(--s1)', `${v.xName}: yes`], ['bar', 'var(--s2)', `${v.xName}: no`]]),
      el('div', { class: 'row vchips' }, groups.map((g) => verdict(g.label, g.table))),
    );
  };
  draw(e9View);
  return labPanel({
    hw: HW, id: 'E9', title: 'E9 · Three ways to fool a χ² test', name: `E9-seed${inputs.seed}`,
    question: 'Three small simulated worlds, each built from a different causal diagram. In each we run the same χ² test twice — on all the data, and split by a third variable (or only on the cases that were kept) — and ask: does the association it finds mean a cause?',
    steps: [
      'choose a world; in the diagram, arrows = what causes what, and the boxed variable is the one we split or select on;',
      'each pair of bars: the share of Y among cases with X = yes (teal) and X = no (orange); different heights = an association;',
      'first pair: all the data; the others: inside each group of the boxed variable (or only the kept cases). Under the chart, the χ² verdict for each.',
    ],
    controls: [viewSwitch(Object.entries(VIEWS).map(([k, v]) => [k, v.label]), e9View, (k) => { e9View = k; draw(k); }, 'causal structure')],
    view: () => ({
      answer: { text: 'A common cause and a mediator both create an association that vanishes inside the groups — yet only the mediator is a real effect. A selection creates an association out of nothing. <strong>The table alone cannot tell these apart</strong>; the diagram, a claim about the world, can.' },
      body: [holder],
      summary: { seed: inputs.seed, fork: chiSquare(f.marginal).chi2, chain: chiSquare(md.marginal).chi2, colliderSelected: chiSquare(col.selected).chi2 },
    }),
    why: 'the χ² test answers “are X and Y associated?”, never “does X cause Y?”. Which groups to compare depends on the causal structure, which the data do not reveal.',
    notes: [`${T} The common cause: ${m`P(x, y \mid z) = P(x \mid z)\,P(y \mid z)`}, so X and Y are independent inside each group. The selection: with ${m`P(\text{fire}) = 0.3`}, among the kept cases ${m`P(Y \mid X) = 0.3`} but ${m`P(Y \mid \text{not } X) = 1`}, a correlation of −0.7. Synthetic models, ${thin(20000)}–${thin(100000)} simulated cases each.`],
  });
}

/* ---------- E10 · randomisation and adjustment ---------- */

function e10(inputs) {
  const obs = confounder(stream(inputs.seed, ID.causal, 1));
  const rnd = confounder(stream(inputs.seed, ID.causal, 4), { randomised: true });
  const ro = rates(obs.marginal), rr = rates(rnd.marginal), rb = backdoor(obs.strata);
  const chart = barChart({
    categories: ['observed', 'OS set by a coin', 'adjusted for the device'],
    series: [{ label: 'old OS: yes', color: 'var(--s1)', values: [ro.yes, rr.yes, rb.yes] }, { label: 'old OS: no', color: 'var(--s2)', values: [ro.no, rr.no, rb.no] }],
    yTitle: 'share infected', width: 520, height: 240,
  });
  return labPanel({
    hw: HW, id: 'E10', title: 'E10 · Getting from association to cause', name: `E10-seed${inputs.seed}`,
    question: 'In the common-cause world the old OS does nothing, yet the raw infection rates differ by 15 points. We estimate its effect three ways on the simulated devices — a raw comparison, an experiment, an adjustment — to see which ones recover the truth (no effect).',
    steps: [
      '<strong>observed</strong>: the raw infection rates with and without the old OS;',
      '<strong>OS set by a coin</strong>: an experiment — each device gets the old OS by a coin flip, so the OS no longer follows the device type;',
      '<strong>adjusted</strong>: no experiment; compare inside each device group, then average the groups with their sizes as weights.',
    ],
    view: () => ({
      answer: { text: `Observed: ${pc(ro.yes)} vs ${pc(ro.no)} infected — a large gap. With the OS set by a coin: ${pc(rr.yes)} vs ${pc(rr.no)}; adjusted: ${pc(rb.yes)} vs ${pc(rb.no)}. Both find, up to noise, the true effect: <strong>none</strong>.` },
      body: [
        chart, legend([['bar', 'var(--s1)', 'old OS: yes'], ['bar', 'var(--s2)', 'old OS: no']]),
        el('div', { class: 'eq', html: M`P(Y \mid do(X = x)) = \sum_z P(Y \mid X = x, Z = z)\, P(Z = z)` }),
        symbols([['z', 'a group of the common cause (legacy device or not)'], ['P(Z = z)', 'the share of all devices in that group: the weight'], ['P(Y \\mid X = x, Z = z)', 'the infection rate inside the group']]),
      ],
      summary: { observed: ro, randomised: rr, adjusted: rb },
    }),
    why: 'a coin flip is independent of everything else, so it breaks every hidden link between X and Y: the reason randomised experiments are the standard for causal claims. Adjustment needs the common cause to be measured, and the diagram to be right.',
    notes: [`The adjustment formula (Pearl’s back-door adjustment ${S}) is valid when the variable adjusted for blocks every path into X and is not caused by X — true for the device type, false for a mediator.`],
  });
}

/* ---------- E11 · base rates ---------- */

function e11(page) {
  const tab = baseRateTable({ s: page.s, t: page.t, pi: page.pi });
  const [tp, fn, fp, tn] = tab.O, alarms = tp + fp, value = ppv(page);
  const share = alarms ? tp / alarms : 0;
  return labPanel({
    hw: HW, id: 'E11', title: `E11 · A ${pc(Math.min(page.s, page.t), 0)} accurate alarm, mostly wrong`, name: `E11-s${page.s}-t${page.t}-pi${page.pi}`,
    question: `An alarm catches ${pc(page.s, 0)} of real targets and clears ${pc(page.t, 0)} of innocent cases, and real targets are ${page.pi >= 0.01 ? pc(page.pi, 0) : `1 in ${thin(Math.round(1 / page.pi))}`}. We count, in one million people, how many alarms are real: if the alarm rings, how likely is a real target?`,
    steps: [
      'take one million people; the table shows how many are targets and how many raise the alarm;',
      'the bar shows all the alarms: teal = real targets, orange = false alarms.',
    ],
    view: () => ({
      answer: { text: `Of ${thin(alarms)} alarms, <strong>${thin(tp)} are real</strong>: P(target | alarm) = ${value < 0.01 ? pc(value, 2) : pc(value, 1)}. The alarm is strongly associated with being a target, and still <strong>${pc(1 - value, 1)} of the alarms are false</strong>${value < 0.5 ? `, because innocents outnumber targets ${thin(Math.round((1 - page.pi) / page.pi))} to 1` : ''}.` },
      body: [
        el('div', { class: 'cols' }, [
          el('div', {}, [cellTable({ table: tab, cell: (i, j) => thin(tab.at(i, j)), rowMargin: (i) => thin(tab.R[i]), colMargin: (j) => thin(tab.C[j]), corner: thin(tab.N), label: 'one million people: target or not, alarm or not' })]),
          el('div', {}, [
            el('div', { class: 'alarm-bar', role: 'img', 'aria-label': `${tp} real alarms and ${fp} false alarms` }, [
              el('span', { class: 'real', style: `width:${Math.max(0.6, 100 * share)}%` }),
              el('span', { class: 'false', style: `width:${100 - Math.max(0.6, 100 * share)}%` }),
            ]),
            legend([['bar', 'var(--s1)', `real: ${thin(tp)}`], ['bar', 'var(--s2)', `false: ${thin(fp)}`]]),
          ]),
        ]),
        el('div', { class: 'eq', html: M`P(\text{target} \mid \text{alarm}) = \frac{s\,\pi}{s\,\pi + (1 - t)(1 - \pi)}` }),
        symbols([['s', `sensitivity: the share of targets that raise the alarm (${page.s})`], ['t', `specificity: the share of innocents that do not (${page.t})`], ['\\pi', `base rate: the share of targets in the population (${page.pi})`]]),
        el('p', { class: 'small', html: `${O} This is the arithmetic of mass surveillance and of intrusion detection: looking for a rare target among millions, even an excellent detector produces mostly false alarms, each one a real person or event wrongly flagged (Axelsson 2000 on intrusion detection ${S}). The association between “flagged” and “guilty” is a fact about groups; reading it as a fact about the person flagged is where statistics turns into harm.` }),
      ],
      summary: { s: page.s, t: page.t, pi: page.pi, alarms, real: tp, ppv: value },
    }),
    why: `Bayes’ theorem: the alarm tells P(alarm | target), the question is P(target | alarm); with a rare target the two differ by orders of magnitude ${T}.`,
  });
}

startPage({
  shell: hw07Shell('causality.html'),
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
        question: 'A χ² test finds an association. When does that mean that X causes Y — and when does it not?',
        findings: [
          '<strong>A common cause</strong> creates an association with no effect at all (χ² ≈ 900 overall, nothing inside the groups); <strong>a selection</strong> creates one between independent alarms (correlation −0.7 among the cases kept).',
          '<strong>A mediator</strong> looks exactly like a common cause in the tables, but its effect is real: the table cannot tell them apart; the causal diagram can.',
          '<strong>Randomisation and adjustment</strong> recover the true effect (none) where the raw rates differ by 15 points.',
          '<strong>A 99 % accurate alarm</strong> for a 1-in-100 000 target is right about once in a thousand alarms.',
        ],
        sections: [['idea', 'Seeing vs making happen'], ['E9', 'E9 · three structures'], ['E10', 'E10 · from association to cause'], ['E11', 'E11 · base rates']],
      }),
      anchor('idea', idea(inputs)), anchor('E9', e9(inputs)), anchor('E10', e10(inputs)), anchor('E11', e11(page)),
      el('p', { class: 'small muted', html: `Berkeley 1973, causally (total vs direct effect): see the last card of ${link('berkeley.html', 'Berkeley 1973')}.` }),
    ];
  },
});
