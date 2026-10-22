/* bip32-page.js — the BIP-32/44 lab: the first levels of the key tree with
   hardened and normal edges drawn differently, a watch-only wallet deriving
   addresses from an xpub alone, the xpub + child-key leak (and why hardening
   stops it), and the same words under three wallets' paths. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { bytesToHex } from '../core/bytes.js';
import { HDNode, HARDENED, PATH_PRESETS, fillPath, parsePath, keyHex, recoverParentKey, BIP44_LEVELS } from '../core/bip32.js';
import { compressedHex } from '../../../assets/js/core/secp256k1.js';
import { EthAccount } from '../core/address.js';
import { loadWallet, walletInput, WALLET_KEYS, WALLET_MEMORY } from './wallet-input.js';
import { stepCard, hexValue, facts } from './widgets.js';
import { hw02Shell } from './shell.js';

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, kids = []) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const kid of kids) node.append(kid);
  return node;
};
const text = (attrs, content) => { const t = svg('text', attrs); t.textContent = content; return t; };

/* The part of the tree drawn: the BIP-44 trunk for Ether, two accounts, the
   external and change branches of account 0, and its first five addresses. */
const TREE = ['m', "m/44'", "m/44'/60'", "m/44'/60'/0'", "m/44'/60'/1'", "m/44'/60'/0'/0", "m/44'/60'/0'/1",
  ...[0, 1, 2, 3, 4].map((i) => `m/44'/60'/0'/0/${i}`)];
const PARENT = "m/44'/60'/0'/0";                       // the branch of the watch-only and leak demos

const short = (a) => `${a.slice(0, 8)}…${a.slice(-6)}`;

/** Derive every node of TREE, each from its parent (one CKDpriv per edge). */
async function deriveTree(master) {
  const nodes = new Map([['m', master]]);
  for (const path of TREE.slice(1)) {
    const cut = path.lastIndexOf('/');
    const parent = nodes.get(path.slice(0, cut));
    nodes.set(path, (await parent.ckdPriv(parsePath('m' + path.slice(cut))[0].index)).node);
  }
  return nodes;
}

/* ---------- the tree ---------- */

