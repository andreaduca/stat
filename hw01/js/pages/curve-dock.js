/* curve-dock.js — hw01's input dock (assets/js/ui/dock.js), the same on every
   page: pick a curve, edit p, a, b and the base point, save it for the other
   pages. A page adds its own controls (k, method, speed) as a section of its
   own underneath. The values live in the URL and are remembered between pages. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { inputDock, show, editing, onCommit } from '../../../assets/js/ui/dock.js';
import { MAX_P, check, buildCurve } from '../core/curves.js';
import { Point } from '../../../assets/js/core/curve.js';
import { curveOptions, saveCurve, forgetCurve, selectionParams } from './saved-curves.js';

let flash = null;   // one-shot message, shown on the render after an action
let now = null;     // the curve on screen, for the Save and Remove buttons

const big = (value) => { try { return BigInt(String(value).trim()); } catch { return null; } };

const CURVE = {
  id: 'curve',
  build(apply, later) {
    const select = el('select', { 'aria-label': 'curve', onchange: (e) => apply(selectionParams(e.target.value)) });
    const num = (label, attrs = {}) => el('input', { type: 'number', class: 'num', 'aria-label': label, min: 0, ...attrs });
    const inputs = { p: num('p', { min: 5, max: String(MAX_P) }), a: num('a'), b: num('b'), gx: num('G.x'), gy: num('G.y') };

    /* the curve and the base point apply together: a point that does not
       satisfy the new equation cannot be kept, so say so rather than drop it */
    const go = () => {
      const v = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
      const [p, a, b, gx, gy] = ['p', 'a', 'b', 'gx', 'gy'].map((k) => big(v[k]));
      let keepPoint = true;
      if (p !== null && a !== null && b !== null && !check({ p, a, b })) {
        const candidate = buildCurve({ p, a, b });
        const picked = gx === null || gy === null ? null : new Point(candidate.F.mod(gx), candidate.F.mod(gy));
        keepPoint = !!picked && candidate.contains(picked);
        if (!keepPoint) flash = { text: `(${v.gx}, ${v.gy}) is not on this curve, so the first point of the curve was taken as G instead.`, kind: 'ok' };
      }
      apply({ curve: null, p: v.p, a: v.a, b: v.b, gx: keepPoint ? v.gx : null, gy: keepPoint ? v.gy : null });
    };
    for (const input of Object.values(inputs)) onCommit(input, go, later);

    const store = () => {
      const { id, ok } = saveCurve({ p: now.curve.p, a: now.curve.a, b: now.curve.b, base: now.base });
      flash = ok
        ? { text: 'Saved. This curve is now in the list on every page of this homework.', kind: 'ok' }
        : { text: 'This browser refused to store it (private window, or site data blocked).', kind: 'err' };
      apply(ok ? { curve: id } : {});
    };
    const drop = () => {
      forgetCurve(now.presetId);
      flash = { text: 'Removed from the list.', kind: 'ok' };
      apply({ curve: 'C1', p: null, a: null, b: null, gx: null, gy: null });
    };
    const saveButton = el('button', { type: 'button', text: 'Save curve', onclick: store });
    const dropButton = el('button', { type: 'button', text: 'Remove', onclick: drop });
    const note = el('p', { class: 'small muted', style: 'margin:0' });

    return {
      nodes: [
        el('div', { class: 'row' }, [
          field('curve', select),
          field('p', inputs.p), field('a', inputs.a), field('b', inputs.b),
          el('div', { class: 'vrule' }),
          field('G.x', inputs.gx), field('G.y', inputs.gy),
          el('button', { type: 'button', class: 'primary', text: 'Apply', onclick: go }),
          saveButton, dropButton,
        ]),
        note,
      ],
      refresh(v) {
        now = v;
        const { curve: c, base, presetId, state } = v;
        const options = curveOptions();
        const chosen = options.find((o) => o.id === presetId);
        if (!editing(select)) {
          select.replaceChildren(...options.map((o) => el('option', { value: o.id, text: o.label, selected: o.id === presetId })),
            ...(presetId === 'custom' ? [el('option', { value: 'custom', text: 'custom · not saved', selected: true })] : []));
        }
        show(inputs.p, state.p ?? (c ? c.p : 17));
        show(inputs.a, state.a ?? (c ? c.a : 0));
        show(inputs.b, state.b ?? (c ? c.b : 7));
        show(inputs.gx, state.gx ?? (base ? base.x : 0));
        show(inputs.gy, state.gy ?? (base ? base.y : 0));
        saveButton.hidden = !(c && !chosen);
        dropButton.hidden = chosen?.saved !== true;
        note.textContent = chosen?.note ?? 'A curve of your own. Save it to keep it in the list on the other pages.';
      },
    };
  },
  summary: ({ curve: c, base, presetId }) => (c
    ? `${presetId} · y² = x³ + ${c.a}x + ${c.b} mod ${c.p} · G = ${base}`
    : `${presetId} · rejected`),
  notes: [
    '<strong>p</strong> is the size of the field: the arithmetic runs on the whole numbers <span class="eq">0 … p−1</span> and everything wraps around at <span class="eq">p</span>. It must be prime, because only then does every non-zero number have an inverse — and without inverses the slope <span class="eq">λ</span> of the chord cannot always be computed and the construction collapses. Raising <span class="eq">p</span> gives roughly <span class="eq">p</span> points (Hasse), so it is the single number that sets the difficulty.',
    '<strong>a</strong> and <strong>b</strong> choose the curve inside that field, through <span class="eq">y² = x³ + ax + b</span>. Any change to either redraws the whole point set, changes how many points there are, and changes every order. The one forbidden combination is <span class="eq">4a³ + 27b² = 0</span>: that is exactly when the curve has a cusp or crosses itself, the tangent at the bad point is undefined, and the group law breaks. Try <span class="eq">a = b = 0</span> and read the refusal.',
    '<strong>G.x</strong> and <strong>G.y</strong> are the base point <span class="eq">G</span>, where counting starts: the private key <span class="eq">k</span> means “add G to itself k times”. They do not change the curve at all — only the starting point of the walk. Pick a point whose order is small and the key space shrinks accordingly; pick a generator and every point on the curve becomes reachable. The point must satisfy the equation, so most pairs of numbers are not valid. On the curve page you can also click a point straight off the plot.',
    'A value applies when you leave its field or press Enter (<strong>Apply</strong> does it at once), and goes in the URL, so the configuration can be bookmarked. <strong>Save curve</strong> keeps one you built in this browser and adds it to the list on the other pages.',
    'The <strong>order</strong> of <span class="eq">G</span> is how many times it must be added to itself before landing on the identity <span class="eq">𝒪</span>. After that the multiples repeat, so a private key only ever matters modulo that number: <span class="eq">kG</span> and <span class="eq">(k + ord(G))G</span> are the same point. The multiples of <span class="eq">G</span> form a closed, finite cycle — a cyclic subgroup — and the key space is exactly that cycle.',
    'Lagrange\'s theorem forces <span class="eq">ord(G)</span> to divide the number of points on the curve, which is why the quotient shown in the facts is always a whole number. That quotient is the <em>cofactor</em>: it counts how many copies of the cycle would be needed to fill the curve, so anything above 1 means part of the curve is unreachable from <span class="eq">G</span>.',
    'PRACTICE: Nobody picks these numbers by hand in production. A curve is standardised once, published with its parameters and its point count, and then used unchanged by everyone — secp256k1 for Bitcoin and Ethereum, Curve25519 for Signal and modern SSH. The parameters are part of the protocol: two implementations that disagree about <span class="eq">p</span>, <span class="eq">a</span>, <span class="eq">b</span> or <span class="eq">G</span> do not interoperate at all.',
    'PRACTICE: secp256k1 has cofactor 1 — its point count is itself prime, so every point except <span class="eq">𝒪</span> generates the whole group and no small subgroup exists to trap a key in. Curve25519 and Ed25519, used by Solana, Cardano, Signal and modern SSH, have cofactor 8, so their implementations must multiply by the cofactor or check the order explicitly; skipping that check is the <em>small-subgroup attack</em>, which has produced real vulnerabilities in key-exchange code. Validating a public key means checking exactly what this page shows: that the point is on the curve, that it is not <span class="eq">𝒪</span>, and that its order is the full group order.',
  ],
};

