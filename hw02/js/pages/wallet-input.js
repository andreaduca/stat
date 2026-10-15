/* wallet-input.js — the card every key-related page of hw02 opens with:
   where the entropy comes from, 12 or 24 words, the passphrase, the path and
   the index. Plain choices travel in the URL (?src=abandon&words=12&path=
   metamask&index=0). Secrets — random, typed or dice entropy, the passphrase —
   stay in this module's memory only: never in the URL, never in storage. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
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

/**
 * @param {object} o
 * @param {object} o.wallet  result of walletFromState
 * @param {Node[]} o.extras  page-specific control rows
 */
export function walletInput({ wallet, update, extras = [] }) {
  const readTexts = () => {
    const value = (id) => document.getElementById(id)?.value;
    secret.passphrase = value('in-pass') ?? secret.passphrase;
    if (value('in-hex') !== undefined) secret.hex = value('in-hex');
    if (value('in-dice') !== undefined) secret.dice = value('in-dice');
  };
  const choose = (changes) => {
    readTexts();
    // switching to typed hex starts from the current bits, so one can be edited
    if (changes.src === 'hex' && !secret.hex && wallet.entropy) secret.hex = bytesToHex(wallet.entropy);
    update(changes);
  };
  const apply = () => {
    readTexts();
    update({
      index: document.getElementById('in-index').value,
      custom: wallet.presetId === 'custom' ? document.getElementById('in-custom').value : null,
    });
  };
  const onEnter = (e) => { if (e.key === 'Enter') apply(); };

  const select = (options, current, onchange) => el('select', { onchange }, options.map(([value, label]) =>
    el('option', { value, text: label, selected: value === current })));

  const sourceRow = {
    abandon: null,
    random: el('div', { class: 'row', style: 'margin-top:12px' }, [
      el('button', { type: 'button', text: 'New random entropy', onclick: () => { readTexts(); secret.random = {}; update({}); } }),
      el('span', { class: 'small muted', text: 'Drawn by the operating system’s CSPRNG. Kept in this tab only; a reload draws new bits.' }),
    ]),
    hex: el('div', { class: 'row', style: 'margin-top:12px' }, [
      field(`entropy, ${wallet.bytes * 2} hex characters`, el('input', { id: 'in-hex', class: 'wide', value: secret.hex, placeholder: '0'.repeat(wallet.bytes * 2), spellcheck: 'false', onkeydown: onEnter })),
    ]),
    dice: (() => {
      const count = el('span', { class: 'small muted' });
      const show = (text) => {
        const n = String(text).replace(/[^1-6]/g, '').length;
        count.textContent = `${n} rolls ≈ ${diceBits(n).toFixed(1)} bits (need ${rollsFor(wallet.bytes * 8)} rolls for ${wallet.bytes * 8} bits)`;
      };
      show(secret.dice);
      return el('div', { style: 'margin-top:12px' }, [
        field('dice rolls, digits 1–6 (anything else is ignored)', el('textarea', { id: 'in-dice', rows: 2, spellcheck: 'false', oninput: (e) => show(e.target.value) }, [secret.dice])),
        count,
      ]);
    })(),
  }[wallet.source];

  return el('div', { class: 'card' }, [
    el('div', { class: 'step-head' }, [el('h2', { text: 'Wallet input' }), safetyLabel(wallet.source)]),

    el('div', { class: 'row' }, [
      field('entropy source', select(SOURCES.map((s) => [s.id, s.label]), wallet.source, (e) => choose({ src: e.target.value }))),
      field('words', select([['12', '12 (128 bits)'], ['24', '24 (256 bits)']], String(wallet.words), (e) => choose({ words: e.target.value }))),
      el('div', { class: 'vrule' }),
      field('passphrase', el('input', { id: 'in-pass', type: 'text', value: secret.passphrase, placeholder: '(none)', autocomplete: 'off', spellcheck: 'false', onkeydown: onEnter })),
      el('div', { class: 'vrule' }),
      field('path', select([...PATH_PRESETS.map((p) => [p.id, `${p.label} · ${p.template}`]), ['custom', 'custom…']], wallet.presetId,
        (e) => choose({ path: e.target.value, custom: e.target.value === 'custom' ? wallet.template : null }))),
      wallet.presetId === 'custom'
        ? field('custom path ({i} = index)', el('input', { id: 'in-custom', class: 'wide', value: wallet.template, spellcheck: 'false', onkeydown: onEnter }))
        : null,
      field('index i', el('input', { id: 'in-index', type: 'number', class: 'num', min: 0, value: String(wallet.index), onkeydown: onEnter })),
      el('button', { class: 'primary', type: 'button', text: 'Apply', onclick: apply }),
    ]),
    sourceRow,
    ...extras,

    wallet.error ? el('p', { class: 'err', style: 'margin:14px 0 0', text: wallet.error }) : null,
    el('p', { class: 'small muted', style: 'margin:14px 0 4px', text: 'Entropy source and word count are the secret: everything below is computed from them, and nothing else adds unpredictability.' }),
    el('p', { class: 'small muted', style: 'margin:0 0 4px', text: 'The passphrase is mixed into the salt of the seed: every passphrase opens a different wallet, and none is “wrong”.' }),
    el('p', { class: 'small muted', style: 'margin:0', html: `The path picks one key of the tree: here <span class="eq">${wallet.path ?? wallet.template}</span>. The index <span class="eq">i</span> is the number a wallet increments to show “account 2, 3…”.` }),

    explain([
      '<strong>Entropy source.</strong> The test vector is 128 (or 256) zero bits — the public example every implementation is checked against, giving <span class="eq">abandon … about</span>. <em>Random</em> asks the operating system’s cryptographic generator, which is what a real wallet does. <em>Hex</em> lets you type the bits yourself, to flip one and watch the effect. <em>Dice</em> hashes your rolls with SHA-256: each fair roll carries <span class="eq">log₂6 ≈ 2.585</span> bits, so 50 rolls cover 128 bits and 99 cover 256.',
      '<strong>Words.</strong> 12 words carry 128 bits of entropy plus a 4-bit checksum; 24 words carry 256 plus 8. Both are far beyond guessing; 24 only adds margin against a future quantum search of the seed space.',
      '<strong>Passphrase.</strong> An optional extra string, sometimes called the 25th word. It enters only the PBKDF2 salt, so changing one character changes the seed and every key after it — and there is no way to tell a wrong passphrase from a decoy wallet.',
      '<strong>Path and index.</strong> BIP-44 writes a key’s place in the tree as <span class="eq">m / purpose’ / coin’ / account’ / change / index</span>. Wallets agree on <span class="eq">44’/60’</span> for Ether but not on which level counts accounts, so the same words can show different second addresses in two wallets.',
      'PRACTICE: Nothing on this card is sent anywhere or stored: the secrets live in this tab and vanish on reload, and the URL holds only the source name, the word count and the path. Never type a real seed phrase or real entropy into any website — this one included.',
    ], 'What does each value change?'),
  ]);
}

/** What every key-related page starts from: the wallet of the state and,
 *  unless its input is rejected, the full pipeline run on it. */
export async function loadWallet(state) {
  const wallet = walletFromState(state);
  const wordlist = await loadWordlist();
  if (wallet.error) return { wallet, wordlist, run: null };
  const run = await runPipeline({ entropy: wallet.entropy, wordlist, passphrase: wallet.passphrase, path: wallet.path });
  return { wallet, wordlist, run };
}
