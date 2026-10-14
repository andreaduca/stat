/* visualiser-page.js — the group law, slowed down. Every entry of the trace
   produced by mul() is expanded into micro-steps (operands, the line, the
   third intersection, the reflection, the result) and shown on three linked
   panels: the F_p grid, the bits of k, and the arithmetic. */

import { el, fill, field, explain } from '../../../assets/js/ui/dom.js';
import { LatticeGrid, legend } from '../../../assets/js/ui/grid.js';
import { readParams, writeParams } from '../../../assets/js/ui/params.js';
import { curveFromParams } from '../core/curves.js';
import { curveOptions, rememberCurve, withRemembered } from './saved-curves.js';
import { curveInput } from './curve-input.js';
import { measure } from '../core/curve.js';
import { shell } from './shell.js';

shell('visualiser.html');

const app = document.getElementById('app');
const MAX_LOG = 200;
let state = withRemembered(readParams());
const savedExtra = () => curveOptions().filter((o) => o.saved);

/* micro-steps, by the kind of group operation being shown */
const PHASES = {
  normal:   ['operands', 'line', 'third', 'flip', 'result'],
  vertical: ['operands', 'line', 'result'],
  identity: ['result'],
};

const CAPTION = {
  operands: (t) => t.doubling
    ? 'One operand. P is added to itself, so the chord becomes the tangent to the curve at P.'
    : 'Two operands, P and Q. The construction needs the line through them.',
  line: (t) => t.special === 'vertical'
    ? 'x₁ = x₂ and y₁ = −y₂, so the line through the operands is vertical. It meets no third affine point.'
    : 'The same line y = λx + ν, drawn over F_p: one point for every x. It wraps around the grid, which is why a straight line looks scattered.',
  third: () => 'A cubic and a line meet in exactly three points. Two of them are the operands; this is the third one, R.',
  flip:  () => 'The sum is defined as −R, the reflection of R across y = p/2. Without that reflection the operation would not be associative, and this would not be a group.',
  result: (t) => t.special === 'vertical'
    ? 'The result is 𝒪, the identity. This is the one case with no coordinates to report — and the reason 𝒪 has to exist at all.'
    : t.special === 'identity'
      ? 'One operand is 𝒪, the identity, so the sum is simply the other operand. No arithmetic is needed.'
      : 'P + Q is again a point of the curve. That closure is what makes the set of points a group.',
};

let grid = null, frames = [], index = 0, timer = null, parts = {};

function update(changes) {
  state = { ...state, ...changes };
  for (const [k, v] of Object.entries(changes)) if (v === null) delete state[k];
  writeParams(changes);
  rememberCurve(state);
  stop();
  render();
}

const asBig = (value, fallback = 6n) => {
  try { const n = BigInt(String(value).trim()); return n < 0n ? -n : n; } catch { return fallback; }
};

const speed = () => Number(state.speed ?? 1) * 1000;

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  if (parts.play) parts.play.textContent = '▶ play';
}

function play() {
  if (timer) return stop();
  parts.play.textContent = '⏸ pause';
  timer = setInterval(() => {
    if (index >= frames.length - 1) { stop(); return; }
    show(index + 1);
  }, speed());
}

/* ---------- the three panels, updated per frame ---------- */

