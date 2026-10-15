/* bip39-page.js — the BIP-39 lab: a live checksum checker with first-four-
   letter completion and the list of valid last words; a demonstration that
   PBKDF2 accepts any phrase; the passphrase making unrelated wallets; and the
   measured cost of key stretching, ending in a real missing-word recovery. */

import { el, field, fmt } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { bytesToHex, utf8NFKD } from '../core/bytes.js';
import { Mnemonic, validLastWords, seedFromPhrase, PBKDF2_ITERATIONS } from '../core/bip39.js';
import { pbkdf2Sha512 } from '../core/hash.js';
import { HDNode } from '../core/bip32.js';
import { EthAccount } from '../core/address.js';
import { recoverMissingWord } from '../core/pipeline.js';
import { loadWallet, walletInput, WALLET_KEYS, WALLET_MEMORY } from './wallet-input.js';
import { stepCard, facts, hexBitDistance, humanTime } from './widgets.js';
import { hw02Shell } from './shell.js';

/* ---------- 1. live checksum checker ---------- */

function checkerPanel(run, wordlist) {
  const words = run.mnemonic.words.slice();       // start from the wallet's words
  const n = words.length;
  const status = el('p', { style: 'margin:12px 0 6px' });
  const lastInfo = el('p', { class: 'small muted', style: 'margin:0 0 6px' });
  const chips = el('div', { class: 'chips' });

  const inputs = words.map((w, i) => el('input', {
    class: 'word-in', value: w, list: 'bip39-list', 'aria-label': `word ${i + 1}`, autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => {
      let v = e.target.value.trim().toLowerCase();
      // the English list is chosen so that 4 letters identify every word: complete on the 4th
      if (e.inputType?.startsWith('insert') && v.length >= 4 && !wordlist.includes(v)) {
        const hits = wordlist.filter((x) => x.startsWith(v));
        if (hits.length === 1) { v = hits[0]; e.target.value = v; }
      }
      words[i] = v;
      refresh();
    },
  }));

  function refresh() {
    const m = Mnemonic.fromWords(words, wordlist);
    inputs.forEach((input, i) => { input.className = `word-in ${m.indices[i] >= 0 ? 'good' : 'bad'}`; });
    status.replaceChildren(...(m.unknown.length
      ? [el('span', { class: 'err', text: `Not in the list: ${m.unknown.join(', ')}.` })]
      : m.valid
        ? [el('span', { class: 'ok', html: `<strong>Valid.</strong> The last ${m.checksum.length} bits carry <span class="key-cs">${m.checksum}</span>, exactly the first bits of SHA-256(entropy).` })]
        : [el('span', { class: 'err', html: `<strong>Checksum mismatch.</strong> The words carry <span class="key-cs">${m.checksum}</span>, but SHA-256 of their entropy begins <span class="key-cs">${m.expectedChecksum}</span>. A wallet refuses this phrase.` })]));

    const first = words.slice(0, n - 1);
    if (Mnemonic.fromWords([...first, wordlist[0]], wordlist).unknown.length) {
      lastInfo.textContent = 'Fix the unknown words to see which last words are valid.';
      chips.replaceChildren();
      return;
    }
    const valid = validLastWords(first, wordlist);
    lastInfo.innerHTML = `With these first ${n - 1} words, <strong>${valid.length}</strong> of the 2048 possible last words give a valid phrase (2^${11 - n / 3} = ${2 ** (11 - n / 3)}: the last word's ${11 - n / 3} free entropy bits). Click one to use it.`;
    chips.replaceChildren(...valid.map((w) => el('button', {
      type: 'button', class: w === words[n - 1] ? 'on' : null, text: w,
      onclick: () => { words[n - 1] = w; inputs[n - 1].value = w; refresh(); },
    })));
  }
  refresh();

  return stepCard({
    title: 'Checksum checker', cats: ['encoding'],
    formula: 'valid ⇔ every word in the list ∧ last CS bits = first CS bits of SHA-256(first ENT bits)',
    body: [
      el('datalist', { id: 'bip39-list' }, wordlist.map((w) => el('option', { value: w }))),
      el('div', { class: 'wordgrid' }, inputs.map((input, i) => el('label', { class: 'field' }, [el('span', { text: `${i + 1}` }), input]))),
      status,
      lastInfo,
      chips,
    ],
    why: 'a wallet must reject a mistyped backup before it derives keys from it.',
    notes: [
      'Change any word and the check is redone live. Typing four letters completes the word: the English list was chosen so that the first four letters are unique, which is why steel backup plates leave room for four letters only.',
      `The last word holds the checksum: with 12 words it carries 7 entropy bits and 4 checksum bits, so 2⁷ = 128 last words are valid; with 24 words, 3 + 8 bits, so 2³ = 8. A random phrase passes with probability 1/16 (12 words) or 1/256 (24).`,
      'The checksum catches accidents — a wrong word, two words swapped — with probability 15/16. It is not a security feature: an attacker can compute it as easily as you.',
      'PRACTICE: “Pick 11 words yourself and let the tool compute the 12th” is how people create brain-wallets that get drained. Human choices carry far fewer than 11 bits per word; the checksum makes such a phrase look exactly as valid as a random one.',
    ],
  });
}

