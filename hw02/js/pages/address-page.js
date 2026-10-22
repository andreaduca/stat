/* address-page.js — the Address & EIP-55 lab: Keccak-256 against SHA3-256
   from one sponge with the padding byte switched, a typo playground for the
   EIP-55 casing check, the number of check bits an address really has, and
   when the public key behind an address stops being hidden. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { eip55, checkAddress, EthAccount } from '../core/address.js';
import { fillPath } from '../core/bip32.js';
import { compressedHex, ethereumHex } from '../../../assets/js/core/secp256k1.js';
import { loadWallet, walletInput, WALLET_KEYS, WALLET_MEMORY } from './wallet-input.js';
import { stepCard, facts } from './widgets.js';
import { spongePanel } from './hash-demo.js';
import { hw02Shell } from './shell.js';

const pct = (p) => `${(100 * p).toPrecision(3)} %`;

/* ---------- typo playground ---------- */

function typoPanel(run) {
  const original = run.checksum.checksummed;
  const verdict = el('div');
  const grid = el('div', { class: 'eip-grid', style: 'margin:10px 0' });

  const draw = (typed) => {
    const r = checkAddress(typed);
    const body = typed.trim().replace(/^0x/i, '');
    if (r.status === 'malformed') {
      verdict.replaceChildren(el('p', { class: 'err', text: 'Not 40 hexadecimal characters: no wallet would parse it.' }));
      grid.replaceChildren();
      return;
    }
    const expected = eip55(body).checksummed.slice(2);
    const L = eip55(body).letters;
    grid.replaceChildren(...[...body].map((c, i) => el('div', {
      class: [r.wrong.includes(i) ? 'chg' : '', /[a-f]/i.test(c) ? '' : 'digit', c !== original[i + 2] && c.toLowerCase() !== original[i + 2].toLowerCase() ? 'typo' : ''].join(' ').trim(),
      title: /[a-f]/i.test(c) ? `EIP-55 wants ${expected[i]}` : 'digit: no check bit',
    }, [el('div', { class: 'c', text: c }), el('div', { class: 'muted', text: expected[i] })])));

    const text = {
      valid: body.toLowerCase() === original.slice(2).toLowerCase()
        ? 'Valid: this is the address, correctly cased.'
        : `Passes, although it is a different address! Its own casing happens to match its own hash — with L = ${L} letters that has probability 2^−${L} = ${pct(2 ** -L)}.`,
      invalid: `Rejected: ${r.wrong.length} of the ${L} letters have the wrong case (red). After a typo the hash of the text is unrelated to the old one, so each letter’s expected case is a fresh coin flip.`,
      unchecked: 'Accepted as “no checksum”: all-lowercase and all-uppercase addresses are not checked at all. This is why EIP-55 is optional in practice.',
    }[r.status];
    verdict.replaceChildren(el('p', { class: r.status === 'invalid' ? 'err' : r.status === 'valid' && body !== original.slice(2) ? 'err' : 'ok', text }));
  };

  const input = el('input', { class: 'wide', value: original, spellcheck: 'false', oninput: (e) => draw(e.target.value) });
  const set = (v) => { input.value = v; draw(v); };
  const typo = () => {
    // one character replaced by another hex digit, typed in the case the original had there
    const body = original.slice(2);
    const i = Math.floor(Math.random() * 40);
    const choices = '0123456789abcdef'.replace(body[i].toLowerCase(), '');
    let c = choices[Math.floor(Math.random() * choices.length)];
    if (body[i] !== body[i].toLowerCase()) c = c.toUpperCase();
    set('0x' + body.slice(0, i) + c + body.slice(i + 1));
  };
  draw(original);

  return stepCard({
    title: 'Typo playground', cats: ['checksum'],
    formula: 'valid ⇔ mixed case ∧ every letter’s case = EIP-55 of the lowercase text',
    body: [
      el('div', { class: 'row' }, [
        field('edit one character', input),
        el('button', { type: 'button', text: 'Random typo', onclick: typo }),
        el('button', { type: 'button', text: 'All lowercase', onclick: () => set(original.toLowerCase()) }),
        el('button', { type: 'button', text: 'Reset', onclick: () => set(original) }),
      ]),
      el('p', { class: 'tagline', style: 'margin-top:12px', text: 'each character typed, with the case EIP-55 expects beneath it (red: wrong case; underlined: the typo itself)' }),
      grid, verdict,
    ],
    why: 'a mistyped address sends funds to a key nobody holds, and the casing check catches almost every such typo.',
    notes: [
      'Changing one character changes the lowercase text, so its Keccak-256 hash — and with it the expected case of every letter — is redrawn at random. The new address passes only if all its letters happen to have the right case: probability <span class="eq">2^−L</span> for <span class="eq">L</span> letters.',
      'A typo that turns a digit into a digit in a letter-poor address is the weak spot: few letters, few check bits. Try “Random typo” a few times and watch the number of red letters.',
      'The check guards against accidents only. Anyone can compute the right casing of any address, so a look-alike address planted by an attacker (address poisoning) is perfectly valid.',
    ],
  });
}

