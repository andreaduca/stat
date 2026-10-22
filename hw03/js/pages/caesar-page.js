/* caesar-page.js — the Caesar page: encrypt and decrypt the shared message
   with two sliding alphabet strips, then what survives encryption — the
   letter histogram (shifted), the permutation-invariant statistics (IC,
   entropy, sorted profile), repeats, word lengths — and the English model
   the attack will use. The maths is in ../core/caesar.js. */

import { el, explain, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import {
  ALPHABET, KEYS, shift, encrypt, decrypt, normalise, letterCounts, frequencies,
  indexOfCoincidence, letterEntropy, sortedProfile, chiSquaredDistance,
} from '../core/caesar.js';
import { loadModel } from '../core/data.js';
import { facts, chart } from './widgets.js';
import { hw03Shell, STICKY, MEMORY } from './shell.js';

const DEFAULT_MSG = 'ATTACK AT DAWN';
const pct = (p, d = 1) => `${(100 * p).toFixed(d)} %`;
const isLetter = (ch) => /^[A-Za-z]$/.test(ch);
const idx = (ch) => ch.toUpperCase().charCodeAt(0) - 65;
const readK = (v) => { const k = Number.parseInt(v, 10); return Number.isFinite(k) ? ((k % 26) + 26) % 26 : 3; };

/* ---------- input card ---------- */

function inputCard({ msg, k }, model, update, onKey) {
  const text = el('textarea', { id: 'in-msg', rows: 3, spellcheck: 'false' }, [msg]);
  const out = el('span', { class: 'eq', text: keyLabel(k) });
  const slider = el('input', {
    id: 'in-k', type: 'range', min: 0, max: 25, step: 1, value: String(k), 'aria-label': 'key k',
    // a drag must not rebuild the card it is in: only the panels below are redrawn
    oninput: (e) => { const v = readK(e.target.value); out.textContent = keyLabel(v); onKey(v); },
  });
  const set = (m) => update({ msg: m });
  return el('div', { class: 'card' }, [
    field('message', text),
    el('div', { class: 'row', style: 'margin-top:10px' }, [
      el('button', { class: 'primary', type: 'button', text: 'Encrypt', onclick: () => set(text.value) }),
      el('button', { type: 'button', text: `“${DEFAULT_MSG}”`, onclick: () => set(DEFAULT_MSG) }),
      el('button', { type: 'button', text: `A paragraph of ${model.sample.source.split(', ')[1]} (${normalise(model.sample.text).length} letters)`, onclick: () => set(model.sample.text) }),
      el('div', { class: 'vrule' }),
      field('key k', slider),
      out,
    ]),
    el('p', { class: 'small muted', style: 'margin:10px 0 0', text:
      'The message is shared with the Toy ECC page, so both ciphers encrypt the same text; the paragraph is long enough for the histograms to take shape. ' +
      'The key is the shift: drag it and watch every panel below follow.' }),
  ]);
}

const keyLabel = (k) => `k = ${k} (A → ${ALPHABET[k]})`;

/* ---------- 1. the cipher ---------- */

function cipherPanel(msg, k) {
  const ct = encrypt(msg, k);
  const back = decrypt(ct, k);
  const first = [...msg].findIndex(isLetter);
  let sel = first;
  const host = el('div');

  const letters = [...msg].map((c, i) => (isLetter(c) ? i : -1)).filter((i) => i >= 0);
  const step = (e, cls) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const at = letters.indexOf(sel), next = letters[Math.min(letters.length - 1, Math.max(0, at + d))];
    if (next === undefined) return;
    sel = next; draw();
    host.querySelector(`.chars.${cls} button[data-i="${sel}"]`)?.focus();
  };

  const draw = () => {
    const ch = sel >= 0 ? msg[sel] : null;
    const col = ch && isLetter(ch) ? idx(ch) : -1;
    const used = new Set([...msg].filter(isLetter).map(idx));
    const strip = (label, letters) => [
      el('div', { class: 'strip-label', text: label }),
      ...[...letters].map((L, i) => el('div', { class: ['cell', i === col ? 'sel' : '', used.has(i) ? 'used' : ''].join(' ').trim(), text: L })),
    ];
    // one nowrap span per word, so a line never breaks inside a word; indices are UTF-16, like msg[sel]
    const chars = (text, cls) => {
      const nodes = [];
      let at = 0;
      for (const part of text.split(/(\s+)/)) {
        const start = at;
        at += part.length;
        if (!part) continue;
        if (/^\s+$/.test(part)) { nodes.push(' '); continue; }
        nodes.push(el('span', { class: 'w' }, part.split('').map((c, j) => (isLetter(c)
          ? el('button', {
            type: 'button', class: start + j === sel ? 'on' : null, text: c, title: 'show this letter on the strips',
            // one tab stop for the whole text; ← → move between letters (a 400-letter text is not 400 tab stops)
            tabindex: start + j === sel ? 0 : -1, 'data-i': start + j,
            onclick: () => { sel = start + j; draw(); },
            onkeydown: (e) => step(e, cls),
          })
          : c))));
      }
      return el('div', { class: `chars ${cls}` }, nodes);
    };
    const m = col, c = (col + k) % 26;
    host.replaceChildren(
      el('div', { class: 'scroll-x' }, [el('div', { class: 'strips', role: 'img', 'aria-label': `plain alphabet above, cipher alphabet shifted by ${k} below` }, [
        ...strip('plain', ALPHABET), ...strip('cipher', shift(ALPHABET, k)),
      ])]),
      el('p', { class: 'tagline', text: 'plaintext — click a letter to follow it (or Tab here, then ← →)' }), chars(msg, 'plain'),
      el('p', { class: 'tagline', text: 'ciphertext' }), chars(ct, 'cipher'),
      col >= 0 ? el('p', { class: 'formula', style: 'margin-top:10px', text:
        `${ALPHABET[m]} = ${m}  →  ${m} + ${k} = ${m + k}${m + k >= 26 ? ` ≡ ${c}` : ''} (mod 26)  →  ${ALPHABET[c]}      and back: ${c} − ${k} ≡ ${m} → ${ALPHABET[m]}` }) : null,
    );
  };
  draw();

  return el('div', { class: 'card' }, [
    el('h2', { text: 'Encrypt and decrypt' }),
    el('p', { class: 'formula', html: 'Enc: c<sub>i</sub> = (m<sub>i</sub> + k) mod 26 &nbsp;&nbsp; Dec: m<sub>i</sub> = (c<sub>i</sub> − k) mod 26 &nbsp;&nbsp; A = 0, …, Z = 25' }),
    host,
    el('div', { class: 'result', style: 'margin-top:12px' }, [
      el('div', { class: 'label', text: `decrypted with k = ${k}` }),
      el('div', { class: 'value prose', text: back || '(empty)' }),
    ]),
    el('p', { class: back === msg ? 'ok' : 'err', style: 'margin-top:6px', text: back === msg ? '✔ identical to the message' : '✘ differs from the message' }),
    facts([
      ['key space', `${KEYS} keys = log₂26 ≈ ${Math.log2(26).toFixed(2)} bits (k = 0 changes nothing)`],
      ['the same key is used for', 'every letter of every message'],
      ['for comparison, the toy ECC key', '2²⁰ ≈ 10⁶ keys by default; the real one ≈ 2²⁵⁶'],
    ]),
    explain([
      'Caesar adds the key in the group ℤ₂₆, exactly as ElGamal adds a mask in the curve group — but here the mask is one number between 0 and 25, and it is reused for every letter. Bold letters on the strips are the ones your message uses.',
      'Only letters A–Z are shifted; case is kept and spaces, digits, punctuation and accented letters pass through unchanged. That is a choice, and it leaks: the word boundaries are visible in the ciphertext (see “What else survives” below).',
      'For one letter with a uniformly random key, Caesar is a one-time pad: every ciphertext letter is equally likely. It stops being secure the moment the same key is used for a second letter.',
    ]),
  ]);
}