/* ---------- 2. the KDF does not check ---------- */

async function kdfPanel(run, wordlist) {
  // the same words with the first last word that breaks the checksum
  const first = run.mnemonic.words.slice(0, -1);
  const broken = wordlist.find((w) => !Mnemonic.fromWords([...first, w], wordlist).valid);
  const phrases = [run.mnemonic.phrase, [...first, broken].join(' '), 'correct horse battery staple'];
  const rows = [];
  for (const phrase of phrases) {
    const m = Mnemonic.fromWords(phrase, wordlist);
    const seed = bytesToHex(await seedFromPhrase(phrase));
    const verdict = m.unknown.length ? 'not a BIP-39 phrase' : m.valid ? 'valid' : 'checksum fails';
    rows.push(el('tr', {}, [
      el('td', { class: 'left', text: phrase.length > 60 ? phrase.slice(0, 57) + '…' : phrase }),
      el('td', { class: `left ${m.valid ? 'ok' : 'err'}`, text: verdict }),
      el('td', { class: 'left', text: seed.slice(0, 24) + '…' }),
    ]));
  }
  return stepCard({
    title: 'The KDF does not check', cats: ['derivation'],
    formula: 'seed = PBKDF2-HMAC-SHA512( any string, "mnemonic" ‖ passphrase, 2048, 64 )',
    body: el('div', { class: 'scroll-x' }, [el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: 'phrase' }), el('th', { class: 'left', text: 'checksum' }), el('th', { class: 'left', text: 'seed (first 12 bytes)' })])]),
      el('tbody', {}, rows),
    ])]),
    why: 'BIP-39 separates the backup format from the key derivation, so any string — including any passphrase — can be stretched into a seed.',
    notes: [
      'All three rows produce a seed, including a phrase whose checksum fails and one that is not made of list words at all. PBKDF2 only sees bytes; the checksum is enforced by wallet software, not by the mathematics.',
      'This is deliberate: it is what lets the passphrase be anything, and it means a wallet that skipped the check would silently open a different, empty wallet from a mistyped backup — which is why every wallet must check before deriving.',
    ],
  });
}

/* ---------- 3. passphrase ---------- */

async function passphrasePanel(run, wallet) {
  const list = ['', 'TREZOR', 'trezor', 'TREZOR ', ...(wallet.passphrase && !['', 'TREZOR', 'trezor', 'TREZOR '].includes(wallet.passphrase) ? [wallet.passphrase] : [])];
  const rows = [];
  let reference = null;
  for (const pass of list) {
    const seedBytes = await run.mnemonic.toSeed(pass);
    const seed = bytesToHex(seedBytes);
    reference ??= seed;
    const { node: master } = await HDNode.fromSeed(seedBytes);
    const { node } = await master.derive(wallet.path);
    rows.push(el('tr', { class: pass === wallet.passphrase ? 'is-current' : null }, [
      el('td', { class: 'left', text: pass === '' ? '(none)' : JSON.stringify(pass) }),
      el('td', { class: 'left', text: seed.slice(0, 20) + '…' }),
      el('td', { text: pass === '' ? '—' : `${hexBitDistance(seed, reference)} / 512` }),
      el('td', { class: 'left', text: new EthAccount(node.privateKey).checksumAddress() }),
    ]));
  }
  return stepCard({
    title: 'Same words, different passphrases', cats: ['derivation', 'generation'],
    formula: 'salt = "mnemonic" ‖ passphrase &nbsp;→&nbsp; a different seed, a different tree, different addresses',
    body: [
      el('p', { class: 'small muted', text: `Words: the wallet above. Path: ${wallet.path}. The row of the passphrase typed on the wallet card is highlighted.` }),
      el('div', { class: 'scroll-x' }, [el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: 'passphrase' }), el('th', { class: 'left', text: 'seed' }), el('th', { text: 'seed bits ≠ no passphrase' }), el('th', { class: 'left', text: 'address' })])]),
        el('tbody', {}, rows),
      ])]),
    ],
    why: 'a stolen word list alone is useless when a passphrase is set, and a decoy wallet can sit behind the empty passphrase.',
    notes: [
      'Each passphrase changes about half of the 512 seed bits — even “TREZOR” versus “trezor”, or one trailing space — and therefore every key and address after it. There is no “wrong passphrase” error: every string opens a wallet, most of them empty.',
      'Category: the passphrase is a second piece of secret input (generation, if it is chosen randomly) entering through a derivation function. It adds exactly as much security as it has entropy, multiplied only by the 2048-iteration stretching.',
      'PRACTICE: Forgetting the passphrase loses the funds as surely as losing the words; a short one is brute-forceable at PBKDF2 speed. Hardware wallets offer it as an optional “25th word”.',
    ],
  });
}

