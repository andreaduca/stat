/* liouville-page.js — why Φ has no elementary formula (note 04; [[Elementary functions
   and Liouville's theorem]]): the definitions, Liouville's criterion, the full two-step
   proof for e^{−x²} with a diagram of each case, the corollary for Φ and erf, the E11
   checker (try a rational R and see which term of R′ − 2xR cannot cancel), what naming
   erf achieves, and why numerics are needed anyway. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { residual, residualTex, polyTex } from '../core/liouville.js';
import { erfcHybrid } from '../core/normal.js';
import { readInputs, dock, rejected } from './inputs.js';
import { LEBESGUE, MUTED, evidenceHtml, abstract, anchor } from './widgets.js';
import { hw06Shell, STICKY, MEMORY } from './shell.js';

const card = (title, kids) => el('div', { class: 'card' }, [el('h2', { text: title }), ...kids]);
const p = (h, cls) => el('p', { html: h, class: cls });

/* ---------- this page's row in the dock: the candidate R for E11 ---------- */

function readPage(state) {
  const raw = state.R ?? '1, 0, 3';
  const coeffs = raw.split(',').map((t) => t.trim()).filter((t) => t !== '').map(Number);
  const c = numberOr(state.c, 0), a = numberOr(state.a, 1), k = Math.round(numberOr(state.k, 1));
  let error = null;
  if (!coeffs.length || coeffs.some((v) => !Number.isFinite(v))) error = `the coefficients of R must be numbers separated by commas (got "${raw}").`;
  else if (coeffs.length > 9) error = 'at most 9 coefficients (degree 8).';
  else if (!(k >= 1 && k <= 6)) error = `the pole order k must be between 1 and 6 (got ${k}).`;
  return { raw, coeffs, c, a, k, error };
}

const OWN = {
  id: 'liouville', label: 'this page',
  build(apply, later) {
    const R = el('input', { type: 'text', class: 'num p-in', 'aria-label': 'coefficients of the polynomial part of R, constant term first' });
    const c = el('input', { type: 'number', class: 'num', step: 'any', 'aria-label': 'coefficient c of the pole term' });
    const a = el('input', { type: 'number', class: 'num', step: 'any', 'aria-label': 'position a of the pole' });
    const k = el('input', { type: 'number', class: 'num', min: 1, max: 6, 'aria-label': 'order k of the pole' });
    for (const [node, key] of [[R, 'R'], [c, 'c'], [a, 'a'], [k, 'k']]) onCommit(node, () => apply({ [key]: node.value.trim() }), later);
    return {
      nodes: [el('div', { class: 'row' }, [field('E11: polynomial p₀, p₁, …', R), el('span', { class: 'vrule' }), field('pole: c', c), field('at a', a), field('order k', k)])],
      refresh(v) { show(R, v.raw); show(c, v.c); show(a, v.a); show(k, v.k); },
    };
  },
  summary: (v) => `R = ${v.raw}${v.c ? ` + ${v.c}/(x − ${v.a})^${v.k}` : ''}`,
  notes: ['<strong>E11</strong>: the candidate R = p₀ + p₁x + p₂x² + … + c/(x − a)ᵏ. Coefficients constant term first, separated by commas; c = 0 means no pole. The page computes R′ − 2xR exactly and shows the term that cannot cancel.'],
};

/* ---------- the text ---------- */

