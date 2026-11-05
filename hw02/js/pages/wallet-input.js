/* wallet-input.js — the input dock of every key-related page of hw02
   (assets/js/ui/dock.js): where the entropy comes from, 12 or 24 words, the
   passphrase, the path and the index. Plain choices travel in the URL (?src=abandon&words=12&path=
   metamask&index=0). Secrets — random, typed or dice entropy, the passphrase —
   stay in this module's memory only: never in the URL, never in storage. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { inputDock, show, onCommit } from '../../../assets/js/ui/dock.js';
import { hexToBytes, bytesToHex } from '../core/bytes.js';
import { testEntropy, randomEntropy, diceEntropy, diceBits, rollsFor } from '../core/entropy.js';
import { PATH_PRESETS, fillPath, parsePath } from '../core/bip32.js';
import { loadWordlist } from '../core/bip39.js';
import { runPipeline } from '../core/pipeline.js';

/** Parameters that follow the reader between pages, and where they are remembered. */
export const WALLET_KEYS = ['src', 'words', 'path', 'custom', 'index'];
export const WALLET_MEMORY = 'hw02.wallet';

const SOURCES = [
  { id: 'abandon', label: 'test vector (all zeros)' },
  { id: 'random', label: 'random (crypto.getRandomValues)' },
  { id: 'hex', label: 'hex typed by you' },
  { id: 'dice', label: 'dice rolls' },
];

/* session-only secrets; a reload forgets them, which is the point */
const secret = { random: {}, hex: '', dice: '', passphrase: '' };

/** Used by reveal mode: continue from a modified entropy (e.g. one flipped bit). */
export function useHexEntropy(hex) { secret.hex = hex; }

/**
 * Read the wallet described by the state. Never throws: returns {error} instead.
 * @returns {{entropy?: Uint8Array, source: string, words: number, passphrase: string,
 *            template: string, index: number, path?: string, error?: string}}
 */
export function walletFromState(state) {
  const source = SOURCES.some((s) => s.id === state.src) ? state.src : 'abandon';
  const words = state.words === '24' ? 24 : 12;
  const bytes = words === 24 ? 32 : 16;
  const index = Math.max(0, Math.min(2 ** 31 - 1, parseInt(state.index ?? '0', 10) || 0));
  const preset = PATH_PRESETS.find((p) => p.id === state.path);
  const template = preset ? preset.template : (state.path === 'custom' && state.custom ? state.custom : PATH_PRESETS[0].template);
  const out = { source, words, bytes, index, template, presetId: preset ? preset.id : (state.path === 'custom' ? 'custom' : 'metamask'), passphrase: secret.passphrase };

  try { out.path = fillPath(template, index); parsePath(out.path); } catch (e) { return { ...out, error: `Path: ${e.message}.` }; }

  if (source === 'abandon') out.entropy = testEntropy(bytes);
  if (source === 'random') out.entropy = (secret.random[bytes] ??= randomEntropy(bytes));
  if (source === 'hex') {
    const clean = secret.hex.replace(/\s+/g, '').replace(/^0x/i, '');
    if (clean.length !== bytes * 2 || /[^0-9a-f]/i.test(clean)) {
      return { ...out, error: `Type exactly ${bytes * 2} hex characters (${bytes * 8} bits) for ${words} words.` };
    }
    out.entropy = hexToBytes(clean);
  }
  if (source === 'dice') {
    const { digits, entropy } = diceEntropy(secret.dice, bytes);
    const need = rollsFor(bytes * 8);
    if (digits.length < need) {
      return { ...out, error: `${digits.length} rolls ≈ ${diceBits(digits.length).toFixed(1)} bits so far: ${need} rolls are needed for ${bytes * 8} bits.` };
    }
    out.entropy = entropy;
  }
  return out;
}

/** The safety label every key-related screen carries. */
export function safetyLabel(source) {
  const text = source === 'abandon' ? 'public test key'
    : source === 'random' ? 'random — for demonstration only'
    : 'typed by you — never a real key';
  return el('span', { class: 'safety', text });
}

