/* history-page.js — History & hashes: the timeline of the standards (from
   data/timeline.json), the two hash constructions drawn side by side, the
   SHA-2 vs Keccak/SHA-3 comparison, the padding demo, and a live
   length-extension attack showing the one practical difference. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { bytesToHex, utf8, concat } from '../core/bytes.js';
import { sha256, lengthExtend } from '../core/sha256.js';
import { loadData } from '../core/data.js';
import { stepCard, hexValue, badge, CATEGORIES } from './widgets.js';
import { spongePanel } from './hash-demo.js';
import { hw02Shell } from './shell.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, kids = []) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const kid of [].concat(kids)) node.append(kid);
  return node;
};
const text = (attrs, content) => { const t = svg('text', attrs); t.textContent = content; return t; };

/* ---------- timeline ---------- */

const yearOf = (date) => { const [y, m] = date.split('-').map(Number); return y + ((m || 1) - 0.5) / 12; };

function timelineSvg(events) {
  const W = 1000, from = 1974, to = 2028, axisY = 150;
  const X = (date) => 40 + ((yearOf(date) - from) / (to - from)) * (W - 80);
  const kids = [svg('line', { class: 'axis', x1: 30, y1: axisY, x2: W - 30, y2: axisY })];
  for (let y = 1980; y <= 2020; y += 10) {
    kids.push(svg('line', { class: 'tick', x1: X(`${y}-07`), y1: axisY, x2: X(`${y}-07`), y2: axisY + 6 }));
    kids.push(text({ class: 'year', x: X(`${y}-07`), y: axisY + 20, 'text-anchor': 'middle' }, String(y)));
  }

  /* labels: homework items above the axis, the rest below. A label starts at
     its dot, or ends there when it would run off the right edge; each takes
     the first row where its span overlaps no label already placed. */
  const rows = { up: [], down: [] };
  const placed = [...events].sort((a, b) => yearOf(a.date) - yearOf(b.date)).map((e) => {
    const x = X(e.date);
    const label = `${e.date.slice(0, 4)} ${e.name}`;
    const width = label.length * 6.6;
    const anchor = x + width > W - 10 ? 'end' : 'start';
    const span = anchor === 'end' ? [x - width - 4, x + 4] : [x - 4, x + width + 4];
    const side = e.homework ? 'up' : 'down';
    let row = rows[side].findIndex((taken) => taken.every(([a, b]) => span[1] < a || span[0] > b));
    if (row < 0) { row = rows[side].length; rows[side].push([]); }
    rows[side][row].push(span);
    return { e, x, label, side, row, anchor };
  });
  const depth = Math.max(rows.up.length, 1), below = Math.max(rows.down.length, 1);
  const top = 20 + depth * 22;                       // room above the axis
  const shift = top - (axisY - 30);

  // all leader lines first, then labels (whose halo hides the lines under them), then dots
  const leads = [], labels = [], dots = [];
  for (const { e, x, label, side, row, anchor } of placed) {
    const ly = side === 'up' ? axisY - 30 - row * 22 : axisY + 48 + row * 22;
    leads.push(svg('line', { class: 'lead', x1: x, y1: axisY, x2: x, y2: side === 'up' ? ly + 4 : ly - 13 }));
    labels.push(text({ class: `lbl${e.homework ? ' hw' : ''}`, x: anchor === 'end' ? x + 4 : x - 4, y: ly, 'text-anchor': anchor }, label));
    const dot = svg('circle', { class: `dot ${e.category}${e.homework ? ' hw' : ''}`, cx: x, cy: axisY, r: e.homework ? 7 : 5 });
    const tip = svg('title');
    tip.textContent = `${e.date.slice(0, 4)} · ${e.name} — ${e.role}`;
    dot.append(tip);                                  // native hover text: the one-line role
    dots.push(dot);
  }
  kids.push(...leads, ...labels, ...dots);
  const height = axisY + 48 + below * 22 + shift;
  const g = svg('g', { transform: `translate(0 ${shift})` }, kids);
  return svg('svg', { viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': 'Timeline of the standards, 1976 to 2026' }, [g]);
}

function timelinePanel(events) {
  const list = el('ol', { class: 'tl-list' }, events.map((e) => el('li', { class: e.homework ? 'hw' : null }, [
    el('span', { class: 'when', text: e.date.slice(0, 4) }),
    el('div', {}, [
      el('div', { class: 'what' }, [el('strong', { text: e.name }), ' ', badge(CATEGORIES[e.category] ? e.category : 'system'), e.homework ? el('span', { class: 'hwtag', text: 'in the homework' }) : null]),
      el('div', { class: 'small', text: e.role }),
      el('div', { class: 'small muted', text: e.source }),
    ]),
  ])));
  return stepCard({
    title: 'Timeline', cats: [],
    body: [
      el('div', { class: 'scroll-x' }, [el('div', { class: 'timeline' }, [timelineSvg(events)])]),
      el('p', { class: 'small muted', text: 'Above the axis, in colour: the items named in the homework. Hover a dot for its role. The same events, in order:' }),
      list,
    ],
    why: 'the mathematics is from the 1970s–80s, the hash functions from the 2000s; the wallet standards of 2012–2016 add engineering, not new cryptography.',
    notes: [
      'Read the gaps. Public-key cryptography (1976–1985) is a generation older than SHA-2 (2001), and the wallet standards all arrive within four years, 2012–2016, built from those existing pieces: BIP-32 from HMAC and the curve, BIP-39 from SHA-256 and PBKDF2, EIP-55 from Keccak.',
      'Two dates explain the Keccak/SHA-3 confusion: Keccak won the competition in October 2012, Ethereum fixed its protocol on the original Keccak, and only in August 2015 did FIPS 202 publish SHA-3 — with a different padding byte. Ethereum launched in July 2015, one month earlier.',
      'The last entry is a failure, not a standard: in 2026 Coldcard devices were found to have generated guessable seeds since 2021. Like most real losses, it happened in the engineering layer, not in the mathematics.',
    ],
  });
}

/* ---------- the two constructions ---------- */

function arrowDefs(id) {
  return svg('defs', {}, [svg('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, [
    svg('path', { class: 'tip', d: 'M0 0 L10 5 L0 10 z' }),
  ])]);
}
const arrow = (x1, y1, x2, y2, id) => svg('line', { class: 'flow', x1, y1, x2, y2, 'marker-end': `url(#${id})` });
const box = (x, y, w, h, cls, label, sub = '') => [
  svg('rect', { class: cls, x, y, width: w, height: h, rx: 6 }),
  text({ x: x + w / 2, y: y + h / 2 + (sub ? -2 : 4), 'text-anchor': 'middle', class: 'dg-t' }, label),
  sub ? text({ x: x + w / 2, y: y + h / 2 + 13, 'text-anchor': 'middle', class: 'dg-s' }, sub) : null,
].filter(Boolean);

function mdDiagram() {
  const id = 'arr-md';
  const kids = [arrowDefs(id)];
  kids.push(...box(4, 92, 90, 44, 'box', 'IV', '8 fixed words'));
  const xs = [140, 300, 460];
  ['block 1', 'block 2', 'block 3 + pad'].forEach((b, i) => {
    kids.push(...box(xs[i] - 10, 8, 100, 34, 'msg', b));
    kids.push(arrow(xs[i] + 40, 42, xs[i] + 40, 90, id));
    kids.push(...box(xs[i], 92, 80, 44, 'box', 'f', 'compress'));
    kids.push(arrow(i ? xs[i - 1] + 80 : 94, 114, xs[i] - 2, 114, id));
  });
  kids.push(arrow(540, 114, 588, 114, id));
  kids.push(...box(590, 92, 100, 44, 'out', 'hash', 'all 256 bits'));
  kids.push(text({ x: 350, y: 168, 'text-anchor': 'middle', class: 'dg-s' }, 'the chaining value passes through every block; the output is the whole of it'));
  return svg('svg', { viewBox: '0 0 700 180', role: 'img', 'aria-label': 'Merkle–Damgård chain' }, kids);
}

function spongeDiagram() {
  const id = 'arr-sp', ox = 120;               // left margin for the band labels
  const R = 86, C = 127;                        // y of the rate and capacity lines
  const kids = [arrowDefs(id)];
  const state = (x, label) => {
    kids.push(svg('rect', { class: 'rate', x: ox + x, y: 60, width: 26, height: 52, rx: 3 }));
    kids.push(svg('rect', { class: 'cap', x: ox + x, y: 112, width: 26, height: 30, rx: 3 }));
    if (label) kids.push(text({ x: ox + x + 13, y: 54, 'text-anchor': 'middle', class: 'dg-s' }, label));
  };
  const line = (x1, y, x2) => kids.push(arrow(ox + x1, y, ox + x2, y, id));

  kids.push(text({ x: ox - 8, y: R + 4, 'text-anchor': 'end', class: 'dg-s' }, 'rate r = 1088 bits'));
  kids.push(text({ x: ox - 8, y: C + 4, 'text-anchor': 'end', class: 'dg-s' }, 'capacity c = 512'));

  // two absorb steps: the block is XORed into the rate only; the capacity goes straight to f
  [[0, 'block 1'], [190, 'block 2 + pad']].forEach(([x0, label], i) => {
    state(x0, i === 0 ? 'all zeros' : '');
    kids.push(...box(ox + x0 + 32, 4, 76, 30, 'msg', label));
    kids.push(arrow(ox + x0 + 70, 34, ox + x0 + 70, 78, id));
    kids.push(text({ x: ox + x0 + 70, y: R + 6, 'text-anchor': 'middle', class: 'xor' }, '⊕'));
    line(x0 + 26, R, x0 + 62);
    line(x0 + 78, R, x0 + 108);
    line(x0 + 26, C, x0 + 108);
    kids.push(...box(ox + x0 + 110, 56, 44, 90, 'box', 'f'));
    line(x0 + 154, R, x0 + 188);
    line(x0 + 154, C, x0 + 188);
  });
  state(380, '');
  // squeeze: the output is read from the rate; the capacity is never shown
  line(406, R, 470);
  kids.push(...box(ox + 472, 64, 104, 44, 'out', 'hash', 'first 256 bits'));
  kids.push(text({ x: ox + 412, y: C + 4, class: 'dg-s' }, 'never output'));
  kids.push(text({ x: 350, y: 172, 'text-anchor': 'middle', class: 'dg-s' }, 'absorb: XOR each block into the rate, then permute the whole state · squeeze: read the rate'));
  return svg('svg', { viewBox: '0 0 700 182', role: 'img', 'aria-label': 'Sponge construction' }, kids);
}

function constructionsPanel() {
  return stepCard({
    title: 'Two ways to hash a long message', cats: ['hashing'],
    body: [
      el('h3', { text: 'Merkle–Damgård — SHA-256, SHA-512 (and MD5, SHA-1 before them)' }),
      el('div', { class: 'scroll-x' }, [el('div', { class: 'diagram' }, [mdDiagram()])]),
      el('h3', { text: 'Sponge — Keccak-256, SHA3-256' }),
      el('div', { class: 'scroll-x' }, [el('div', { class: 'diagram' }, [spongeDiagram()])]),
      el('div', { class: 'legend' }, [
        el('span', { html: '<i style="background:var(--dg-rate)"></i>rate: touched by input and output' }),
        el('span', { html: '<i style="background:var(--dg-cap)"></i>capacity: hidden, the security margin' }),
      ]),
    ],
    why: 'the two constructions behave differently in exactly one practical way — whether the hash can be resumed — and the pipeline uses both.',
    notes: [
      '<strong>Merkle–Damgård</strong> cuts the padded message into 64-byte blocks and folds each into a 256-bit chaining value with a compression function <span class="eq">f</span>. The final chaining value <em>is</em> the digest. The code is in <span class="eq">js/core/sha256.js</span>.',
      '<strong>The sponge</strong> keeps a 1600-bit state. Each block is XORed into the first <span class="eq">r</span> bits (the rate) and the whole state is scrambled by the permutation <span class="eq">f = Keccak-f[1600]</span>; the output is then read from the rate. The other <span class="eq">c = 512</span> bits (the capacity) are never written by input or shown in output, and the security level is <span class="eq">c/2 = 256</span> bits. The code is in <span class="eq">js/core/keccak.js</span>.',
      'The wallet uses both: SHA-256 for the BIP-39 checksum, SHA-512 inside HMAC and PBKDF2 for the seed and BIP-32; Keccak-256 for the address and EIP-55. Two unrelated designs means one cryptanalytic breakthrough does not take down every step.',
    ],
  });
}

/* ---------- comparison ---------- */

function comparisonPanel() {
  const rows = [
    ['designers, year', 'NSA; published by NIST in 2001 (FIPS 180-2)', 'Bertoni, Daemen, Peeters, Van Assche; won NIST’s competition in 2012; FIPS 202 in August 2015'],
    ['construction', 'Merkle–Damgård with a Davies–Meyer compression function', 'sponge over the Keccak-f[1600] permutation'],
    ['core operations', 'additions mod 2³² / 2⁶⁴, rotations, Boolean functions Ch and Maj', 'only XOR, AND, NOT and rotations on a 5×5×64-bit state'],
    ['length extension', 'vulnerable — the digest is the whole state (use HMAC)', 'immune — the capacity is never output'],
    ['security, 256-bit output', 'collision 2¹²⁸, preimage 2²⁵⁶', 'the same; sponge bound 2^(c/2) with c = 512'],
    ['status', 'unbroken; the workhorse of TLS, Bitcoin, BIP-39, BIP-32', 'unbroken; a structurally different backup'],
    ['in this wallet', 'SHA-256 checksum (BIP-39); SHA-512 in HMAC and PBKDF2', 'Keccak-256 for the address and EIP-55 (padding 0x01)'],
  ];
  return stepCard({
    title: 'SHA-2 versus Keccak / SHA-3', cats: ['hashing'],
    body: el('div', { class: 'scroll-x' }, [el('table', { class: 'data compare prose' }, [
      el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: '' }), el('th', { class: 'left', text: 'SHA-2 (SHA-256 / SHA-512)' }), el('th', { class: 'left', text: 'Keccak / SHA-3' })])]),
      el('tbody', {}, rows.map(([k, a, b]) => el('tr', {}, [el('td', { class: 'left muted', text: k }), el('td', { class: 'left', text: a }), el('td', { class: 'left', text: b })]))),
    ])]),
    why: 'after MD5 and SHA-1 fell (2004–2005), NIST wanted a standby built on different principles in case SHA-2 followed them. It has not.',
    notes: [
      'Same security targets, different structure: that is the whole point of SHA-3. It was never meant to replace SHA-2, only to be ready if SHA-2’s design lineage — shared with the broken MD5 and SHA-1 — turned out to be weak too.',
      'PRACTICE: Libraries often call Keccak-256 “sha3”. Check any implementation with the empty-string vector: <span class="eq">c5d24601…</span> is Ethereum’s Keccak-256, <span class="eq">a7ffc6f8…</span> is FIPS 202 SHA3-256.',
    ],
  });
}

