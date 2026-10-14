/* curve-page.js — the curve explorer: the shared input card, the scatter of
   every point, the facts about the curve and its base point, and the table of
   point orders. The inputs themselves live in curve-input.js, shared with the
   other pages. */

import { el, fill, explain, fmt } from '../../../assets/js/ui/dom.js';
import { LatticeGrid, legend } from '../../../assets/js/ui/grid.js';
import { readParams, writeParams } from '../../../assets/js/ui/params.js';
import { curveFromParams } from '../core/curves.js';
import { curveOptions, rememberCurve, withRemembered } from './saved-curves.js';
import { curveInput } from './curve-input.js';
import { Point } from '../core/curve.js';
import { divisors } from '../core/field.js';
import { shell } from './shell.js';

shell('curve.html');

const app = document.getElementById('app');
let state = withRemembered(readParams());

/* The curve object memoises points, #E and orders, so keep the same instance
   while the parameters do not change — re-picking a base point stays instant. */
let curve = null, curveKey = '';
const savedExtra = () => curveOptions().filter((o) => o.saved);
const histCache = new Map();
const orderCache = new Map();

function load() {
  const result = curveFromParams(state, savedExtra());
  if (result.error) return result;
  const key = `${result.curve.p}:${result.curve.a}:${result.curve.b}`;
  if (key === curveKey && curve) result.curve = curve;
  else { curveKey = key; curve = result.curve; }
  return result;
}

const ordOf = (c, P) => {
  const key = `${curveKey}:${P.x},${P.y}`;
  if (!orderCache.has(key)) orderCache.set(key, c.pointOrder(P));
  return orderCache.get(key);
};

const histOf = (c) => {
  if (!histCache.has(curveKey)) histCache.set(curveKey, c.orderHistogram());
  return histCache.get(curveKey);
};

function update(changes) {
  state = { ...state, ...changes };
  for (const [k, v] of Object.entries(changes)) if (v === null) delete state[k];
  writeParams(changes);
  rememberCurve(state);
  render();
}

/* ---------- panels ---------- */

function factsPanel(c, base) {
  const n = c.order();
  const h = c.hasse();
  const inside = Number(n) >= h.lo && Number(n) <= h.hi;
  const ord = base ? ordOf(c, base) : null;
  const generates = base ? ord === n : false;

  const rows = (items) => el('ul', { class: 'facts' }, items.map(([k, v]) =>
    el('li', {}, [el('span', { class: 'k', html: k }), el('span', { class: 'v', text: v })])));

  return el('div', { class: 'card' }, [
    el('h2', { text: 'Facts' }),

    el('h3', { text: 'The curve', style: 'margin-top:0' }),
    el('p', { class: 'eq', style: 'margin:0 0 8px' , text: c.equation }),
    rows([
      ['field size p', fmt(c.p)],
      ['4a³ + 27b² mod p', String(c.discriminant())],
      ['points #E (with 𝒪)', fmt(n)],
      ['Hasse: p+1 ± 2√p', `${fmt(h.lo)} … ${fmt(h.hi)}`],
      ['divisors of #E', divisors(n).join(' · ')],
    ]),
    el('p', { class: inside ? 'ok' : 'err', text: inside ? `#E = ${n} sits inside the Hasse interval, as it must.` : 'The count falls outside the Hasse bound — that would be a bug.' }),

    base ? el('h3', { text: 'The base point' }) : null,
    base ? rows([
      ['G', base.toString()],
      ['−G', c.neg(base).toString()],
      ['ord(G)', fmt(ord)],
      ['cofactor #E / ord(G)', fmt(n / ord)],
      ['keys reachable from G', `${fmt(ord)} of ${fmt(n)}`],
    ]) : null,
    base ? el('p', { class: 'small', html: generates
      ? '<span class="ok">ord(G) = #E</span>, so G generates the whole group: every point of the curve is some multiple of G, and the cofactor is 1 — the condition a real base point has to meet.'
      : `ord(G) = ${ord} is smaller than #E = ${n}, so the multiples of G reach only ${ord} of the ${n} points: a proper subgroup of index ${n / ord}. A curve used in production would never be set up this way.` }) : null,

    explain([
      '<span class="eq">#E</span> is counted directly: for every <span class="eq">x</span>, how many <span class="eq">y</span> solve <span class="eq">y² = x³ + ax + b</span>? Euler\'s criterion answers that without taking a square root — two solutions if the right-hand side is a non-zero square, one if it is zero, none otherwise. Add <span class="eq">1</span> for the identity <span class="eq">𝒪</span>.',
      'Hasse\'s theorem then says the total can only land within <span class="eq">2√p</span> of <span class="eq">p + 1</span>. A finite field of size <span class="eq">p</span> therefore always carries about <span class="eq">p</span> points — never far more, never far fewer. That is a strong statement: it means you cannot gain security by hunting for a curve with far more points than its field, and it is why the size of <span class="eq">p</span> alone fixes the scale of the problem.',
      'PRACTICE: <span class="eq">#E</span> is the size of the key space, because a private key is a number taken modulo the order of the base point. For secp256k1 that order is <span class="eq">n ≈ 1.158 × 10⁷⁷</span>, a 256-bit prime. Every Bitcoin and Ethereum private key that has ever existed is one of those <span class="eq">n − 1</span> values, and the reason two wallets have never collided is simply that the space is that large — not that anything coordinates them.',
    ]),
  ]);
}

