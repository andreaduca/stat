/* bip32.js — BIP-32 (2012) hierarchical deterministic keys and BIP-44 (2014)
   paths. Category: DERIVATION. One 64-byte seed becomes an unlimited tree of
   key pairs; every node is (private key k, chain code c), and a child is
   computed from its parent with HMAC-SHA512 plus one addition mod n.
   Note 03; [[HMAC]], HMWK 1 note 02 (homomorphisms).

   The two derivation functions, for child index i (32 bits):
     CKDpriv  I = HMAC-SHA512(key = c_par, data)
              data = 0x00 ‖ ser256(k_par) ‖ ser32(i)   if i ≥ 2³¹ (hardened, written i')
              data = serP(k_par·G) ‖ ser32(i)           otherwise (normal; 33-byte compressed key)
              k_i = (I_L + k_par) mod n,   c_i = I_R
     CKDpub   K_i = I_L·G + K_par                        (normal children only)
   CKDpub works because (a + b)G = aG + bG: the curve's homomorphism lets public
   children be computed from public data. The same linearity is the
   "xpub + child key" leak, k_par = k_i − I_L mod n — hardening stops both. */

import { bytesToHex, bytesToBigInt, bigIntToBytes, concat, hexToBytes, ser32, utf8 } from './bytes.js';
import { hmacSha512 } from './hash.js';
import { N, publicKey, mulG, add, compressedHex } from './secp256k1.js';

export const HARDENED = 0x80000000;   // 2³¹: indices from here on are hardened

/** Probability that a derivation hits an invalid key (I_L ≥ n, or k_i = 0):
 *  (2²⁵⁶ − n) / 2²⁵⁶ ≈ 3.73·10⁻³⁹ ≈ 2^−127.6. Never observed; the rule below
 *  ("skip to the next index") exists for completeness. */
export const INVALID_CHILD_PROBABILITY = Number(2n ** 256n - N) / 2 ** 256;

/** BIP-44 paths as wallets use them, with {i} where the account number goes.
 *  As commonly documented — verify against the wallet before relying on one. */
export const PATH_PRESETS = [
  { id: 'metamask', label: 'MetaMask / Rabby', template: "m/44'/60'/0'/0/{i}" },
  { id: 'ledger', label: 'Ledger Live', template: "m/44'/60'/{i}'/0/0" },
  { id: 'legacy', label: 'legacy MEW / old Ledger', template: "m/44'/60'/0'/{i}" },
];

/** BIP-44 level names, m / purpose' / coin_type' / account' / change / address_index. */
export const BIP44_LEVELS = ['purpose', 'coin type', 'account', 'change', 'address index'];

export const fillPath = (template, i) => template.replaceAll('{i}', String(i));