/* ---------- length extension ---------- */

function extensionPanel() {
  const secret = utf8('server-secret-k3y');        // unknown to the attacker; only its length is
  const out = el('div');
  const draw = (message, suffix) => {
    const m = utf8(message), ext = utf8(suffix);
    const tag = sha256(concat(secret, m));                       // the naive MAC the server publishes
    const { glue, forged } = lengthExtend(tag, secret.length + m.length, ext);
    const forgedMessage = concat(m, glue, ext);
    const check = sha256(concat(secret, forgedMessage));          // what the server computes on receipt
    const ok = bytesToHex(check) === bytesToHex(forged);
    out.replaceChildren(
      hexValue('published tag = SHA-256(secret ‖ message)', bytesToHex(tag)),
      hexValue('glue = the padding the server’s hash appended (computable from the length alone)', bytesToHex(glue)),
      hexValue('forged tag, computed by resuming the chain from the published tag', bytesToHex(forged)),
      hexValue('server checks SHA-256(secret ‖ message ‖ glue ‖ suffix)', bytesToHex(check)),
      el('p', { class: ok ? 'err' : 'ok', html: ok
        ? '<strong>Forgery accepted.</strong> The attacker never saw the secret, yet produced a valid tag for a longer message.'
        : 'Forgery rejected.' }),
    );
  };
  const mIn = el('input', { class: 'wide', value: 'pay=10&to=alice', spellcheck: 'false', oninput: () => draw(mIn.value, sIn.value) });
  const sIn = el('input', { class: 'wide', value: '&pay=1000000&to=mallory', spellcheck: 'false', oninput: () => draw(mIn.value, sIn.value) });
  draw(mIn.value, sIn.value);

  return stepCard({
    title: 'Length extension, live', cats: ['hashing'],
    formula: 'SHA-256(secret ‖ m ‖ glue ‖ s) = continue the chain from SHA-256(secret ‖ m) over s — no secret needed',
    body: [
      el('div', { class: 'row' }, [field('message the server signed', mIn), field('suffix the attacker appends', sIn)]),
      el('p', { class: 'small muted', style: 'margin-top:10px', text: `The server’s secret is ${secret.length} bytes long; the attacker knows the length, not the bytes.` }),
      out,
    ],
    why: 'it is the one practical difference between the two constructions, and the reason BIP-32 uses HMAC rather than a bare hash.',
    notes: [
      'The digest of a Merkle–Damgård hash is its full chaining value. Whoever knows it can load it as the starting state and keep compressing: the result is the honest hash of the original message, its padding (the glue) and anything appended — without knowing the original message. The code is <span class="eq">lengthExtend()</span> in <span class="eq">js/core/sha256.js</span>.',
      'The sponge cannot be resumed: its output is 256 of 1600 state bits, and the 512-bit capacity never leaves the function. Keccak-256(secret ‖ m) is therefore a sound MAC, while SHA-256(secret ‖ m) is not.',
      'PRACTICE: This is why HMAC exists — <span class="eq">H(k ⊕ opad ‖ H(k ⊕ ipad ‖ m))</span> hides the inner state behind a second hash — and why BIP-32 and PBKDF2 use HMAC-SHA512 rather than SHA-512 of a key and a message. Real APIs (Flickr, 2009) were broken by exactly this forgery.',
    ],
  });
}

/* ---------- the page ---------- */

startPage({
  shell: hw02Shell('history.html'),
  render: async ({ state, update }) => {
    const events = await loadData('timeline');
    return [
      timelinePanel(events),
      constructionsPanel(),
      comparisonPanel(),
      spongePanel(state, update),
      extensionPanel(),
    ];
  },
});