function definitions() {
  return card('Elementary functions', [
    p(`An <strong>elementary function</strong> is built from the rational functions ${m`p(x)/q(x)`} by finitely many ${m`+, -, \times, ÷`}, compositions, ${m`\exp`}, ${m`\log`}, and roots of polynomial equations. That includes ${m`\sin`}, ${m`\cos`}, ${m`\operatorname{arctan}`} (through complex ${m`\exp`} and ${m`\log`}) and ${m`x^x = e^{x \log x}`}.`),
    p(`It is a precise, algebraic class: the functions 17th–19th century analysis named first. The question “does ${m`\int e^{-x^2}\,dx`} have a closed form?” means: is some ${m`F`} in this class with ${m`F' = e^{-x^2}`}?`),
  ]);
}

function theorem() {
  return card('Liouville’s criterion', [
    p(`${evidenceHtml('S')} <strong>Liouville (1835), modern form Rosenlicht (1972).</strong> If a rational ${m`f`} has an elementary antiderivative, then ${m`f = v_0' + \sum_i c_i\, v_i'/v_i`} with constants ${m`c_i`} and rational ${m`v_i`}: an elementary integral can only add logarithms of things already present. The proof is deep (differential algebra); here it is quoted, not proved.`),
    p(`For integrands of the form ${m`f e^{g}`} it becomes a concrete test ${evidenceHtml('T')} (the “if” direction is one line; the “only if” rests on the theorem):`),
    el('div', { html: M`\int f\,e^{g}\,dx \ \text{is elementary} \iff R' + g' R = f \ \text{has a rational solution } R` }),
    p(`and then ${m`\int f e^{g} = R\,e^{g}`}, because ${m`(R e^{g})' = (R' + g'R)\,e^{g} = f e^{g}`}. For the Gaussian, ${m`f = 1`} and ${m`g = -x^2`}: the question becomes whether`, 'small'),
    el('div', { html: M`R' - 2xR = 1` }),
    p('has a rational solution.', 'small'),
  ]);
}

/** A bar diagram: the order of each term; the tallest one has nothing to cancel it. */
function orders(title, bars, yTitle) {
  const top = Math.max(...bars.map((b) => b[1]));
  return el('div', {}, [
    el('h3', { class: 'panel-title', text: title }),
    plot({
      x: { min: 0.4, max: bars.length + 0.6, ticks: bars.map((_, i) => i + 1), format: (v) => bars[Math.round(v) - 1]?.[0] ?? '' },
      y: { min: 0, max: top + 0.6, title: yTitle, ticks: Array.from({ length: top + 1 }, (_, i) => i) },
      width: 380, height: 220,
      layers: bars.map(([name, h], i) => ({ type: 'bars', bars: [[i + 0.7, i + 1.3, Math.max(h, 0.06)]], color: h === top ? LEBESGUE : MUTED, label: name })),
      label: `${title}: ${bars.map(([n, h]) => `${n} ${h}`).join(', ')}`,
    }),
  ]);
}

function proof() {
  return card('The proof: R′ − 2xR = 1 has no rational solution', [
    p(`${evidenceHtml('T')} Suppose a rational ${m`R`} solves it. Two steps, one for each thing a rational function can have: poles, and a polynomial part.`),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        p(`<strong>1. No poles.</strong> If ${m`R`} had a pole of order ${m`k \ge 1`} at ${m`a`}, ${m`R \approx c\,(x-a)^{-k}`} with ${m`c \ne 0`}, then ${m`R'`} has a pole of order exactly ${m`k+1`} (leading term ${m`-kc\,(x-a)^{-k-1}`}), while ${m`2xR`} has a pole of order at most ${m`k`}. So ${m`R' - 2xR`} has a pole at ${m`a`}; but ${m`1`} has none. So ${m`R`} is a polynomial.`),
        orders('Pole order at a (k = 2)', [['R′', 3], ['2xR', 2], ['1', 0]], 'order'),
      ]),
      el('div', {}, [
        p(`<strong>2. No polynomial.</strong> ${m`R = 0`} gives ${m`0 \ne 1`}. If ${m`R`} has degree ${m`d \ge 0`}, then ${m`2xR`} has degree ${m`d+1`} and ${m`R'`} degree ${m`d-1`}, so ${m`R' - 2xR`} has degree ${m`d+1 \ge 1`}; but ${m`1`} has degree ${m`0`}. ${m`\blacksquare`}`),
        orders('Degree (d = 2)', [['R′', 1], ['2xR', 3], ['1', 0]], 'degree'),
      ]),
    ]),
    p('In each diagram the orange bar is the term that nothing else can cancel.', 'small muted'),
    el('h3', { class: 'panel-title', text: 'So Φ and erf are not elementary' }),
    p(`If ${m`\Phi`} were elementary, so would be ${m`E(x) = \sqrt{2\pi}\,(\Phi(x) - \tfrac{1}{2}) = \int_0^x e^{-t^2/2}\,dt`}, and then ${m`E(\sqrt{2}\,u)/\sqrt{2}`}, whose derivative is ${m`e^{-u^2}`}: impossible. The same for ${m`\operatorname{erf}`}. ${evidenceHtml('T')}`),
    p(`It is a theorem of <em>impossibility</em>, like the unsolvability of the quintic by radicals (Abel–Ruffini, Galois): proved by studying the structure of the problem, not by failing to find a formula.`, 'small muted'),
  ]);
}

/* ---------- E11 · the checker ---------- */