function show(next) {
  index = Math.max(0, Math.min(next, frames.length - 1));
  const frame = frames[index];
  if (!frame) return;
  const { t, phase } = frame;
  const c = parts.curve, F = c.F;

  /* grid */
  grid.clearMarks();
  const toXY = (P) => (P && !P.isInfinity ? { x: Number(P.x), y: Number(P.y) } : null);
  grid.mark([toXY(t.P), t.doubling ? null : toXY(t.Q)].filter(Boolean), 'operand');

  if (phase !== 'operands' && t.special !== 'identity') {
    if (t.special === 'vertical') {
      grid.segment({ x: Number(t.P.x), y: 0 }, { x: Number(t.P.x), y: Number(c.p) - 1 }, 'mirror');
    } else if (t.lambda !== null) {
      const line = [];
      for (let x = 0n; x < c.p; x++) line.push({ x: Number(x), y: Number(F.add(F.mul(t.lambda, x), t.nu)) });
      grid.mark(line, 'line');
      grid.mark([toXY(t.P), t.doubling ? null : toXY(t.Q)].filter(Boolean), 'operand');
    }
  }
  if (['third', 'flip'].includes(phase) && t.R3) {
    const marker = grid.mark([toXY(t.R3)], 'third')[0];
    if (phase === 'flip') grid.flip(marker, toXY(t.R3), toXY(t.result), Math.min(900, speed()));
  }
  if (phase === 'result' && t.result && !t.result.isInfinity) grid.mark([toXY(t.result)], 'result');

  /* key panel: which bit we are on, where the running multiple stands */
  parts.bits.replaceChildren(...[...parts.bitString].map((b, i) =>
    el('b', { class: [b === '1' ? 'on' : '', i === frame.bitIndex ? 'here' : ''].join(' ').trim(), text: b })));
  parts.status.textContent = `operation ${frame.opIndex + 1} of ${parts.trace.length} · ${t.op === 'D' ? 'doubling' : 'adding G'} · step ${PHASES[t.special ?? 'normal'].indexOf(phase) + 1} of ${PHASES[t.special ?? 'normal'].length}`;
  parts.running.textContent = `R = ${t.multipleBefore}G  →  ${t.multipleAfter}G = ${t.result}`;
  for (const [i, row] of parts.logRows.entries()) row.className = i === frame.opIndex ? 'is-current' : '';

  /* arithmetic panel: the same numbers, substituted */
  const reached = PHASES[t.special ?? 'normal'].indexOf(phase);
  const lines = [];
  const show3 = reached >= PHASES[t.special ?? 'normal'].indexOf('third');
  lines.push(['P', String(t.P)]);
  lines.push([t.doubling ? 'P (again)' : 'Q', String(t.Q)]);
  if (t.special === 'identity') lines.push(['result', `${t.result} — one operand was 𝒪`]);
  if (t.special === 'vertical') {
    if (reached >= 1) lines.push(['line', `x = ${t.P.x} (vertical: x₁ = x₂, y₁ = −y₂)`]);
    if (reached >= 2) lines.push(['result', '𝒪 — no third affine point exists on a vertical line']);
  }
  if (t.lambda !== null && reached >= 1) {
    const [num, den] = t.doubling
      ? [`3·${t.P.x}² + ${c.a} = ${F.add(F.mul(3n, F.mul(t.P.x, t.P.x)), c.a)}`, `2·${t.P.y} = ${t.inverse.of}`]
      : [`${t.Q.y} − ${t.P.y} = ${F.sub(t.Q.y, t.P.y)}`, `${t.Q.x} − ${t.P.x} = ${t.inverse.of}`];
    lines.push([t.doubling ? 'λ = (3x₁²+a)/(2y₁)' : 'λ = (y₂−y₁)/(x₂−x₁)', `numerator ${num},  denominator ${den}`]);
    lines.push([`${t.inverse.of}⁻¹ mod ${c.p}`, `${t.inverse.value}   (dividing means multiplying by this)`]);
    lines.push(['λ', String(t.lambda)]);
    lines.push(['ν = y₁ − λx₁', String(t.nu)]);
  }
  if (t.lambda !== null && show3) {
    lines.push(['x₃ = λ² − x₁ − x₂', `${t.lambda}² − ${t.P.x} − ${t.Q.x} = ${t.result.x}`]);
    lines.push(['y₃ = λ(x₁−x₃) − y₁', `${t.lambda}·(${t.P.x} − ${t.result.x}) − ${t.P.y} = ${t.result.y}`]);
    lines.push(['R (third intersection)', String(t.R3)]);
  }
  if (t.lambda !== null && reached >= PHASES.normal.indexOf('flip')) {
    lines.push(['−R = P + Q', `${t.result}   (y ↦ ${c.p} − y)`]);
  }
  parts.arith.replaceChildren(...lines.map(([k, v]) =>
    el('li', {}, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })])));

  parts.caption.textContent = CAPTION[phase](t);
  parts.progress.textContent = `micro-step ${index + 1} / ${frames.length}`;
}