/** "m/44'/60'/0'/0/0" -> [{index, hardened, label}]. ' or h marks hardened. */
export function parsePath(path) {
  const parts = path.trim().split('/');
  if (parts[0] !== 'm') throw new Error('a path starts with m');
  return parts.slice(1).map((part) => {
    const match = /^(\d+)(['hH]?)$/.exec(part);
    if (!match) throw new Error(`"${part}" is not a path level`);
    const n = Number(match[1]);
    if (n >= HARDENED) throw new Error(`${n} is too large: indices are below 2³¹, and ' adds 2³¹`);
    const hardened = match[2] !== '';
    return { index: hardened ? n + HARDENED : n, hardened, label: `${n}${hardened ? "'" : ''}` };
  });
}

export const indexLabel = (i) => (i >= HARDENED ? `${i - HARDENED}'` : String(i));

export class HDNode {
  /** privateKey: bigint or null (a public-only node, i.e. what an xpub carries);
   *  publicKey: secp256k1 Point; chainCode: 32 bytes. */
  constructor({ privateKey = null, publicKey: pub = null, chainCode, depth = 0, index = 0, path = 'm' }) {
    this.privateKey = privateKey;
    this._publicKey = pub;
    this.chainCode = chainCode;
    this.depth = depth;
    this.index = index;
    this.path = path;
  }

  /** K = kG, computed on first use. */
  get publicKey() { return (this._publicKey ??= publicKey(this.privateKey)); }

  /** The public twin: same public key and chain code, no private key. This
   *  pair is what an xpub serialises; it can derive normal children only. */
  neuter() {
    return new HDNode({ publicKey: this.publicKey, chainCode: this.chainCode, depth: this.depth, index: this.index, path: this.path });
  }

  /** Master node. I = HMAC-SHA512(key = "Bitcoin seed", data = seed);
   *  k_m = I_L, c_m = I_R. "Bitcoin seed" is only a fixed domain-separation
   *  key; Ethereum wallets use the same string. Returns the node and its trace. */
  static async fromSeed(seed) {
    const hmacKey = utf8('Bitcoin seed');
    const I = await hmacSha512(hmacKey, seed);
    const IL = I.slice(0, 32), IR = I.slice(32);
    const k = bytesToBigInt(IL);
    if (k === 0n || k >= N) throw new Error('invalid master key (probability ≈ 2^−127): use another seed');
    const node = new HDNode({ privateKey: k, chainCode: IR });
    return { node, trace: { level: 0, hmacKey, hmacData: seed, IL, IR, childKey: k, category: 'derivation' } };
  }

  /** The HMAC input for child i — the line that separates hardened from normal. */
  hmacData(i) {
    if (i >= HARDENED) {
      if (this.privateKey === null) throw new Error('a hardened child needs the parent private key');
      return concat(new Uint8Array([0]), bigIntToBytes(this.privateKey), ser32(i));
    }
    return concat(hexToBytes(compressedHex(this.publicKey)), ser32(i));
  }

  /** CKDpriv: private parent → private child.
   *  If I_L ≥ n or k_i = 0 the key is invalid and BIP-32 says to proceed with
   *  the next index; `skipped` counts how often that happened (in practice 0). */
  async ckdPriv(i) {
    let skipped = 0;
    for (;;) {
      const hmacData = this.hmacData(i);
      const I = await hmacSha512(this.chainCode, hmacData);
      const IL = I.slice(0, 32), IR = I.slice(32);
      const il = bytesToBigInt(IL);
      const k = (il + this.privateKey) % N;          // k_i = I_L + k_par mod n
      if (il < N && k !== 0n) {
        const node = new HDNode({ privateKey: k, chainCode: IR, depth: this.depth + 1, index: i, path: `${this.path}/${indexLabel(i)}` });
        return { node, step: { level: node.depth, index: i, hardened: i >= HARDENED, hmacKey: this.chainCode, hmacData, IL, IR, childKey: k, skipped, category: 'derivation' } };
      }
      skipped++; i++;
    }
  }

  /** CKDpub: public parent → public child, K_i = I_L·G + K_par.
   *  Only for normal indices: a hardened HMAC input contains k_par itself. */
  async ckdPub(i) {
    if (i >= HARDENED) throw new Error('CKDpub cannot derive a hardened child: its HMAC input needs the parent private key');
    const hmacData = this.hmacData(i);
    const I = await hmacSha512(this.chainCode, hmacData);
    const IL = I.slice(0, 32), IR = I.slice(32);
    const K = add(mulG(bytesToBigInt(IL)), this.publicKey);
    const node = new HDNode({ publicKey: K, chainCode: IR, depth: this.depth + 1, index: i, path: `${this.path}/${indexLabel(i)}` });
    return { node, step: { level: node.depth, index: i, hardened: false, hmacKey: this.chainCode, hmacData, IL, IR, childKey: null, category: 'derivation' } };
  }

  /** Walk a path from this node, one CKD per level. With a private key every
   *  level uses CKDpriv; a public-only node uses CKDpub (and fails on '). */
  async derive(path) {
    let node = this;
    const trace = [];
    for (const { index } of parsePath(path)) {
      const { node: child, step } = node.privateKey !== null ? await node.ckdPriv(index) : await node.ckdPub(index);
      trace.push(step);
      node = child;
    }
    return { node, trace };
  }
}

/** The xpub + child-key leak (note 03 §3) — the attack CKDpub makes possible.
 *  The attacker holds the parent's public data (K_par, c_par), i.e. its xpub,
 *  and one leaked private key k_i of a NORMAL child. It recomputes
 *    I_L = left half of HMAC-SHA512(c_par, serP(K_par) ‖ ser32(i))
 *  exactly as the wallet did — everything in it is public — and solves the
 *  one linear equation k_i = I_L + k_par (mod n) for the unknown:
 *    k_par = (k_i − I_L) mod n.
 *  From k_par it derives every sibling. A hardened child cannot be attacked:
 *  its HMAC input contains k_par itself, so I_L cannot even be computed —
 *  `xpub.hmacData(i)` throws, and that refusal is the defence. */
export async function recoverParentKey(xpub, i, childKey) {
  const I = await hmacSha512(xpub.chainCode, xpub.hmacData(i));
  const IL = bytesToBigInt(I.slice(0, 32));
  return { IL, parentKey: (((childKey - IL) % N) + N) % N };
}

/** Hex helpers for display. */
export const keyHex = (k) => (k === null ? '' : bytesToHex(bigIntToBytes(k)));