/**
 * The dock, mounted or refreshed. Returns null: it takes no place in the page.
 * @param {object} o
 * @param {object|null} o.curve   the built curve, or null when the parameters are rejected
 * @param {object|null} o.base    the base point in use
 * @param {string} o.presetId     id of the curve in view ('custom' when unsaved)
 * @param {string|null} o.error   why the parameters were rejected
 * @param {object|null} [o.page]  the page's own section (see assets/js/ui/dock.js)
 * @param {any} [o.pageValue]     what that section shows
 */
export function curveDock({ curve, base, presetId, error, state, update, page = null, pageValue = null }) {
  const message = error ? { text: error, kind: 'err' } : flash;
  flash = null;
  return inputDock({
    id: 'hw01', title: 'Curve', update, message,
    sections: page ? [CURVE, page] : [CURVE],
    values: { curve: { curve, base, presetId, state }, ...(page ? { [page.id]: pageValue } : {}) },
  });
}

/** What a page shows while its curve is rejected: the reason is in the dock too. */
export const rejected = (error) => el('div', { class: 'card' }, [
  el('h2', { text: 'This curve is rejected' }),
  el('p', { class: 'err', text: error }),
  el('p', { class: 'small muted', text: 'Change p, a or b in the inputs at the bottom of the window, or pick a curve from the list.' }),
]);