function treePanel(nodes, selected, update) {
  // leaves left to right, parents centred over their children
  const kids = (p) => TREE.filter((q) => q.startsWith(p + '/') && q.split('/').length === p.split('/').length + 1);
  const pos = new Map();
  let leaf = 0;
  const place = (p) => {
    const depth = p.split('/').length - 1;
    const c = kids(p);
    c.forEach(place);
    const x = c.length ? c.reduce((s, q) => s + pos.get(q).x, 0) / c.length : 60 + 96 * leaf++;
    pos.set(p, { x, y: 30 + depth * 64 });
  };
  place('m');
  const width = 60 + 96 * leaf, height = 30 + 5 * 64 + 44;

  const edges = TREE.slice(1).map((p) => {
    const a = pos.get(p.slice(0, p.lastIndexOf('/'))), b = pos.get(p);
    return svg('line', { class: `edge ${p.endsWith("'") ? 'h' : 'n'}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  });
  const dots = TREE.map((p) => {
    const { x, y } = pos.get(p);
    const label = p === 'm' ? 'm' : p.slice(p.lastIndexOf('/') + 1);
    const g = svg('g', { class: `node${p === selected ? ' sel' : ''}`, tabindex: 0, role: 'button', 'aria-label': p }, [
      svg('circle', { cx: x, cy: y, r: 17 }),
      text({ x, y: y + 4, 'text-anchor': 'middle', class: 'lbl' }, label),
    ]);
    if (p.split('/').length === 6) g.append(text({ x, y: y + 33, 'text-anchor': 'middle', class: 'addr' }, short(new EthAccount(nodes.get(p).privateKey).checksumAddress())));
    g.addEventListener('click', () => update({ node: p }));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') update({ node: p }); });
    return g;
  });

  const node = nodes.get(selected);
  const levels = selected.split('/').slice(1);
  const account = new EthAccount(node.privateKey);
  return stepCard({
    title: 'The key tree', cats: ['derivation'],
    formula: 'each edge: I = HMAC-SHA512(c<sub>par</sub>, data), &nbsp;k<sub>i</sub> = I<sub>L</sub> + k<sub>par</sub> mod n, &nbsp;c<sub>i</sub> = I<sub>R</sub>',
    body: [
      el('div', { class: 'scroll-x' }, [el('div', { class: 'tree' }, [svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'BIP-44 key tree' }, [...edges, ...dots])])]),
      el('div', { class: 'legend' }, [
        el('span', { html: '<i class="ln h"></i>hardened edge (i’ ≥ 2³¹): needs the parent private key' }),
        el('span', { html: '<i class="ln n"></i>normal edge: derivable from the parent public key' }),
      ]),
      el('h3', { html: `Node <span class="eq">${selected}</span>${levels.length ? ` — ${BIP44_LEVELS[levels.length - 1]}` : ' — the master'}` }),
      hexValue('private key k', keyHex(node.privateKey)),
      hexValue('chain code c', bytesToHex(node.chainCode)),
      hexValue('public key K (compressed)', compressedHex(node.publicKey)),
      facts([['address of this key', account.checksumAddress()]]),
    ],
    why: 'one backup must cover every key, past and future, and different wallets must find the same ones.',
    notes: [
      'Click a node. Every node is a full key pair plus a chain code; only the leaves at depth 5 are used as Ethereum accounts, but the inner nodes are keys too. The tree is unlimited — 2³¹ normal and 2³¹ hardened children under every node — and nothing is stored: each node is recomputed from the seed on demand.',
      'BIP-44 assigns meaning to the levels: purpose 44’, coin type 60’ (Ether, from the SLIP-44 registry; Bitcoin is 0’), account, change (always 0 on Ethereum, which has no change outputs), and the address index.',
      'The top three levels are hardened so that a leaked account-level xpub, combined with one leaked child key, cannot climb to other accounts, other coins or the master key.',
    ],
  });
}

/* ---------- watch-only ---------- */

async function watchPanel(nodes) {
  const parent = nodes.get(PARENT);
  const xpub = parent.neuter();                  // public key + chain code, no private key
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const viaPub = (await xpub.ckdPub(i)).node.publicKey;
    const viaPriv = (await parent.ckdPriv(i)).node;
    const a = new EthAccount(viaPriv.privateKey);
    const same = viaPub.x === a.Q.x && viaPub.y === a.Q.y;
    rows.push(el('tr', {}, [
      el('td', { text: i }),
      el('td', { class: 'left', text: new EthAccount(viaPriv.privateKey).checksumAddress() }),
      el('td', { class: same ? 'ok' : 'err', text: same ? 'same key ✓' : 'differs ✗' }),
    ]));
  }
  return stepCard({
    title: 'Watch-only wallet: addresses from an xpub', cats: ['derivation', 'publickey'],
    formula: 'K<sub>i</sub> = I<sub>L</sub>·G + K<sub>par</sub> &nbsp;because&nbsp; (I<sub>L</sub> + k<sub>par</sub>)·G = I<sub>L</sub>·G + k<sub>par</sub>·G',
    body: [
      el('p', { class: 'small muted', html: `The xpub of <span class="eq">${PARENT}</span> is just its public key and chain code — no private key anywhere:` }),
      hexValue('K_par (compressed)', compressedHex(xpub.publicKey)),
      hexValue('c_par', bytesToHex(xpub.chainCode)),
      el('div', { class: 'scroll-x' }, [el('table', { class: 'data' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'i' }), el('th', { class: 'left', text: 'address derived from the xpub alone (CKDpub)' }), el('th', { text: 'vs CKDpriv' })])]),
        el('tbody', {}, rows),
      ])]),
    ],
    why: 'a shop server can generate a fresh receiving address for every order without ever holding a key that can spend.',
    notes: [
      'CKDpub multiplies the private formula by <span class="eq">G</span>. Because scalar multiplication is a homomorphism, <span class="eq">(a + b)G = aG + bG</span>, the public child is the public parent plus <span class="eq">I_L·G</span>, and <span class="eq">I_L</span> depends only on public data for a normal index. The last column checks it against the private derivation.',
      'This is structure used as a feature: hw01’s group law, at 256 bits, giving watch-only wallets, accounting software and auditors a read-only view.',
      'PRACTICE: An xpub is not secret enough to spend but is a privacy goldmine: whoever holds it can list every address of the branch and link them to one owner. Treat it almost like a private key.',
    ],
  });
}

/* ---------- leak ---------- */

async function leakPanel(nodes, state, update) {
  const parent = nodes.get(PARENT);
  const xpub = parent.neuter();
  const j = Math.max(0, Math.min(1000, parseInt(state.leak ?? '5', 10) || 0));
  const t = Math.max(0, Math.min(1000, parseInt(state.sib ?? '0', 10) || 0));

  const leaked = (await parent.ckdPriv(j)).node.privateKey;            // the one key that leaked
  const { IL, parentKey } = await recoverParentKey(xpub, j, leaked);   // the attack
  const sibling = (await parent.ckdPriv(t)).node.privateKey;           // the truth, for comparison
  // the attacker's rebuilt parent: recovered private key + the public chain code
  const rebuilt = new HDNode({ privateKey: parentKey, chainCode: xpub.chainCode, depth: xpub.depth, path: PARENT });
  const forged = (await rebuilt.ckdPriv(t)).node.privateKey;

  let hardenedError = '';
  try { xpub.hmacData(HARDENED + j); } catch (e) { hardenedError = e.message; }

  const jIn = el('input', { type: 'number', class: 'num', min: 0, value: String(j), id: 'in-leak' });
  const tIn = el('input', { type: 'number', class: 'num', min: 0, value: String(t), id: 'in-sib' });
  const ok = (good) => el('span', { class: good ? 'ok' : 'err', text: good ? '✓ equal' : '✗ different' });

  return stepCard({
    title: 'The xpub + child-key leak', cats: ['derivation'],
    formula: 'k<sub>par</sub> = (k<sub>j</sub> − I<sub>L</sub>) mod n, &nbsp;with I<sub>L</sub> = HMAC-SHA512(c<sub>par</sub>, serP(K<sub>par</sub>) ‖ ser32(j))<sub>L</sub> computed from public data',
    body: [
      el('div', { class: 'row' }, [
        field('leaked child j', jIn),
        field('sibling to steal t', tIn),
        el('button', { class: 'primary', type: 'button', text: 'Apply', onclick: () => update({ leak: jIn.value, sib: tIn.value }) }),
      ]),
      el('p', { class: 'small muted', style: 'margin-top:12px', html: `The attacker holds the xpub of <span class="eq">${PARENT}</span> (above) and the private key of child ${j}, nothing else.` }),
      hexValue(`leaked k_${j}`, keyHex(leaked)),
      hexValue('I_L, recomputed from the xpub', keyHex(IL)),
      hexValue('recovered k_par = k_j − I_L mod n', keyHex(parentKey)),
      el('p', { class: 'small' }, ['compared with the real parent key: ', ok(parentKey === parent.privateKey)]),
      hexValue(`sibling k_${t}, derived from the recovered parent`, keyHex(forged)),
      el('p', { class: 'small' }, [`compared with the real k_${t}: `, ok(forged === sibling), ` — address ${new EthAccount(forged).checksumAddress()}`]),
      el('h3', { text: 'The same attack on a hardened child' }),
      el('p', { class: 'formula', html: `data = 0x00 ‖ <span style="color:var(--diff)">k<sub>par</sub> = ????????</span> ‖ ser32(${j} + 2³¹)` }),
      el('p', { class: 'err', text: `Refused: ${hardenedError}. Without I_L there is no equation to solve.` }),
    ],
    why: 'it shows the price of the structure that makes watch-only wallets possible, and why the top levels are hardened.',
    notes: [
      'The attack is one subtraction. Everything inside the HMAC for a normal child — the parent public key, the chain code, the index — is in the xpub, so the attacker computes the same <span class="eq">I_L</span> as the wallet and solves one linear equation for <span class="eq">k_par</span>. From the parent it derives every sibling.',
      'For a hardened child the HMAC input starts with the parent <em>private</em> key: <span class="eq">I_L</span> cannot be computed, and the equation never exists. That is why BIP-44 hardens purpose, coin and account: the leak can reach at most the one branch below an exposed xpub.',
      'This is the clearest case of “structure creates attack surface”: the same linearity is the feature (CKDpub) and the bug (this leak). The essay’s structure-versus-hashes argument starts here.',
    ],
  });
}

/* ---------- wallet presets ---------- */

async function presetsPanel(master) {
  const columns = [];
  for (const p of PATH_PRESETS) {
    const cells = [];
    for (let i = 0; i < 5; i++) {
      const path = fillPath(p.template, i);
      const { node } = await master.derive(path);
      cells.push({ path, address: new EthAccount(node.privateKey).checksumAddress() });
    }
    columns.push(cells);
  }
  const mm = columns[0];
  const rows = [0, 1, 2, 3, 4].map((i) => el('tr', {}, [
    el('td', { text: i }),
    ...columns.map((col, c) => {
      const same = c > 0 && col[i].address === mm[i].address;
      return el('td', { class: `left${same ? ' ok' : ''}`, title: col[i].path, html: `${short(col[i].address)}<br><span class="muted small">${col[i].path}</span>${same ? ' <span class="small">= MetaMask</span>' : ''}` });
    }),
  ]));
  return stepCard({
    title: 'Same words, three wallets', cats: ['derivation'],
    formula: "MetaMask m/44'/60'/0'/0/i &nbsp;·&nbsp; Ledger Live m/44'/60'/i'/0/0 &nbsp;·&nbsp; legacy m/44'/60'/0'/i",
    body: el('div', { class: 'scroll-x' }, [el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'account i' }), ...PATH_PRESETS.map((p) => el('th', { class: 'left', text: p.label }))])]),
      el('tbody', {}, rows),
    ])]),
    why: 'BIP-44 fixes the meaning of each level, but wallets disagree on which level counts “accounts”.',
    notes: [
      'For <span class="eq">i = 0</span> MetaMask and Ledger Live land on the same node, <span class="eq">m/44’/60’/0’/0/0</span>; from account 1 on they diverge, because one increments the address index and the other the account level. The legacy path is a different node altogether.',
      'Importing the same words into another wallet and seeing an “empty” second account is almost always this path mismatch, not lost funds. BIP-44 asks wallets to scan until 20 consecutive unused addresses (the gap limit).',
      'PRACTICE: These paths are as commonly documented, not verified against each wallet here — check them with the test mnemonic in the wallet itself before relying on them.',
    ],
  });
}

/* ---------- the page ---------- */

startPage({
  shell: hw02Shell('bip32.html'),
  sticky: WALLET_KEYS,
  memory: WALLET_MEMORY,
  render: async ({ state, update }) => {
    const { wallet, run } = await loadWallet(state);
    const input = walletInput({ wallet, update });
    if (!run) return [input];
    const nodes = await deriveTree(run.master);
    const selected = TREE.includes(state.node) ? state.node : "m/44'/60'/0'/0/0";
    return [
      input,
      treePanel(nodes, selected, update),
      await watchPanel(nodes),
      await leakPanel(nodes, state, update),
      await presetsPanel(run.master),
    ];
  },
});