let now = null;   // the wallet on screen, for the controls that start from it

const WALLET = {
  id: 'wallet',
  build(apply, later) {
    const select = (label, options) => el('select', { 'aria-label': label }, options.map(([value, text]) => el('option', { value, text })));
    const source = select('entropy source', SOURCES.map((s) => [s.id, s.label]));
    const words = select('words', [['12', '12 (128 bits)'], ['24', '24 (256 bits)']]);
    const path = select('path', [...PATH_PRESETS.map((p) => [p.id, `${p.label} · ${p.template}`]), ['custom', 'custom…']]);
    const pass = el('input', { type: 'text', placeholder: '(none)', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'passphrase' });
    const custom = el('input', { class: 'wide', spellcheck: 'false', 'aria-label': 'custom path' });
    const index = el('input', { type: 'number', class: 'num', min: 0, 'aria-label': 'index i' });
    const hex = el('input', { class: 'wide', spellcheck: 'false', 'aria-label': 'entropy in hex' });
    const dice = el('textarea', { rows: 2, spellcheck: 'false', 'aria-label': 'dice rolls' });
    const count = el('span', { class: 'small muted' });
    const caption = el('p', { class: 'small muted', style: 'margin:8px 0 0' });

    /* the secrets are read from their fields into this module's memory, never into the URL */
    const readTexts = () => { secret.passphrase = pass.value; secret.hex = hex.value; secret.dice = dice.value; };
    const choose = (changes) => {
      readTexts();
      // switching to typed hex starts from the current bits, so one can be edited
      if (changes.src === 'hex' && !secret.hex && now?.entropy) secret.hex = bytesToHex(now.entropy);
      apply(changes);
    };
    const go = () => { readTexts(); apply({ index: index.value, custom: path.value === 'custom' ? custom.value : null }); };
    const showCount = () => {
      const n = dice.value.replace(/[^1-6]/g, '').length, bytes = now?.bytes ?? 16;
      count.textContent = `${n} rolls ≈ ${diceBits(n).toFixed(1)} bits (need ${rollsFor(bytes * 8)} rolls for ${bytes * 8} bits)`;
    };

    source.addEventListener('change', () => choose({ src: source.value }));
    words.addEventListener('change', () => choose({ words: words.value }));
    path.addEventListener('change', () => choose({ path: path.value, custom: path.value === 'custom' ? now?.template ?? null : null }));
    for (const input of [pass, custom, index, hex, dice]) onCommit(input, go, later);
    dice.addEventListener('input', showCount);

    const customField = field('custom path ({i} = index)', custom);
    const rows = {
      random: el('div', { class: 'row' }, [
        el('button', { type: 'button', text: 'New random entropy', onclick: () => { readTexts(); secret.random = {}; apply({}); } }),
        el('span', { class: 'small muted', text: 'Drawn by the operating system’s CSPRNG. Kept in this tab only; a reload draws new bits.' }),
      ]),
      hex: el('div', { class: 'row' }, [field('entropy in hex', hex)]),
      dice: el('div', {}, [field('dice rolls, digits 1–6 (anything else is ignored)', dice), count]),
    };

    return {
      nodes: [
        el('div', { class: 'row' }, [
          field('entropy source', source), field('words', words),
          el('div', { class: 'vrule' }),
          field('passphrase', pass),
          el('div', { class: 'vrule' }),
          field('path', path), customField, field('index i', index),
          el('button', { class: 'primary', type: 'button', text: 'Apply', onclick: go }),
        ]),
        rows.random, rows.hex, rows.dice,
        caption,
      ],
      refresh(wallet) {
        now = wallet;
        show(source, wallet.source);
        show(words, wallet.words);
        show(path, wallet.presetId);
        show(pass, secret.passphrase);
        show(custom, wallet.template);
        show(index, wallet.index);
        show(hex, secret.hex);
        show(dice, secret.dice);
        hex.placeholder = '0'.repeat(wallet.bytes * 2);
        customField.hidden = wallet.presetId !== 'custom';
        for (const [id, row] of Object.entries(rows)) row.hidden = wallet.source !== id;
        showCount();
        caption.innerHTML = `The path picks one key of the tree: here <span class="eq">${wallet.path ?? wallet.template}</span>. The index <span class="eq">i</span> is the number a wallet increments to show “account 2, 3…”.`;
      },
    };
  },
  summary: (w) => `${SOURCES.find((s) => s.id === w.source).label} · ${w.words} words${w.passphrase ? ' · passphrase' : ''} · ${w.path ?? w.template}`,
  notes: [
    '<strong>Entropy source.</strong> The test vector is 128 (or 256) zero bits — the public example every implementation is checked against, giving <span class="eq">abandon … about</span>. <em>Random</em> asks the operating system’s cryptographic generator, which is what a real wallet does. <em>Hex</em> lets you type the bits yourself, to flip one and watch the effect. <em>Dice</em> hashes your rolls with SHA-256: each fair roll carries <span class="eq">log₂6 ≈ 2.585</span> bits, so 50 rolls cover 128 bits and 99 cover 256. Entropy source and word count are the secret: everything else is computed from them, and nothing else adds unpredictability.',
    '<strong>Words.</strong> 12 words carry 128 bits of entropy plus a 4-bit checksum; 24 words carry 256 plus 8. Both are far beyond guessing; 24 only adds margin against a future quantum search of the seed space.',
    '<strong>Passphrase.</strong> An optional extra string, sometimes called the 25th word. It enters only the PBKDF2 salt, so changing one character changes the seed and every key after it — and there is no way to tell a wrong passphrase from a decoy wallet: every passphrase opens a different wallet, and none is “wrong”.',
    '<strong>Path and index.</strong> BIP-44 writes a key’s place in the tree as <span class="eq">m / purpose’ / coin’ / account’ / change / index</span>. Wallets agree on <span class="eq">44’/60’</span> for Ether but not on which level counts accounts, so the same words can show different second addresses in two wallets.',
    'A value applies when you leave its field or press Enter; <strong>Apply</strong> does it at once.',
    'PRACTICE: Nothing in these inputs is sent anywhere or stored: the secrets live in this tab and vanish on reload, and the URL holds only the source name, the word count and the path. Never type a real seed phrase or real entropy into any website — this one included.',
  ],
};