/* ---------- 2. histograms ---------- */

function histogramPanel(msg, k, model) {
  const letters = normalise(msg);
  const p = frequencies(letterCounts(letters)).map((x) => 100 * x);
  const c = frequencies(letterCounts(normalise(encrypt(msg, k)))).map((x) => 100 * x);
  const english = model.train.freq.map((x) => 100 * x);
  const opts = (values, label) => ({
    categories: [...ALPHABET], series: [{ label, color: 'var(--s1)', values }],
    overlay: { label: 'English (training books)', color: 'var(--s2)', values: english, dots: true },
    yTitle: '% of letters', height: 210,
  });
  const top = sortedProfile(letterCounts(letters))[0];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Letter histograms: the same shape, shifted' }),
    el('p', { class: 'formula', html: 'P<sub>cipher</sub>(ℓ) = P<sub>plain</sub>(ℓ − k mod 26)' }),
    letters.length < 100 ? el('p', { class: 'notice', text: `Only ${letters.length} letters: the bars are mostly noise. Load the paragraph above to see the shape of English.` }) : null,
    el('div', { class: 'cols' }, [
      el('div', {}, [el('h3', { text: 'plaintext' }), chart(opts(p, 'plaintext letters'))]),
      el('div', {}, [el('h3', { text: `ciphertext, k = ${k}` }), chart(opts(c, 'ciphertext letters'))]),
    ]),
    top && top.count ? el('p', { class: 'small muted', text: `The most common plaintext letter, ${top.letter} (${pct(top.p)}), is the most common ciphertext letter ${ALPHABET[(idx(top.letter) + k) % 26]}: every bar has moved ${k} places to the right, wrapping round from Z to A.` }) : null,
    explain([
      'Encryption permutes the bars and changes none of their heights: the ciphertext histogram is the plaintext histogram rotated by k. The orange dots are English, counted over four training books; the plaintext bars sit on them, the ciphertext bars sit on the dots shifted by k.',
      'This is the whole statistical attack in one picture: slide the dots until they match the bars. The Break Caesar page will do it automatically and measure how many letters it needs.',
      'PRACTICE: The Toy ECC page’s ciphertext histogram is flat — about 8 bits per byte — whatever the message. That is the difference between a cipher that hides the statistics of the language and one that only relabels them.',
    ]),
  ]);
}

