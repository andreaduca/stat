/* keygen-page.js — computing Q = kG: the table of multiples, the toy public
   key, the operation counters for the two methods, the step-by-step trace,
   and the cost curve that shows why double-and-add is the one in real use. */

import { el, fill, field, explain, fmt } from '../../../assets/js/ui/dom.js';
import { lineChart, chartLegend } from '../../../assets/js/ui/linechart.js';
import { readParams, writeParams } from '../../../assets/js/ui/params.js';
import { curveFromParams } from '../core/curves.js';
import { curveOptions } from './saved-curves.js';
import { rememberCurve, withRemembered } from './saved-curves.js';
import { curveInput } from './curve-input.js';
import { measure } from '../core/curve.js';
import { shell } from './shell.js';

shell('keygen.html');

const app = document.getElementById('app');
const savedExtra = () => curveOptions().filter((o) => o.saved);
const MAX_ROWS = 1200;        // keep the DOM sane on the larger curves
const NAIVE_LIMIT = 20000n;   // beyond this, repeated addition is not worth running
let state = withRemembered(readParams());

function update(changes) {
  state = { ...state, ...changes };
  for (const [k, v] of Object.entries(changes)) if (v === null) delete state[k];
  writeParams(changes);
  rememberCurve(state);
  render();
}

const asBig = (value, fallback = 6n) => {
  try { const n = BigInt(String(value).trim()); return n < 0n ? -n : n; } catch { return fallback; }
};

/* ---------- panels ---------- */

/** The controls this page adds under the shared curve card. */
function extraControls(k, method) {
  const kInput = el('input', {
    type: 'number', class: 'num', value: String(k), min: 0, style: 'width:12ch',
    onchange: (e) => update({ k: e.target.value }),
  });

  const methods = el('div', { class: 'radio-row' }, ['double-and-add', 'naive'].map((m) =>
    el('label', {}, [
      el('input', { type: 'radio', name: 'method', value: m, checked: m === method, onchange: () => update({ method: m }) }),
      m === 'naive' ? 'naive (k−1 additions)' : 'double-and-add',
    ])));

  return el('div', { class: 'row' }, [field('private key k', kInput), field('method', methods)]);
}

function resultPanel(c, base, k, Q) {
  const ord = c.pointOrder(base);
  const reduced = k % ord;
  return el('div', { class: 'card' }, [
    el('div', { class: 'result' }, [
      el('div', { class: 'label', text: 'toy public key' }),
      el('div', { class: 'value', text: `Q = ${k}G = ${Q}` }),
    ]),
    el('ul', { class: 'facts', style: 'margin-top:14px' }, [
      el('li', {}, [el('span', { class: 'k', text: 'private key k' }), el('span', { class: 'v', text: fmt(k) })]),
      el('li', {}, [el('span', { class: 'k', text: 'ord(G)' }), el('span', { class: 'v', text: fmt(ord) })]),
      el('li', {}, [el('span', { class: 'k', text: 'k mod ord(G)' }), el('span', { class: 'v', text: fmt(reduced) })]),
    ]),
    el('p', { class: 'small', html: k >= ord
      ? `Because <span class="eq">${k} ≥ ord(G)</span>, this key is indistinguishable from <span class="eq">k = ${reduced}</span>: both give the same point. Only <span class="eq">k mod ord(G)</span> carries information.`
      : `Any <span class="eq">k</span> differing from this one by a multiple of <span class="eq">${ord}</span> would produce the same public key.` }),
    explain([
      'This is the whole of key generation. The private key is a number, the public key is a point, and the only thing standing between them is scalar multiplication. There is no secret ingredient and no stored table: given the same <span class="eq">k</span> and the same <span class="eq">G</span>, every machine in the world computes the same <span class="eq">Q</span>.',
      'The security claim is one of asymmetry, and it is worth stating precisely. Going forward costs about <span class="eq">1.5 log₂k</span> group operations — a few dozen here, a few hundred at 256 bits. Going backwards means solving the <em>discrete logarithm</em>: given <span class="eq">Q</span>, find the <span class="eq">k</span> with <span class="eq">kG = Q</span>. No method is known that exploits the structure of the group, so the best attacks are generic search: Pollard\'s rho finishes in about <span class="eq">√n</span> steps on a group of order <span class="eq">n</span>.',
      'PRACTICE: That square root is the whole reason keys are 256 bits. secp256k1 has <span class="eq">n ≈ 2²⁵⁶</span>, so <span class="eq">√n ≈ 2¹²⁸</span> operations — which is what people mean when they say a 256-bit curve gives 128-bit security. At <span class="eq">10¹²</span> operations per second that is on the order of <span class="eq">10¹⁹</span> years. On the curve above, <span class="eq">√n</span> is about four, so the same attack is a rounding error. The algorithm is identical in both cases; nothing but the size of the group protects a wallet.',
    ]),
  ]);
}