/* ---------- 4. stretching ---------- */

async function stretchingPanel(run) {
  const password = utf8NFKD(run.mnemonic.phrase), salt = utf8NFKD('mnemonic');
  const time = async (iterations, reps) => {
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) await pbkdf2Sha512(password, salt, iterations, 64);
    return (performance.now() - t0) / reps / 1000;
  };
  const one = await time(1, 100);
  const full = await time(PBKDF2_ITERATIONS, 20);
  const perSecond = 1 / full, gpu = 1e6;

  const rows = [
    ['one forgotten word, checksum filter first', 2048 / 16, 'about 128 survivors of 2048'],
    ['one forgotten word, position unknown (12 places)', (12 * 2048) / 16, ''],
    ['passphrase of 4 lowercase letters', 26 ** 4, '26⁴'],
    ['passphrase of 8 lowercase letters', 26 ** 8, '26⁸ ≈ 2³⁷'],
    ['passphrase of 5 Diceware words', 7776 ** 5, '7776⁵ ≈ 2⁶⁴'],
    ['a random 12-word phrase', 2 ** 128, '2¹²⁸'],
  ];
  return stepCard({
    title: 'What 2048 iterations buy', cats: ['derivation'],
    formula: `cost of one guess = ${PBKDF2_ITERATIONS} × HMAC-SHA512 &nbsp;⇒&nbsp; +log₂ 2048 = 11 bits of work per guess`,
    body: [
      facts([
        ['one PBKDF2 iteration (one HMAC), measured', humanTime(one)],
        [`all ${PBKDF2_ITERATIONS} iterations, measured`, humanTime(full)],
        ['ratio (theory 2048)', fmt(Math.round(full / one))],
        ['guesses per second in this browser', fmt(Math.round(perSecond))],
      ]),
      el('div', { class: 'scroll-x', style: 'margin-top:12px' }, [el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: 'search' }), el('th', { text: 'candidates' }), el('th', { text: 'this browser' }), el('th', { text: 'GPU, 10⁶/s' })])]),
        el('tbody', {}, rows.map(([what, count, note]) => el('tr', {}, [
          el('td', { class: 'left', html: `${what}${note ? ` <span class="muted small">(${note})</span>` : ''}` }),
          el('td', { text: count < 1e9 ? fmt(Math.round(count)) : count.toExponential(1) }),
          el('td', { text: humanTime(count / perSecond) }),
          el('td', { text: humanTime(count / gpu) }),
        ]))),
      ])]),
      el('p', { class: 'small muted', style: 'margin-top:8px', text: 'Times are for PBKDF2 alone; a real search also derives the path and the address for each candidate, which roughly doubles them in this browser.' }),
    ],
    why: 'stretching cannot save a random secret (it does not need saving) but it slows down guessing a weak one.',
    notes: [
      'Each candidate costs 2048 HMAC computations instead of one: a constant factor of 2048 = 2¹¹, so 11 extra bits of work. The ratio measured above should be close to 2048; it is a little less because the fixed overhead of one call is shared.',
      'Against a random 12-word phrase the stretching is irrelevant — 2¹²⁸ is out of reach either way. It matters exactly where entropy is low: a forgotten word, a short passphrase, a weak generator.',
      'PRACTICE: PBKDF2 is cheap to parallelise on GPUs. Modern password hashing uses memory-hard functions (scrypt, Argon2) that make every guess also cost memory; BIP-39 predates them and cannot change without breaking every existing backup.',
    ],
  });
}