/* ---------- 3. invariants ---------- */

function invariantsPanel(msg, k, model) {
  const pc = letterCounts(normalise(msg));
  const cc = letterCounts(normalise(encrypt(msg, k)));
  const n = pc.reduce((s, x) => s + x, 0);
  const prof = (counts) => sortedProfile(counts).slice(0, 5).filter((x) => x.count).map((x) => `${x.letter} ${(100 * x.p).toFixed(0)}`).join(' ') || '—';
  const num = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const row = (name, plain, cipher, english, same) => el('tr', {}, [
    el('td', { class: 'left', html: name }), el('td', { text: plain }), el('td', { text: cipher }), el('td', { text: english }),
    el('td', { class: same ? 'same' : 'diff', text: same ? '✔ unchanged' : '✘ changes with k' }),
  ]);
  const chiP = chiSquaredDistance(pc, model.train.freq), chiC = chiSquaredDistance(cc, model.train.freq);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'What encryption does not change' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data invariants' }, [
      el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: 'statistic' }), el('th', { text: 'plaintext' }), el('th', { text: `ciphertext, k = ${k}` }), el('th', { text: 'English' }), el('th', { class: 'left', text: '' })])]),
      el('tbody', {}, [
        row('letters N', String(n), String(n), String(model.train.letters), true),
        row('index of coincidence<br><span class="eq small">Σ O(O−1) / N(N−1)</span>', num(indexOfCoincidence(pc), 4), num(indexOfCoincidence(cc), 4), model.train.ic.toFixed(4), true),
        row('entropy, bits/letter<br><span class="eq small">−Σ p log₂ p</span>', num(letterEntropy(pc), 3), num(letterEntropy(cc), 3), model.train.entropy.toFixed(3), true),
        row('five most common letters, %', prof(pc), prof(cc), prof(model.train.counts), false),
        row('…their frequencies, sorted, %', sortedFreqs(pc), sortedFreqs(cc), sortedFreqs(model.train.counts), true),
        row('χ² distance to English', n ? chiP.toFixed(1) : '—', n ? chiC.toFixed(1) : '—', '0', k === 0),
      ]),
    ])]),
    el('p', { class: 'small muted', style: 'margin-top:8px', text: `For reference, uniformly random letters would give IC = 1/26 ≈ 0.0385 and entropy log₂26 ≈ 4.700 bits per letter.` }),
    explain([
      'The index of coincidence (the chance that two letters picked at random from the text are equal), the entropy of the letter distribution and the sorted list of frequencies depend only on <em>how many</em> times each letter occurs, not on <em>which</em> letter it is. A shift only relabels the letters, so these numbers are identical for plaintext and ciphertext — for any key, and for any monoalphabetic substitution, not just Caesar.',
      'So an attacker who sees only the ciphertext already knows the IC of the plaintext: about 0.066 says “a natural language encrypted letter by letter”, about 0.038 would say “close to random”. That is how a Caesar or substitution ciphertext is recognised before it is broken.',
      'The χ² distance is different: it compares each letter with <em>its own</em> English frequency, so it is small for the plaintext and large for a shifted text. Computing it for all 26 shifts and taking the smallest is the frequency-analysis attack.',
    ]),
  ]);
}

const sortedFreqs = (counts) => sortedProfile(counts).slice(0, 5).filter((x) => x.count).map((x) => (100 * x.p).toFixed(0)).join(' ') || '—';

/* ---------- 4. what else survives ---------- */