function countersPanel(c, base, k, naiveOps, fastOps) {
  const rows = [
    ['group operations (chord/tangent)', naiveOps?.group, fastOps.group],
    ['field inversions', naiveOps?.inv, fastOps.inv],
    ['field multiplications', naiveOps?.mul, fastOps.mul],
  ];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Cost of this computation' }),
    el('div', { class: 'scroll-x' }, [
      el('table', { class: 'data compare' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { class: 'left', text: '' }), el('th', { text: 'naive' }), el('th', { text: 'double-and-add' }),
        ])]),
        el('tbody', {}, rows.map(([label, a, b]) => el('tr', {}, [
          el('td', { class: 'left', text: label }),
          el('td', { text: a === undefined ? 'not run' : fmt(a) }),
          el('td', { text: fmt(b) }),
        ]))),
      ]),
    ]),
    naiveOps === null ? el('p', { class: 'small muted', text: `k is above ${NAIVE_LIMIT}, so the naive method was not run — it would need about k additions.` }) : null,
    explain([
      'Each chord or tangent step costs exactly one modular inversion, which is why the first two rows agree. Inversion is the expensive field operation, and avoiding it is what projective coordinates are for in a serious implementation.',
      'Naive addition needs <span class="eq">k − 1</span> steps. Double-and-add needs one doubling per bit of <span class="eq">k</span> plus one addition per 1-bit, so <span class="eq">⌊log₂k⌋ + popcount(k) − 1</span>. The counters above are measured, not predicted — they come from counting the real calls.',
      'PRACTICE: Inversion is the operation production code works hardest to avoid. At 256 bits a modular inverse costs on the order of a hundred multiplications, so libraries keep points in <em>projective</em> coordinates <span class="eq">(X, Y, Z)</span> standing for <span class="eq">(X/Z², Y/Z³)</span>, where adding two points needs no inversion at all; one inversion is paid at the very end to convert back. That single change is worth an order of magnitude in signing throughput, which is why the inversions are counted separately here.',
    ]),
  ]);
}