/* ---------- static structure ---------- */

/** The controls this page adds under the shared curve card: which key to walk
 *  through, by which method, and the transport for stepping through it. */
function extraControls(c, base, k, method) {
  const kInput = el('input', { type: 'number', class: 'num', value: String(k), min: 1, onchange: (e) => update({ k: e.target.value }) });

  const methods = el('div', { class: 'radio-row' }, ['double-and-add', 'naive'].map((m) =>
    el('label', {}, [
      el('input', { type: 'radio', name: 'method', value: m, checked: m === method, onchange: () => update({ method: m }) }),
      m,
    ])));

  const slider = el('input', {
    type: 'range', min: 0.25, max: 4, step: 0.25, value: String(state.speed ?? 1),
    onchange: (e) => { state.speed = e.target.value; writeParams({ speed: e.target.value }); if (timer) { stop(); play(); } },
  });

  parts.play = el('button', { class: 'primary', text: '▶ play', onclick: play });
  parts.progress = el('span', { class: 'small muted' });

  return [
    el('div', { class: 'row' }, [
      field('private key k', kInput),
      field('method', methods),
      field('seconds per step', slider),
    ]),
    el('div', { class: 'row' }, [
      el('button', { text: '⏮', title: 'back to the start', onclick: () => { stop(); show(0); } }),
      el('button', { text: '◀ step', onclick: () => { stop(); show(index - 1); } }),
      parts.play,
      el('button', { text: 'step ▶', onclick: () => { stop(); show(index + 1); } }),
      parts.progress,
      el('span', { class: 'small muted', text: `${parts.trace.length} group operations to reach ${k}G` }),
    ]),
  ];
}

function gridPanel(c, base) {
  grid = new LatticeGrid({ modulus: c.p, onHover: (pt) => `(${pt.x}, ${pt.y})` });
  grid.setPoints(c.points().map((P) => ({ x: Number(P.x), y: Number(P.y) })));
  parts.caption = el('p', { class: 'small', style: 'min-height:3.2em' });

  return el('div', { class: 'card' }, [
    el('h2', { text: 'The group law on the grid' }),
    grid.element,
    legend([['point', 'curve point'], ['operand', 'operands P, Q'], ['line', 'the line y = λx + ν'], ['third', 'third intersection R'], ['result', 'the sum −R']]),
    parts.caption,
    explain([
      'Over the real numbers this construction is geometric: draw the line through two points of the curve, find where it crosses a third time, reflect. Over <span class="eq">F_p</span> the <em>same formulas</em> apply, but a “line” is now a set of grid points that wraps around the square — which is why it looks like confetti.',
      'The third intersection is guaranteed: substituting <span class="eq">y = λx + ν</span> into the curve gives a cubic in <span class="eq">x</span> whose three roots are exactly <span class="eq">x₁, x₂, x₃</span>. Hover any blue dot and you will find it is on the line but, except for three of them, not on the curve.',
    ]),
  ]);
}