function e11(page) {
  const pole = page.c !== 0 ? { c: page.c, a: page.a, k: page.k } : null;
  const r = residual(page.coeffs, pole);
  const Rtex = [polyTex(page.coeffs), pole ? `${page.c < 0 ? '-' : '+'} \\frac{${Math.abs(page.c)}}{${page.a === 0 ? 'x' : `(x ${page.a < 0 ? '+' : '-'} ${Math.abs(page.a)})`}${page.k === 1 ? '' : `^{${page.k}}`}}` : ''].filter((t) => t && t !== '0').join(' ') || '0';
  const ob = r.obstruction;
  const why = !ob ? `${m`R = 0`} gives ${m`R' - 2xR = 0`}, not 1.`
    : ob.kind === 'pole'
      ? `The pole of order <strong>${ob.order}</strong> at ${m`x = ${ob.at}`}, coefficient ${m`${ob.coeff}`}: it comes from ${m`R'`} alone, ${m`2xR`} reaches only order ${ob.order - 1}.`
      : `The term of degree <strong>${ob.degree}</strong>, coefficient ${m`${ob.coeff}`}: it comes from ${m`2xR`} alone, ${m`R'`} reaches only degree ${ob.degree - 2 < 0 ? '—' : ob.degree - 2}.`;
  return labPanel({
    hw: 'hw06', id: 'E11', title: 'E11 · Try to find an antiderivative', name: `E11-${page.raw}`,
    question: `Pick a rational ${m`R`}. Is ${m`R' - 2xR`} equal to 1? (If it were, ${m`R\,e^{-x^2}`} would be an antiderivative of ${m`e^{-x^2}`}.)`,
    steps: ['type a polynomial, and optionally one pole term, in the dock;', `the page computes ${m`R' - 2xR`} exactly, term by term;`, 'and names the term that cannot cancel.'],
    view: () => ({
      answer: { text: `Not 1: ${why}`, ok: false },
      body: [
        table(['', 'expression'], [
          [el('span', { html: m`R(x)` }), el('span', { html: m`${Rtex}` })],
          [el('span', { html: m`R'(x) - 2x\,R(x)` }), el('span', { html: m`${residualTex(r, page.a)}` })],
          ['needed', el('span', { html: m`1` })],
        ], 'prose words'),
        p('Try to make it work: add terms to cancel the leading one, and a new leading term appears, one degree higher (or one order deeper). That chase never ends — which is the proof.', 'small muted'),
      ],
      summary: { R: page.raw, pole, residual: residualTex(r, page.a), obstruction: ob },
    }),
    why: 'the impossibility is not a matter of cleverness: every candidate fails for the same structural reason, and the checker shows which term carries it.',
    notes: ['Only one pole term is allowed here, to keep the input short; with several poles each one fails on its own, by step 1 of the proof.'],
  });
}

/* ---------- what the name buys, and why numerics anyway ---------- */

function naming() {
  const e = Math.exp(1);
  return card('What naming erf achieves, and why numerics are needed anyway', [
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'The name' }),
        p(`<strong>Closure by extension.</strong> We adjoin ${m`\operatorname{erf}`} to the elementary functions, as ${m`\sqrt{-1}`} was adjoined to the reals to solve ${m`x^2 + 1 = 0`}. Then ${m`\Phi(x) = \tfrac{1}{2}\big(1 + \operatorname{erf}(x/\sqrt{2})\big)`} is an exact closed form in the larger class.`),
        p(`<strong>Knowledge attached to the name</strong>: series, a continued fraction, asymptotics, bounds, the differential equation ${m`y'' + 2x y' = 0`}. Proved once, reused in statistics, heat flow, diffusion, quantum mechanics (Nature page).`),
      ]),
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'The digits' }),
        p(`A name is not a value. To print digits, an algorithm with an error bound is needed (Normal CDF page). That holds for elementary functions too: ${m`e^x`}, ${m`\sin x`}, even ${m`\sqrt{x}`} are computed by range reduction and a polynomial. In this browser <code>Math.exp(1)</code> = ${e}, while ${m`e = 2.718281828459045235\ldots`}: a rounded approximation, as every ${m`\operatorname{erf}`} value is.`),
        p(`So <strong>elementary vs special is algebraic, not computational</strong>. The computational questions are: how many operations for a given accuracy, uniform in the tails, constant time, safe from underflow. JavaScript has no ${m`\operatorname{erf}`} at all; ${m`\operatorname{erfc}(3) = ${erfcHybrid(3).toPrecision(16)}`} here comes from hw06's own code.`),
      ]),
    ]),
    el('details', { class: 'explain' }, [
      el('summary', { text: 'A philosophical aside' }),
      p(`${evidenceHtml('O')} Is ${m`\Phi`} “less real” than ${m`e^x`}? The elementary functions are a historical accident, the ones named first, and Liouville shows that the class is not closed under the most natural operation of calculus, integration. One reading: having a closed form is a property of our vocabulary, not of the function — the same lesson as “every computer number is rational, yet we reason with reals”.`),
    ]),
  ]);
}

startPage({
  shell: hw06Shell('liouville.html'),
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
        question: 'Why is there no formula for Φ(x), the integral of the bell curve? And if erf is “exact”, why compute anything?',
        findings: [
          '<strong>It is a theorem, not a failure.</strong> By Liouville’s criterion, ∫e^(−x²) dx is elementary only if R′ − 2xR = 1 has a rational solution R; it has none, so Φ and erf are not elementary.',
          '<strong>The proof is two lines.</strong> A pole in R would get worse on the left side; a polynomial R would gain a degree. Try it yourself in E11: some term always remains.',
          '<strong>Naming erf</strong> adds knowledge (series, bounds, a differential equation), not digits. Digits always need an algorithm — for e^x and sin x too.',
        ],
        sections: [['def', 'Elementary functions'], ['crit', 'Liouville’s criterion'], ['proof', 'The proof'], ['E11', 'E11 · try an antiderivative'], ['naming', 'The name and the digits']],
      }),
      anchor('def', definitions()), anchor('crit', theorem()), anchor('proof', proof()), anchor('E11', e11(page)), anchor('naming', naming()),
    ];
  },
});