function costChart(c, base) {
  const ord = Number(c.pointOrder(base));
  const span = Math.min(ord, 1093);
  const stride = Math.max(1, Math.ceil(span / 150));
  const naive = [], fast = [];
  for (let k = 1; k <= span; k += stride) sample(k);
  if (naive.at(-1)[0] !== span) sample(span);

  function sample(k) {
    const bits = k.toString(2);
    naive.push([k, k - 1]);
    // one doubling per bit after the leading one, one addition per further 1-bit
    fast.push([k, (bits.length - 1) + (bits.split('1').length - 2)]);
  }
  const series = [
    { label: 'naive', color: 'var(--s2)', points: naive },
    { label: 'double-and-add', color: 'var(--s1)', points: fast },
  ];
  const last = [naive.at(-1)[1], fast.at(-1)[1]];

  return el('div', { class: 'card' }, [
    el('h2', { text: 'Group operations as k grows' }),
    lineChart({ series, xTitle: 'private key k', yTitle: 'group operations', tip: (x, vals) => `k = ${x}\nnaive: ${vals[0]}\ndouble-and-add: ${vals[1]}` }),
    chartLegend(series),
    el('p', { class: 'small muted', html: `At <span class="eq">k = ${span}</span> the two methods need <strong>${last[0]}</strong> and <strong>${last[1]}</strong> operations. The lower line is not flat at zero — it grows, just logarithmically.` }),
    explain([
      'One line grows like <span class="eq">k</span>, the other like <span class="eq">log k</span>. That gap is the entire reason public-key cryptography is usable: at 256 bits the naive route would need about <span class="eq">2²⁵⁶</span> additions, while double-and-add finishes in a few hundred.',
      'The lower line is jagged because its cost depends on the <em>bit pattern</em> of <span class="eq">k</span>, not only on its size: a key of 256 one-bits does nearly twice the work of a key of 256 zeros.',
      'PRACTICE: That jaggedness is a vulnerability, not a curiosity. The running time and the power drawn both depend on the bits of the secret, so an attacker who can measure either is measuring the key — this is a side-channel attack, and it has been used to extract keys from smartcards, phones and hardware wallets by someone holding the device. The defence is to make every bit cost the same: the Montgomery ladder performs one doubling and one addition per bit regardless of its value. Bitcoin\'s libsecp256k1 goes further and avoids secret-dependent branches and table lookups altogether, because even which cache line is touched can leak. The naive algorithm shown here is correct and completely unsafe to deploy.',
    ]),
  ]);
}

function multiplesPanel(c, base, k) {
  const ord = c.pointOrder(base);
  const wanted = k > ord + 2n ? k : ord + 2n;
  const limit = wanted > BigInt(MAX_ROWS) ? BigInt(MAX_ROWS) : wanted;

  const rows = [];
  let P = base;
  for (let m = 1n; m <= limit; m++) {
    const isIdentity = P.isInfinity;
    const note = m === k ? '← Q, the toy public key'
      : isIdentity ? '= 𝒪, the identity: we are back to the start'
      : m === ord + 1n ? '= G again: the cycle restarts here'
      : '';
    rows.push(el('tr', { class: [m === k ? 'is-current' : '', isIdentity ? 'is-identity' : '', m === ord + 1n ? 'cycle-restart' : ''].join(' ').trim() }, [
      el('td', { class: 'left', text: `${m}G` }),
      el('td', { text: isIdentity ? '𝒪' : String(P.x) }),
      el('td', { text: isIdentity ? '𝒪' : String(P.y) }),
      el('td', { class: 'left muted small', text: note }),
    ]));
    P = c.add(P, base);
  }

  return el('div', { class: 'card' }, [
    el('h2', { text: 'The multiples of G' }),
    el('div', { class: 'scroll-x tall' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { class: 'left', text: 'mG' }), el('th', { text: 'x' }), el('th', { text: 'y' }), el('th', { class: 'left', text: '' }),
        ])]),
        el('tbody', {}, rows),
      ]),
    ]),
    limit < wanted ? el('p', { class: 'small muted', text: `Showing the first ${MAX_ROWS} multiples; row ${k} is further down the same cycle, at position ${k % ord} of it.` }) : null,
    explain([
      'Reading down the table is the naive algorithm: each row is the previous one plus <span class="eq">G</span>. Row <span class="eq">k</span> is the public key.',
      'At row <span class="eq">ord(G)</span> the sum is <span class="eq">𝒪</span>, the identity, and the next row is <span class="eq">G</span> again. The multiples are periodic, so the list of reachable points is finite and closed: <span class="eq">⟨G⟩</span> is a cyclic subgroup of the curve.',
      'If <span class="eq">ord(G)</span> is smaller than the number of points on the curve, this table never visits the rest of them. That is why a real base point is chosen with a large prime order.',
      'PRACTICE: Because only <span class="eq">k mod ord(G)</span> matters, a private key is defined as a number in <span class="eq">[1, n − 1]</span> — and both ends matter. A wallet that generated <span class="eq">k = 0</span> would publish <span class="eq">𝒪</span> as its public key, and <span class="eq">k = n</span> is the same key as 0. The same reduction explains why the random nonce used in every ECDSA signature must also be a fresh number below <span class="eq">n</span>: reuse the nonce for two different messages and the private key falls straight out of the two signatures by simple algebra. That mistake has drained real wallets — most famously through a broken random number generator in an Android Bitcoin wallet in 2013.',
    ]),
  ]);
}