function plotPanel(c, base) {
  const points = c.points();
  const grid = new LatticeGrid({
    modulus: c.p,
    onHover: (pt) => {
      const P = new Point(pt.x, pt.y);
      return `P  = (${P.x}, ${P.y})\n-P = (${P.x}, ${c.F.neg(P.y)})\nord(P) = ${ordOf(c, P)}`;
    },
    onPick: (pt) => update({ gx: String(pt.x), gy: String(pt.y) }),
  });
  grid.setPoints(points.map((P) => ({ x: Number(P.x), y: Number(P.y) })));
  if (base) grid.mark([{ x: Number(base.x), y: Number(base.y) }], 'base');

  return el('div', { class: 'card' }, [
    el('h2', { text: `All ${fmt(points.length)} affine points` }),
    grid.element,
    legend([['point', 'curve point'], ['operand', 'base point G'], ['axis', 'symmetry line y = p/2']]),
    el('p', { class: 'small muted', text: 'Hover a point for its order; click one to make it the base point.' }),
    explain([
      'Every dot is a pair <span class="eq">(x, y)</span> satisfying the curve equation mod <span class="eq">p</span>. Nothing connects them: over a finite field the “curve” <em>is</em> this finite set of grid sites, and the smooth shape only exists over the real numbers.',
      'The picture is symmetric about the dashed line <span class="eq">y = p/2</span>, because <span class="eq">y</span> and <span class="eq">p − y</span> square to the same value. Those mirrored partners are exactly <span class="eq">P</span> and <span class="eq">−P</span>, which is why columns hold two points or none — and one lone point where <span class="eq">y = 0</span>.',
      'Switch to C2 or C3 and the scatter stops looking organised. That apparent shapelessness is only apparent: the algebraic structure is still there, and the Visualiser shows it.',
      'PRACTICE: That mirror symmetry is why a secp256k1 public key fits in 33 bytes rather than 65. Only two points share any given <span class="eq">x</span>, and they differ solely in whether <span class="eq">y</span> is even or odd — and since <span class="eq">p</span> is odd, exactly one of <span class="eq">y</span> and <span class="eq">p − y</span> is even, so the parity is never ambiguous. A <em>compressed</em> public key is therefore one marker byte (<span class="eq">02</span> for even, <span class="eq">03</span> for odd) followed by the 32-byte <span class="eq">x</span>; the reader recovers <span class="eq">y</span> by solving <span class="eq">y² = x³ + 7</span> and taking the root with the right parity. Uncompressed keys spell out both coordinates and start with <span class="eq">04</span>. Bitcoin addresses derived from the two forms differ, which is a classic way to lose track of funds that are in fact still there.',
    ]),
  ]);
}

function ordersPanel(c) {
  const n = c.order();
  const hist = histOf(c);
  const maxOrder = [...hist.keys()].reduce((m, d) => (d > m ? d : m), 1n);
  const cyclic = maxOrder === n;

  return el('div', { class: 'card' }, [
    el('h2', { text: 'Orders of the points' }),
    el('div', { class: 'scroll-x tall' }, [
      el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { class: 'left', text: 'ord(P)' }),
          el('th', { text: 'how many points' }),
          el('th', { text: 'divides #E?' }),
        ])]),
        el('tbody', {}, [...hist].map(([ord, count]) => el('tr', {}, [
          el('td', { class: 'left', text: fmt(ord) }),
          el('td', { text: fmt(count) }),
          el('td', { text: n % ord === 0n ? 'yes' : 'NO — bug' }),
        ]))),
      ]),
    ]),
    el('p', { class: 'small', html: cyclic
      ? `The largest order is <span class="eq">${maxOrder}</span>, equal to <span class="eq">#E</span>: the group is <strong>cyclic</strong>, and the points of that order each generate all of it.`
      : `The largest order is <span class="eq">${maxOrder}</span>, strictly below <span class="eq">#E = ${n}</span>: <strong>no point generates the whole group</strong>, so this group is not cyclic. It is a product of two cyclic pieces.` }),
    explain([
      'Only divisors of <span class="eq">#E</span> can appear in this column — that is Lagrange\'s theorem, and it is also what makes computing an order cheap: test the divisors, not every number up to <span class="eq">#E</span>.',
      'A point whose order equals <span class="eq">#E</span> generates everything. When <span class="eq">#E</span> is prime that is every point except <span class="eq">𝒪</span>, which is the comfortable case cryptography picks.',
      'PRACTICE: When <span class="eq">#E</span> factors into small primes the curve is broken even though nothing about it looks wrong. Pohlig–Hellman solves the discrete logarithm separately inside each small subgroup — each of which is tiny enough to brute-force — and recombines the pieces with the Chinese remainder theorem, so the real difficulty is set by the <em>largest</em> prime factor of the order, not by its size. Select C3 to see a group that fails this test: 1029 points, but the largest order any point reaches is 147. This is the single most important reason curve parameters are standardised and published rather than improvised, and why a curve is always quoted together with its order and cofactor.',
    ]),
  ]);
}

/* ---------- render ---------- */

function render() {
  const { curve: c, base, presetId, error } = load();
  const input = curveInput({ curve: c ?? null, base: base ?? null, presetId, error: error ?? null, state, update });
  if (error) { fill(app, [input]); return; }
  fill(app, [
    input,
    el('div', { class: 'cols wide-first' }, [plotPanel(c, base), factsPanel(c, base)]),
    ordersPanel(c),
  ]);
}

render();