/* ---------- check bits ---------- */

async function checkBitsPanel(run, wallet) {
  const rows = [];
  let sum = 0, sumL = 0;
  for (let i = 0; i < 10; i++) {
    const path = fillPath(wallet.template, i);
    const { node } = await run.master.derive(path);
    const { letters, checksummed } = eip55(new EthAccount(node.privateKey).lower);
    sum += 2 ** -letters; sumL += letters;
    rows.push(el('tr', { class: i === wallet.index ? 'is-current' : null }, [
      el('td', { text: i }), el('td', { class: 'left', text: checksummed }), el('td', { text: letters }), el('td', { text: pct(2 ** -letters) }),
    ]));
  }
  const L = run.checksum.letters;
  return stepCard({
    title: 'How many check bits?', cats: ['checksum'],
    formula: 'L = number of letters a–f; &nbsp;P(random typo passes) ≈ 2<sup>−L</sup>; &nbsp;over all addresses E[2<sup>−L</sup>] = (13/16)<sup>40</sup>',
    body: [
      facts([
        ['letters in this address, L', String(L)],
        ['P(a random typo passes) for this address', pct(2 ** -L)],
        ['expected letters per address, 40 × 6/16', '15'],
        ['2^−15, the “typical” address', pct(2 ** -15)],
        ['population average (13/16)⁴⁰', pct((13 / 16) ** 40)],
      ]),
      el('div', { class: 'scroll-x', style: 'margin-top:12px' }, [el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'i' }), el('th', { class: 'left', text: `address at ${wallet.template}` }), el('th', { text: 'L' }), el('th', { text: '2^−L' })])]),
        el('tbody', {}, rows),
        el('tfoot', {}, [el('tr', {}, [el('td', {}), el('td', { class: 'left', text: 'mean of these ten' }), el('td', { text: (sumL / 10).toFixed(1) }), el('td', { text: pct(sum / 10) })])]),
      ])]),
    ],
    why: 'the strength of EIP-55 is not a fixed number: it depends on how many letters the address happens to contain.',
    notes: [
      'Each hex character is a letter with probability 6/16, so <span class="eq">L ~ Binomial(40, 6/16)</span> with mean 15. Each letter is one check bit; digits carry none.',
      'The average failure probability is <span class="eq">E[2^−L] = (10/16 + 6/16·½)⁴⁰ = (13/16)⁴⁰ ≈ 0.0247 %</span>, about eight times <span class="eq">2^−15 ≈ 0.003 %</span>. By Jensen’s inequality the mean of a convex function exceeds the function of the mean: the letter-poor addresses dominate the average, as the last column shows.',
    ],
  });
}

/* ---------- exposure ---------- */

function exposurePanel(run) {
  const Q = run.account.Q;
  return stepCard({
    title: 'When the public key stops being hidden', cats: ['hashing', 'publickey'],
    formula: 'address = Keccak-256(Q)[12…31] &nbsp;is one-way; &nbsp;Q = ecrecover(message hash, r, s, v) &nbsp;is public after one signature',
    body: [
      el('div', { class: 'cols' }, [
        el('div', {}, [el('h3', { text: 'before the first outgoing transaction' }), facts([['public', 'the address only (20 bytes)'], ['to attack the key', 'invert Keccak, then the ECDLP']]), el('p', { class: 'small', style: 'margin-top:8px', text: run.checksum.checksummed })]),
        el('div', {}, [el('h3', { text: 'after it' }), facts([['public', 'Q itself (recovered from the signature)'], ['to attack the key', 'the ECDLP alone, ≈ 2¹²⁸']]), el('p', { class: 'small hex', style: 'margin-top:8px', text: compressedHex(Q) })]),
      ]),
    ],
    why: 'the hash layer protects only addresses that have never signed anything.',
    notes: [
      'Ethereum transactions carry no public key: nodes <em>recover</em> it from the signature <span class="eq">(r, s, v)</span> and hash it to check the sender. So the first outgoing transaction publishes <span class="eq">Q = ' + ethereumHex(Q).slice(0, 8) + '…</span> forever.',
      'Before that, an attacker would need a preimage of Keccak-256 (about 2¹⁶⁰ work) just to learn <span class="eq">Q</span>. After it, only the discrete logarithm stands between <span class="eq">Q</span> and <span class="eq">k</span>.',
      'PRACTICE: This matters for a future quantum computer: Shor’s algorithm needs <span class="eq">Q</span>. Coins sitting at never-used addresses would be safer than accounts that have signed, which is part of the case for fresh addresses and for post-quantum migration plans.',
    ],
  });
}

/* ---------- the page ---------- */

startPage({
  shell: hw02Shell('address.html'),
  sticky: WALLET_KEYS,
  memory: WALLET_MEMORY,
  render: async ({ state, update }) => {
    const { wallet, run } = await loadWallet(state);
    const input = walletInput({ wallet, update });
    if (!run) return [input, spongePanel(state, update)];
    return [
      input,
      spongePanel(state, update),
      typoPanel(run),
      await checkBitsPanel(run, wallet),
      exposurePanel(run),
    ];
  },
});