/* ---------- 5. missing-word recovery ---------- */

function recoveryPanel(run, wallet, wordlist) {
  const n = run.mnemonic.words.length;
  let position = n - 1;
  const out = el('div', { style: 'margin-top:12px' });
  const progress = el('progress', { max: 1, value: 0, style: 'width:100%;display:none' });
  let stop = false;

  const go = async (button) => {
    stop = false;
    button.disabled = true;
    progress.style.display = 'block';
    const words = run.mnemonic.words.slice();
    words[position] = '?';
    out.replaceChildren(el('p', { class: 'small', text: `Searching for word ${position + 1}: ${words.join(' ')}` }));
    const r = await recoverMissingWord({
      words, position, wordlist, passphrase: wallet.passphrase, path: wallet.path, target: run.account.lower,
      onProgress: (done, total) => { progress.max = total; progress.value = done; return !stop; },
    });
    button.disabled = false;
    progress.style.display = 'none';
    const per = r.deriveMs / Math.max(1, r.tried);
    out.replaceChildren(facts([
      ['candidates for the missing word', '2048'],
      ['passing the checksum (one SHA-256 each)', `${r.candidates}  (${(r.candidates / 2048 * 100).toFixed(1)} %, theory 1/16 = 6.25 %)`],
      ['time for the checksum filter', `${r.filterMs.toFixed(0)} ms`],
      ['full derivations run (every survivor)', `${r.tried}`],
      ['candidates giving the known address', `${r.matches.length}`],
      ['time per full derivation (PBKDF2 → address)', `${per.toFixed(1)} ms`],
      ['recovered word', r.found ?? (stop ? 'stopped' : 'not found')],
      ['total time', humanTime((r.filterMs + r.deriveMs) / 1000)],
      ['without the checksum filter, worst case', humanTime((2048 * per) / 1000)],
    ]));
  };

  const select = el('select', { onchange: (e) => { position = Number(e.target.value); } },
    run.mnemonic.words.map((w, i) => el('option', { value: i, text: `word ${i + 1}`, selected: i === position })));
  const button = el('button', { class: 'primary', type: 'button', text: 'Forget it and recover it', onclick: () => go(button) });

  return stepCard({
    title: 'Recover a forgotten word', cats: ['derivation', 'encoding'],
    formula: 'for each of the 2048 words: checksum ok? → PBKDF2 → path → kG → Keccak → same address?',
    body: [
      el('p', { class: 'small muted', html: `The “owner” remembers every word but one, and knows the address <span class="eq">${run.checksum.checksummed}</span>.` }),
      el('div', { class: 'row' }, [field('missing word', select), button, el('button', { type: 'button', text: 'Stop', onclick: () => { stop = true; } })]),
      progress, out,
    ],
    why: 'it shows the stretching and the checksum working together on the one realistic low-entropy case.',
    notes: [
      'The checksum is a free filter: one SHA-256 per candidate removes 15 of every 16 words before any expensive work. For the last word exactly 2^(11 − CS) candidates remain; for any other position about 1/16 of 2048.',
      'Each survivor then pays the full price — the search tries them all, and only one gives the known address: PBKDF2 with 2048 HMACs, five HMACs along the path, one scalar multiplication and a Keccak — a few milliseconds here. A whole forgotten word costs seconds, two forgotten words about 2048 times more.',
      'PRACTICE: This is exactly how the 2026 Coldcard seeds were swept, with a different enumeration: list every state the weak generator could have been in, derive, compare with on-chain keys. When a secret has little entropy, every layer of the pipeline is just a cost, never a barrier.',
    ],
  });
}

/* ---------- the page ---------- */

startPage({
  shell: hw02Shell('bip39.html'),
  sticky: WALLET_KEYS,
  memory: WALLET_MEMORY,
  render: async ({ state, update }) => {
    const { wallet, wordlist, run } = await loadWallet(state);
    const input = walletInput({ wallet, update });
    if (!run) return [input];
    return [
      input,
      checkerPanel(run, wordlist),
      await kdfPanel(run, wordlist),
      await passphrasePanel(run, wallet),
      await stretchingPanel(run),
      recoveryPanel(run, wallet, wordlist),
    ];
  },
});
