/* wallet-lab-page.js — the safe wallet lab (spec §6.9, note 00 "Hands-on lab"):
   how to check the pipeline against real wallet software using only the public
   test mnemonic on a testnet, the values to expect (computed here, live), and
   a checklist to fill in during the experiment — kept in this browser,
   exportable. This page never asks for, accepts or stores a seed phrase. */

import { el } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { load, save } from '../../../assets/js/ui/store.js';
import { toCSV, download } from '../../../assets/js/ui/export.js';
import { loadWordlist, Mnemonic } from '../core/bip39.js';
import { HDNode, PATH_PRESETS, fillPath } from '../core/bip32.js';
import { EthAccount } from '../core/address.js';
import { stepCard } from './widgets.js';
import { hw02Shell } from './shell.js';

const TEST_PHRASE = `${'abandon '.repeat(11)}about`;
const KEY = 'hw02.wallet-lab';

/** The checklist's columns: [key, heading, kind]. */
const COLUMNS = [
  ['wallet', 'wallet & version', 'text'],
  ['imported', 'test mnemonic imported on a testnet', 'yn'],
  ['account1', 'account 1 = 0x9858EfFD…EcaEda94', 'yn'],
  ['accounts23', 'accounts 2–3 match which path above?', 'text'],
  ['passphrase', 'passphrase supported; every address changed', 'yn'],
  ['lowercase', 'all-lowercase address accepted in “send”', 'yn'],
  ['brokenCase', 'one-letter-case-flipped address: warned?', 'yn'],
  ['notes', 'notes', 'text'],
];
const STARTERS = ['MetaMask', 'Rabby', 'Exodus', 'Rainbow'];

/* ---------- expected values ---------- */

async function expectedPanel() {
  const wordlist = await loadWordlist();
  const m = Mnemonic.fromWords(TEST_PHRASE, wordlist);
  const masters = { '': (await HDNode.fromSeed(await m.toSeed(''))).node, TREZOR: (await HDNode.fromSeed(await m.toSeed('TREZOR'))).node };
  const rows = [];
  for (const p of PATH_PRESETS) {
    for (let i = 0; i < 3; i++) {
      const path = fillPath(p.template, i);
      const a = new EthAccount((await masters[''].derive(path)).node.privateKey).checksumAddress();
      rows.push(el('tr', {}, [el('td', { class: 'left', text: p.label }), el('td', { class: 'left', text: `account ${i + 1}` }), el('td', { class: 'left', text: path }), el('td', { class: 'left', text: a })]));
    }
  }
  const first = new EthAccount((await masters[''].derive(fillPath(PATH_PRESETS[0].template, 0))).node.privateKey).checksumAddress();
  const withPass = new EthAccount((await masters.TREZOR.derive(fillPath(PATH_PRESETS[0].template, 0))).node.privateKey).checksumAddress();
  // one letter with its case flipped: the paste test of step 6
  const at = [...first.slice(2)].findIndex((c) => /[a-fA-F]/.test(c)) + 2;
  const flipped = first.slice(0, at) + (first[at] === first[at].toLowerCase() ? first[at].toUpperCase() : first[at].toLowerCase()) + first.slice(at + 1);

  return stepCard({
    title: 'What the wallets should show', cats: ['derivation', 'checksum'],
    body: [
      el('p', { class: 'small muted', text: `Computed here from the public test mnemonic “${TEST_PHRASE}”, no passphrase. The paths are as commonly documented — the point of the lab is to check them.` }),
      el('div', { class: 'scroll-x' }, [el('table', { class: 'data compare prose' }, [
        el('thead', {}, [el('tr', {}, ['wallet (documented)', 'account', 'path', 'address'].map((h) => el('th', { class: 'left', text: h })))]),
        el('tbody', {}, rows),
      ])]),
      el('h3', { text: 'For the passphrase and paste tests' }),
      el('ul', { class: 'facts' }, [
        el('li', {}, [el('span', { class: 'k', text: 'account 1 with passphrase “TREZOR”' }), el('span', { class: 'v', text: withPass })]),
        el('li', {}, [el('span', { class: 'k', text: 'account 1, all lowercase (no checksum)' }), el('span', { class: 'v', text: first.toLowerCase() })]),
        el('li', {}, [el('span', { class: 'k', text: `account 1, case of character ${at - 1} flipped (invalid EIP-55)` }), el('span', { class: 'v', text: flipped })]),
      ]),
    ],
    why: 'a wallet that shows these addresses for these words is running exactly the pipeline of these pages.',
  });
}

