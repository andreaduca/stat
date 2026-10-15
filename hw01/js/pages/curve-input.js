/* curve-input.js — the card every page of this homework opens with: pick a
   curve, edit its parameters and its base point, save it for the other pages.
   The host page supplies its own controls (k, method, speed) as extra rows.
   The values live in the URL and are remembered between pages. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { MAX_P, check, buildCurve } from '../core/curves.js';
import { Point } from '../../../assets/js/core/curve.js';
import { curveOptions, saveCurve, forgetCurve, selectionParams } from './saved-curves.js';

let flash = null;   // one-shot message, shown on the render after an action

const big = (value) => { try { return BigInt(String(value).trim()); } catch { return null; } };

/**
 * @param {object} o
 * @param {object|null} o.curve   the built curve, or null when the parameters are rejected
 * @param {object|null} o.base    the base point in use
 * @param {string} o.presetId     id of the curve in view ('custom' when unsaved)
 * @param {string|null} o.error   why the parameters were rejected
 * @param {Node[]} o.extras       page-specific control rows, placed underneath
 */
export function curveInput({ curve: c, base, presetId, error, state, update, extras = [] }) {
  const message = flash;
  flash = null;

  const options = curveOptions();
  const chosen = options.find((o) => o.id === presetId);
  const isSaved = chosen?.saved === true;
  const known = !!chosen;                       // a preset, or already saved

  const seed = (key, fallback) => state[key] ?? fallback;
  const number = (id, value, extra = {}) =>
    el('input', { type: 'number', class: 'num', id: `in-${id}`, value: String(value), ...extra });

  const select = el('select', { onchange: (e) => update(selectionParams(e.target.value)) }, [
    ...options.map((o) => el('option', { value: o.id, text: o.label, selected: o.id === presetId })),
    presetId === 'custom' ? el('option', { value: 'custom', text: 'custom · not saved', selected: true }) : null,
  ].filter(Boolean));

  const read = (id) => document.getElementById(`in-${id}`).value;

  /* Apply takes the curve and the base point together: a point that does not
     satisfy the new equation cannot be kept, so say so rather than drop it. */
  const apply = () => {
    const [p, a, b, gx, gy] = ['p', 'a', 'b', 'gx', 'gy'].map((id) => big(read(id)));
    let keepPoint = true;
    if (p !== null && a !== null && b !== null && !check({ p, a, b })) {
      const candidate = buildCurve({ p, a, b });
      const picked = gx === null || gy === null ? null : new Point(candidate.F.mod(gx), candidate.F.mod(gy));
      keepPoint = !!picked && candidate.contains(picked);
      if (!keepPoint) flash = `(${read('gx')}, ${read('gy')}) is not on this curve, so the first point of the curve was taken as G instead.`;
    }
    update({
      curve: null, p: read('p'), a: read('a'), b: read('b'),
      gx: keepPoint ? read('gx') : null,
      gy: keepPoint ? read('gy') : null,
    });
  };

  const store = () => {
    const { id, ok } = saveCurve({ p: c.p, a: c.a, b: c.b, base });
    flash = ok
      ? 'Saved. This curve is now in the list on every page of this homework.'
      : 'This browser refused to store it (private window, or site data blocked).';
    update(ok ? { curve: id } : {});
  };

  const drop = () => {
    forgetCurve(presetId);
    flash = 'Removed from the list.';
    update({ curve: 'C1', p: null, a: null, b: null, gx: null, gy: null });
  };

  const baseLine = c && base
    ? `G = ${base} is where counting starts: the private key k means "add G to itself k times". Type another point here, or click one straight off the plot on the curve page — the order of G fixes how many different keys exist.`
    : 'The base point G is where counting starts; every public key is a multiple of it.';

  return el('div', { class: 'card' }, [
    el('h2', { text: 'Curve and base point' }),

    el('div', { class: 'row' }, [
      field('curve', select),
      field('p', number('p', seed('p', c ? c.p : 17), { min: 5, max: String(MAX_P) })),
      field('a', number('a', seed('a', c ? c.a : 0), { min: 0 })),
      field('b', number('b', seed('b', c ? c.b : 7), { min: 0 })),
      el('div', { class: 'vrule' }),
      field('G.x', number('gx', seed('gx', base ? base.x : 0), { min: 0 })),
      field('G.y', number('gy', seed('gy', base ? base.y : 0), { min: 0 })),
      el('button', { class: 'primary', text: 'Apply', onclick: apply }),
      c && !known ? el('button', { text: 'Save curve', onclick: store }) : null,
      isSaved ? el('button', { text: 'Remove', onclick: drop }) : null,
    ]),

    ...extras,

    error ? el('p', { class: 'err', style: 'margin:14px 0 0', text: error }) : null,
    message ? el('p', { class: 'ok', style: 'margin:14px 0 0', text: message }) : null,

    el('p', { class: 'small muted', style: 'margin:14px 0 4px', text: chosen?.note ?? 'A curve of your own. Save it to keep it in the list on the other pages.' }),
    el('p', { class: 'small muted', style: 'margin:0', text: baseLine }),

    explain([
      '<strong>p</strong> is the size of the field: the arithmetic runs on the whole numbers <span class="eq">0 … p−1</span> and everything wraps around at <span class="eq">p</span>. It must be prime, because only then does every non-zero number have an inverse — and without inverses the slope <span class="eq">λ</span> of the chord cannot always be computed and the construction collapses. Raising <span class="eq">p</span> gives roughly <span class="eq">p</span> points (Hasse), so it is the single number that sets the difficulty.',
      '<strong>a</strong> and <strong>b</strong> choose the curve inside that field, through <span class="eq">y² = x³ + ax + b</span>. Any change to either redraws the whole point set, changes how many points there are, and changes every order. The one forbidden combination is <span class="eq">4a³ + 27b² = 0</span>: that is exactly when the curve has a cusp or crosses itself, the tangent at the bad point is undefined, and the group law breaks. Try <span class="eq">a = b = 0</span> and read the refusal.',
      '<strong>G.x</strong> and <strong>G.y</strong> are the base point. They do not change the curve at all — only the starting point of the walk. Pick a point whose order is small and the key space shrinks accordingly; pick a generator and every point on the curve becomes reachable. The point must satisfy the equation, so most pairs of numbers are not valid.',
      '<strong>Apply</strong> puts the typed values in the URL, so the configuration can be bookmarked. <strong>Save curve</strong> keeps one you built in this browser and adds it to the list on the other pages.',
      'PRACTICE: Nobody picks these numbers by hand in production. A curve is standardised once, published with its parameters and its point count, and then used unchanged by everyone — secp256k1 for Bitcoin and Ethereum, Curve25519 for Signal and modern SSH. The parameters are part of the protocol: two implementations that disagree about <span class="eq">p</span>, <span class="eq">a</span>, <span class="eq">b</span> or <span class="eq">G</span> do not interoperate at all.',
    ], 'What does each value change?'),

    explain([
      'The <strong>order</strong> of <span class="eq">G</span> is how many times it must be added to itself before landing on the identity <span class="eq">𝒪</span>. After that the multiples repeat, so a private key only ever matters modulo that number: <span class="eq">kG</span> and <span class="eq">(k + ord(G))G</span> are the same point. The multiples of <span class="eq">G</span> form a closed, finite cycle — a cyclic subgroup — and the key space is exactly that cycle.',
      'Lagrange\'s theorem forces <span class="eq">ord(G)</span> to divide the number of points on the curve, which is why the quotient shown in the facts is always a whole number. That quotient is the <em>cofactor</em>: it counts how many copies of the cycle would be needed to fill the curve, so anything above 1 means part of the curve is unreachable from <span class="eq">G</span>.',
      'PRACTICE: secp256k1 has cofactor 1 — its point count is itself prime, so every point except <span class="eq">𝒪</span> generates the whole group and no small subgroup exists to trap a key in. Curve25519 and Ed25519, used by Solana, Cardano, Signal and modern SSH, have cofactor 8, so their implementations must multiply by the cofactor or check the order explicitly; skipping that check is the <em>small-subgroup attack</em>, which has produced real vulnerabilities in key-exchange code. Validating a public key means checking exactly what this page shows: that the point is on the curve, that it is not <span class="eq">𝒪</span>, and that its order is the full group order.',
    ]),
  ]);
}