function structurePanel(msg, k) {
  const ct = encrypt(msg, k);
  const words = msg.split(/[^A-Za-z]+/).filter(Boolean);
  const cwords = ct.split(/[^A-Za-z]+/).filter(Boolean);
  const tally = new Map();
  words.forEach((w, i) => { const key = w.toUpperCase(); if (w.length > 1) tally.set(key, { n: (tally.get(key)?.n ?? 0) + 1, c: cwords[i].toUpperCase() }); });
  const repeats = [...tally].filter(([, v]) => v.n > 1).sort((x, y) => y[1].n - x[1].n).slice(0, 6);
  const doubles = [...new Set((msg.toUpperCase().match(/([A-Z])\1/g) ?? []))].slice(0, 6);
  const ones = [...new Set(cwords.filter((w) => w.length === 1).map((w) => w.toUpperCase()))];
  const lengths = words.slice(0, 16).map((w) => w.length).join(' ');

  // flip the first letter of the message to its successor: exactly one ciphertext letter moves
  const at = [...msg].findIndex(isLetter);
  const msg2 = at < 0 ? msg : msg.slice(0, at) + shift(msg[at], 1) + msg.slice(at + 1);
  const ct2 = encrypt(msg2, k);
  const changed = [...ct].filter((c, i) => c !== ct2[i]).length;

  return el('div', { class: 'card' }, [
    el('h2', { text: 'What else survives' }),
    facts([
      ['repeated words → repeated ciphertext words', repeats.length ? repeats.map(([w, v]) => `${w} → ${v.c} (×${v.n})`).join(', ') : 'none in this message'],
      ['double letters stay double', doubles.length ? doubles.map((d) => `${d} → ${shift(d, k)}`).join(', ') : 'none in this message'],
      ['word lengths (visible in the ciphertext)', lengths ? `${lengths}${words.length > 16 ? ' …' : ''}` : '—'],
      ['one-letter ciphertext words', ones.length ? ones.map((c) => `${c}: so k = ${(idx(c) + 26) % 26} if it is “A”, ${(idx(c) - 8 + 26) % 26} if it is “I”`).join('; ') : 'none in this message'],
      ['change the first letter of the message', at < 0 ? '—' : `${msg[at]} → ${msg2[at]}: ${changed} ciphertext character${changed === 1 ? '' : 's'} change${changed === 1 ? 's' : ''}`],
    ]),
    explain([
      'Caesar is deterministic: the same letter always gives the same letter and the same word always gives the same word, so repeats and double letters pass straight through. A public-key scheme cannot be deterministic — on the Toy ECC page the same message gives a new ciphertext every time.',
      'It has no diffusion either: one plaintext letter changes exactly one ciphertext letter. In a modern cipher a one-bit change flips about half of the output.',
      'Leaving spaces in place leaks the length of every word. In English a one-letter word is almost always “A” or “I”, so a single one-letter word narrows the key to two candidates — no statistics needed.',
    ]),
  ]);
}

/* ---------- 5. the English model ---------- */

function modelPanel(model) {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The reference English' }),
    chart({
      categories: [...ALPHABET], series: [{ label: `training corpus (${(model.train.letters / 1e6).toFixed(2)} million letters)`, color: 'var(--s2)', values: model.train.freq.map((x) => 100 * x) }],
      yTitle: '% of letters', height: 200,
    }),
    el('div', { class: 'scroll-x', style: 'margin-top:12px' }, [el('table', { class: 'data prose' }, [
      el('thead', {}, [el('tr', {}, ['book', 'role', 'letters', 'IC', 'entropy'].map((h, i) => el('th', { class: i < 2 ? 'left' : null, text: h })))]),
      el('tbody', {}, model.books.map((b) => el('tr', {}, [
        el('td', { class: 'left', text: `${b.title} — ${b.author}` }), el('td', { class: 'left', text: b.role }),
        el('td', { text: String(b.letters) }), el('td', { text: b.ic.toFixed(4) }), el('td', { text: b.entropy.toFixed(3) }),
      ]))),
    ])]),
    explain([
      `The letter frequencies are counted, not copied from a table: six public-domain novels from Project Gutenberg, normalised exactly as the ciphertexts are (accents removed, upper case, letters only). The four <em>training</em> books give the model; the two <em>test</em> books are kept aside and supply the ciphertexts of the experiments, so the attack is never scored on the text it learned from.`,
      'The six books, by six authors over eighty years, agree on the IC to the third decimal and on the entropy to about 0.02 bits: the letter distribution is a property of the language, which is why a model built from some books works on others.',
    ]),
  ]);
}

/* ---------- the page ---------- */

startPage({
  shell: hw03Shell('caesar.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: async ({ state, update, patch }) => {
    const model = await loadModel();
    const msg = state.msg ?? DEFAULT_MSG;
    const panels = el('div');
    const drawPanels = (k) => panels.replaceChildren(
      cipherPanel(msg, k), histogramPanel(msg, k, model), invariantsPanel(msg, k, model), structurePanel(msg, k), modelPanel(model));
    const k = readK(state.k ?? 3);
    drawPanels(k);
    return [inputCard({ msg, k }, model, update, (v) => { patch({ k: v }); drawPanels(v); }), panels];
  },
});