function keyPanel(k, method, trace) {
  parts.bitString = k.toString(2);
  parts.bits = el('div', { class: 'bits' });
  parts.status = el('p', { class: 'small muted' });
  parts.running = el('p', { class: 'eq small' });

  parts.logRows = trace.slice(0, MAX_LOG).map((t, i) => el('tr', {}, [
    el('td', { class: 'left', text: i + 1 }),
    el('td', { text: t.op }),
    el('td', { text: `${t.multipleBefore}→${t.multipleAfter}` }),
    el('td', { text: String(t.result) }),
  ]));

  return el('div', { class: 'card' }, [
    el('h2', { text: 'The key being consumed' }),
    method === 'naive'
      ? el('p', { class: 'small muted', text: 'The naive method ignores the binary form of k: it just adds G once per unit.' })
      : el('div', {}, [el('p', { class: 'small muted', style: 'margin-bottom:6px', text: `k = ${k} in binary:` }), parts.bits]),
    parts.status,
    parts.running,
    el('div', { class: 'scroll-x', style: 'max-height:240px;overflow:auto' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: '#' }), el('th', { text: 'op' }), el('th', { text: 'multiple' }), el('th', { text: 'point' })])]),
        el('tbody', {}, parts.logRows),
      ]),
    ]),
    explain([
      'Double-and-add reads <span class="eq">k</span> from the left. A <span class="eq">D</span> doubles the running multiple; an <span class="eq">A</span> adds one more <span class="eq">G</span>. So the multiple column rebuilds <span class="eq">k</span> bit by bit — shift, then optionally set the low bit.',
      'Switch to the naive method and the same point is reached by a much longer road. Both are correct; only one scales.',
    ]),
  ]);
}

function arithPanel() {
  parts.arith = el('ul', { class: 'facts' });
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The arithmetic, mod p' }),
    parts.arith,
    explain([
      'Nothing here leaves <span class="eq">{0, …, p−1}</span>. The one step that is not school algebra is the division: there is no fraction in <span class="eq">F_p</span>, so <span class="eq">a/b</span> means <span class="eq">a · b⁻¹</span>, where <span class="eq">b⁻¹</span> is the number that multiplies <span class="eq">b</span> to 1. It exists for every <span class="eq">b ≠ 0</span> precisely because <span class="eq">p</span> is prime.',
      'Check one step by hand: take <span class="eq">λ</span>, square it, subtract the two input <span class="eq">x</span>, reduce mod <span class="eq">p</span>. The grid above and these numbers are two views of the same operation.',
      'PRACTICE: These few lines are the innermost loop of every signature a wallet makes. At 256 bits each one of them is a multi-word big-integer operation, and the inverse is by far the most expensive — which is why production libraries restructure the arithmetic to avoid it, and why they fix the number of operations in advance so that the duration of a signature reveals nothing about the key being used.',
    ]),
  ]);
}

/* ---------- render ---------- */

function render() {
  const { curve: c, base, presetId, error } = curveFromParams(state, savedExtra());
  if (error) {
    fill(app, [curveInput({ curve: null, base: null, presetId, error, state, update })]);
    return;
  }

  const k = asBig(state.k ?? 6) || 6n;
  const method = state.method === 'naive' ? 'naive' : 'double-and-add';
  const { trace } = measure(c, k, base, method);

  parts = { curve: c, trace };
  if (trace.length === 0) {
    fill(app, [el('div', { class: 'card' }, [
      el('p', { class: 'small', text: `k = ${k} needs no group operation at all: 1G is G itself. Try k = 6.` }),
      el('p', {}, [el('a', { href: 'visualiser.html?curve=' + (state.curve ?? 'C1') + '&k=6', text: 'Show k = 6 →' })]),
    ])]);
    return;
  }

  /* flatten the trace into micro-steps, remembering which bit of k drives each */
  frames = [];
  let bitIndex = 0, seen = '';
  trace.forEach((t, opIndex) => {
    if (method !== 'naive') {
      if (t.op === 'D') { seen += '0'; bitIndex = seen.length - 1; }
      else if (t.op === 'A') { seen = seen.slice(0, -1) + '1'; bitIndex = seen.length - 1; }
    } else bitIndex = -1;
    for (const phase of PHASES[t.special ?? 'normal']) frames.push({ t, phase, opIndex, bitIndex: bitIndex + 1 });
  });

  const gridCard = gridPanel(c, base);
  const keyCard = keyPanel(k, method, trace);
  const arithCard = arithPanel();
  fill(app, [
    curveInput({ curve: c, base, presetId, error: null, state, update, extras: extraControls(c, base, k, method) }),
    el('div', { class: 'cols wide-first' }, [gridCard, el('div', { class: 'stack' }, [keyCard, arithCard])]),
  ]);
  show(0);
}

render();
