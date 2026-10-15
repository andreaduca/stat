/* widgets.js — the small building blocks every hw02 page uses: the category
   badge (note 01's six kinds of operation), a hex value with copy and binary
   buttons and optional diff marks, and the frame of a pipeline step card. */

import { el, explain } from '../../../assets/js/ui/dom.js';

/** The six kinds of operation. Colour is never the only cue: icon + label too. */
export const CATEGORIES = {
  generation: { icon: '⚄', label: 'generation' },
  encoding:   { icon: '⇄', label: 'encoding + checksum' },
  derivation: { icon: '↘', label: 'derivation' },
  publickey:  { icon: '⊕', label: 'public-key' },
  hashing:    { icon: '#', label: 'hashing' },
  checksum:   { icon: '✓', label: 'checksum in encoding' },
  // used only on the timeline
  system:      { icon: '◇', label: 'system' },
  postquantum: { icon: '⊛', label: 'post-quantum' },
  failure:     { icon: '!', label: 'failure' },
};

export function badge(cat) {
  const c = CATEGORIES[cat];
  return el('span', { class: `cat ${cat}`, title: `category: ${c.label}` }, [el('i', { 'aria-hidden': 'true', text: c.icon }), c.label]);
}

/** Bits that differ between two equal-length hex strings. */
export function hexBitDistance(a, b) {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

const hexToBin = (hex) => [...hex].map((c) => parseInt(c, 16).toString(2).padStart(4, '0')).join('');

/* Characters grouped into runs of the same class, so a 128-char value with a
   few marks costs a handful of spans rather than 128. */
function markedText(text, classOf) {
  const runs = [];
  for (let i = 0; i < text.length; i++) {
    const cls = classOf(i) || '';
    if (runs.length && runs.at(-1).cls === cls) runs.at(-1).text += text[i];
    else runs.push({ cls, text: text[i] });
  }
  return runs.map((r) => (r.cls ? el('span', { class: r.cls, text: r.text }) : r.text));
}

export function copyButton(text) {
  const button = el('button', {
    type: 'button', text: 'copy', title: 'copy to the clipboard',
    onclick: async () => {
      try { await navigator.clipboard.writeText(text); button.textContent = 'copied'; } catch { button.textContent = 'blocked'; }
      setTimeout(() => { button.textContent = 'copy'; }, 1200);
    },
  });
  return button;
}

/**
 * A labelled hex value.
 * @param {string} label
 * @param {string} hex       the value, without 0x
 * @param {object} [o]
 * @param {string} [o.base]  reveal mode: the baseline value; differing characters turn red
 *                           and the number of changed bits is shown
 * @param {(i:number)=>string} [o.mark]  extra class per character (e.g. 'dim', 'keep')
 * @param {string} [o.prefix] shown before the value (e.g. '0x'), not copied twice
 */
export function hexValue(label, hex, { base = null, mark = null, prefix = '' } = {}) {
  const diff = base !== null && base !== undefined && base.length === hex.length;
  const classOf = (i) => [mark ? mark(i) : '', diff && base[i] !== hex[i] ? 'chg' : ''].join(' ').trim();
  const box = el('div', { class: 'hex' }, [prefix, ...markedText(hex, classOf)]);

  let binary = false;
  const toggle = el('button', {
    type: 'button', text: 'bin', title: 'show in binary',
    onclick: () => {
      binary = !binary;
      toggle.textContent = binary ? 'hex' : 'bin';
      box.replaceChildren(...(binary ? [hexToBin(hex)] : [prefix, ...markedText(hex, classOf)]));
    },
  });

  const bits = hex.length * 4;
  const changed = diff ? hexBitDistance(hex, base) : null;
  return el('div', { class: 'val' }, [
    el('div', { class: 'val-head' }, [
      el('span', { text: `${label} · ${bits} bits` }),
      copyButton(prefix + hex),
      toggle,
      diff ? el('span', { class: 'count', text: `${changed} of ${bits} bits changed` }) : null,
    ]),
    box,
  ]);
}

/**
 * The frame shared by the pipeline cards and the lab panels: number (optional),
 * title, badges, the operation as a formula, the content, a one-line reason,
 * the explainer.
 */
export function stepCard({ no = null, id = null, title, cats = [], formula, body, why, notes }) {
  return el('div', { class: 'card', id }, [
    el('div', { class: 'step-head' }, [
      no ? el('span', { class: 'step-no', text: no }) : null,
      el('h2', { text: title }),
      ...cats.map(badge),
    ]),
    formula ? el('p', { class: 'formula', html: formula }) : null,
    ...[].concat(body),
    why ? el('p', { class: no ? 'why' : 'why matters', html: why }) : null,
    notes ? explain(notes) : null,
  ]);
}

/** Facts list (label → value), the hw01 .facts style. */
export const facts = (rows) => el('ul', { class: 'facts' }, rows.filter(Boolean).map(([k, v]) =>
  el('li', {}, [el('span', { class: 'k', html: k }), el('span', { class: 'v', text: v })])));

/** "3.2 ms", "4 min", "1.1·10²⁵ years": a duration a person can read. */
export function humanTime(seconds) {
  if (seconds < 1) return `${(seconds * 1000).toPrecision(2)} ms`;
  if (seconds < 120) return `${seconds.toPrecision(2)} s`;
  if (seconds < 7200) return `${(seconds / 60).toPrecision(2)} min`;
  if (seconds < 172800) return `${(seconds / 3600).toPrecision(2)} h`;
  const years = seconds / 3.156e7;
  if (years < 1e4) return `${years.toPrecision(2)} years`;
  const exp = Math.floor(Math.log10(years));
  return `${(years / 10 ** exp).toFixed(1)}·10${String(exp).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])} years`;
}