/**
 * The input dock of every key-related page (see assets/js/ui/dock.js).
 * Returns null: it takes no place in the page.
 * @param {object} o
 * @param {object} o.wallet   result of walletFromState
 * @param {object|null} [o.page]  the page's own section
 * @param {any} [o.pageValue]     what that section shows
 */
export function walletDock({ wallet, update, page = null, pageValue = null }) {
  return inputDock({
    id: 'hw02', title: 'Wallet', update,
    badge: safetyLabel(wallet.source),
    message: wallet.error ? { text: wallet.error, kind: 'err' } : null,
    sections: page ? [WALLET, page] : [WALLET],
    values: { wallet, ...(page ? { [page.id]: pageValue } : {}) },
  });
}

/** What a page shows while the wallet input is rejected: the reason is in the dock too. */
export const rejected = (error) => el('div', { class: 'card' }, [
  el('h2', { text: 'Waiting for a valid wallet input' }),
  el('p', { class: 'err', text: error }),
  el('p', { class: 'small muted', text: 'Complete it in the inputs at the bottom of the window.' }),
]);

/** What every key-related page starts from: the wallet of the state and,
 *  unless its input is rejected, the full pipeline run on it. */
export async function loadWallet(state) {
  const wallet = walletFromState(state);
  const wordlist = await loadWordlist();
  if (wallet.error) return { wallet, wordlist, run: null };
  const run = await runPipeline({ entropy: wallet.entropy, wordlist, passphrase: wallet.passphrase, path: wallet.path });
  return { wallet, wordlist, run };
}