/* ---------- the guide ---------- */

function guidePanel() {
  const steps = [
    ['Use a separate browser profile.', 'Create a new, empty profile (or a separate browser) used only for this lab, so no real wallet or extension shares it.'],
    ['Install open-source wallets.', 'Rabby and MetaMask are open-source browser extensions; install them only from their official sites or stores. Exodus and Rainbow can be compared too.'],
    ['Import the test mnemonic only, and switch to a testnet.', `Import “${TEST_PHRASE}” and select a test network (for example Sepolia). This phrase is public: bots drain anything sent to it within seconds. Never put real funds on it.`],
    ['Compare the addresses with the table above.', 'Account 1 should be 0x9858EfFD…EcaEda94 in every standard wallet. Accounts 2 and 3 tell you which path the wallet uses: the second account is where MetaMask and Ledger Live part ways.'],
    ['Add a passphrase and watch every address change.', 'Some wallets call it the “25th word”. With “TREZOR”, account 1 must become the address in the table — and nothing will tell you a passphrase is “wrong”.'],
    ['Paste the lowercase and the broken-case addresses into “send”.', 'Note which wallets accept the all-lowercase address silently (EIP-55 treats it as “no checksum”) and which warn about the flipped letter. Do not send anything.'],
  ];
  return stepCard({
    title: 'The experiment, step by step', cats: [],
    body: el('ol', {}, steps.map(([head, text]) => el('li', { style: 'margin-bottom:8px' }, [el('strong', { text: head }), ' ', text]))),
    why: 'it checks the pages against software that holds real money — without ever putting a real secret at risk.',
    notes: [
      'For an offline, step-by-step view, Ian Coleman’s open-source BIP-39 tool can be downloaded as a single HTML file and opened with the network disconnected. Read its source before trusting it.',
      'PRACTICE: The single rule that matters: a real seed phrase is never typed into a website, a browser extension you are testing, a screenshot, a cloud note or a chat. Not here, not anywhere.',
    ],
  });
}

/* ---------- the checklist ---------- */

function checklistPanel(update) {
  const rows = load(KEY, null) ?? STARTERS.map((w) => ({ wallet: w }));
  const store = () => save(KEY, rows);
  const cell = (row, [key, , kind]) => {
    if (kind === 'yn') {
      return el('select', { 'aria-label': key, onchange: (e) => { row[key] = e.target.value; store(); } }, ['', 'yes', 'no', 'n/a'].map((v) => el('option', { value: v, text: v || '—', selected: (row[key] ?? '') === v })));
    }
    return el('input', { type: 'text', value: row[key] ?? '', 'aria-label': key, style: `width:${key === 'notes' ? 22 : 13}ch`, oninput: (e) => { row[key] = e.target.value; store(); } });
  };
  return stepCard({
    title: 'Your checklist', cats: [],
    body: [
      el('p', { class: 'small muted', text: 'Fill it in while you test. It is kept in this browser only and contains no secret — there is no field for one.' }),
      el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose checklist' }, [
        el('thead', {}, [el('tr', {}, [...COLUMNS.map(([, h]) => el('th', { class: 'left', text: h })), el('th', {})])]),
        el('tbody', {}, rows.map((row, r) => el('tr', {}, [
          ...COLUMNS.map((c) => el('td', { class: 'left' }, [cell(row, c)])),
          el('td', {}, [el('button', { type: 'button', text: 'remove', onclick: () => { rows.splice(r, 1); store(); update({}); } })]),
        ]))),
      ])]),
      el('div', { class: 'row', style: 'margin-top:12px' }, [
        el('button', { type: 'button', text: 'Add a wallet', onclick: () => { rows.push({ wallet: '' }); store(); update({}); } }),
        el('button', { type: 'button', text: 'Export CSV', onclick: () => download('hw02-wallet-lab.csv', toCSV(rows.map((x) => Object.fromEntries(COLUMNS.map(([k]) => [k, x[k] ?? ''])))), 'text/csv') }),
        el('button', { type: 'button', text: 'Export JSON', onclick: () => download('hw02-wallet-lab.json', JSON.stringify(rows, null, 2), 'application/json') }),
      ]),
    ],
    why: 'the results become evidence for the essay (requirement R5) — an observation, labelled as such.',
  });
}

startPage({
  shell: hw02Shell('wallet-lab.html'),
  render: async ({ update }) => [guidePanel(), await expectedPanel(), checklistPanel(update)],
});