function tracePanel(c, k, method, trace) {
  const shown = trace.slice(0, 200);
  const bits = k.toString(2);

  return el('div', { class: 'card' }, [
    el('h2', { text: method === 'naive' ? 'Trace: repeated addition' : 'Trace: double-and-add' }),
    method === 'naive' ? null : el('div', {}, [
      el('p', { class: 'small muted', style: 'margin-bottom:6px', html: `k = ${k} in binary (the leading 1 is the starting point, the rest drive the loop):` }),
      el('div', { class: 'bits' }, [...bits].map((b, i) => el('b', { class: [b === '1' ? 'on' : '', i === 0 ? 'here' : ''].join(' ').trim(), text: b }))),
    ]),
    el('div', { class: 'scroll-x tall', style: 'margin-top:14px' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { class: 'left', text: '#' }), el('th', { text: 'op' }), el('th', { text: 'multiple' }),
          el('th', { text: 'λ' }), el('th', { text: 'result' }),
        ])]),
        el('tbody', {}, shown.map((t, i) => el('tr', {}, [
          el('td', { class: 'left', text: i + 1 }),
          el('td', { text: t.op === 'D' ? 'D (double)' : 'A (add G)' }),
          el('td', { text: `${t.multipleBefore} → ${t.multipleAfter}` }),
          el('td', { text: t.lambda === null ? '—' : String(t.lambda) }),
          el('td', { text: String(t.result) }),
        ]))),
      ]),
    ]),
    trace.length > shown.length ? el('p', { class: 'small muted', text: `${trace.length} operations in total; the first ${shown.length} are listed.` }) : null,
    trace.length === 0 ? el('p', { class: 'small muted', text: 'No operation needed: 1G is G itself, and 0G is the identity 𝒪.' }) : null,
    explain([
      '<span class="eq">D</span> doubles the running point, <span class="eq">A</span> adds <span class="eq">G</span> to it. Read the <em>multiple</em> column as a number being built up: doubling shifts it left, adding <span class="eq">G</span> sets the new low bit — which is exactly how the binary digits of <span class="eq">k</span> are consumed, left to right.',
      '<span class="eq">λ</span> is the slope used at that step, already reduced mod <span class="eq">p</span>. A dash marks a step with no slope at all: an operand was the identity, or the line was vertical. The Visualiser page shows one of these steps at a time, with the line drawn on the grid.',
    ]),
  ]);
}

/* ---------- render ---------- */

function render() {
  const { curve: c, base, presetId, error } = curveFromParams(state, savedExtra());
  const k = asBig(state.k ?? 6);
  const method = state.method === 'naive' ? 'naive' : 'double-and-add';
  const input = (extras) => curveInput({ curve: c ?? null, base: base ?? null, presetId, error: error ?? null, state, update, extras });

  if (error) { fill(app, [input([extraControls(k, method)])]); return; }

  const fast = measure(c, k, base, 'double-and-add');
  const naive = k <= NAIVE_LIMIT ? measure(c, k, base, 'naive') : null;
  const chosen = method === 'naive' && naive ? naive : fast;

  fill(app, [
    input([extraControls(k, method)]),
    el('div', { class: 'cols' }, [
      resultPanel(c, base, k, chosen.Q),
      countersPanel(c, base, k, naive ? naive.ops : null, fast.ops),
    ]),
    costChart(c, base),
    el('div', { class: 'cols' }, [multiplesPanel(c, base, k), tracePanel(c, k, method, chosen.trace)]),
  ]);
}

render();
