/* toy-dock.js — hw03's input dock (assets/js/ui/dock.js), the same on every
   page: the message every cipher encrypts, the key range 2^bits and the toy
   key d. A page adds its own controls (Caesar's k, the ciphertext to break)
   as a section of its own underneath. All of it lives in the URL and in the
   shared memory, so the attack pages break what the other pages made. */

import { el, field, fmt } from '../../../assets/js/ui/dom.js';
import { inputDock, show, onCommit } from '../../../assets/js/ui/dock.js';
import { keygen } from '../core/elgamal.js';
import { normalise } from '../core/caesar.js';
import { loadModel } from '../core/data.js';
import { BITS, DEFAULT_MSG, clampBits } from './toykey.js';

const short = (t, n) => (t.length > n ? `${t.slice(0, n)}…` : t);

const SHARED = {
  id: 'toy',
  build(apply, later) {
    const msg = el('input', { class: 'wide', spellcheck: 'false', 'aria-label': 'message' });
    const bits = el('input', { type: 'number', class: 'num', min: BITS.min, max: BITS.max, 'aria-label': 'key range bits' });
    onCommit(msg, () => apply({ msg: msg.value }), later);
    onCommit(bits, () => apply({ bits: clampBits(bits.value) }), later);
    const newKey = () => { const b = clampBits(bits.value); apply({ bits: b, d: String(keygen(b).d) }); };

    /* the second preset is a paragraph of the test corpus: its label and text come with the model */
    let paragraph = null;
    const para = el('button', { type: 'button', text: 'A paragraph of a novel', disabled: true, onclick: () => paragraph && apply({ msg: paragraph }) });
    loadModel().then((m) => {
      paragraph = m.sample.text;
      para.textContent = `${m.sample.source.split(', ')[1]} paragraph`;
      para.title = `a paragraph of ${m.sample.source}, ${normalise(paragraph).length} letters`;
      para.disabled = false;
    }).catch(() => { para.textContent = 'the paragraph could not be loaded'; });

    return {
      nodes: [
        el('div', { class: 'row' }, [
          field('message (every page encrypts it)', msg),
          el('button', { type: 'button', class: 'primary', text: 'Apply', onclick: () => apply({ msg: msg.value, bits: clampBits(bits.value) }) }),
          el('button', { type: 'button', text: `“${DEFAULT_MSG}”`, onclick: () => apply({ msg: DEFAULT_MSG }) }),
          para,
          el('div', { class: 'vrule' }),
          field('key range: d ≤ 2^bits', bits),
          el('button', { type: 'button', text: 'New key', onclick: newKey }),
        ]),
      ],
      refresh(v) {
        show(msg, v.msg);
        show(bits, v.bits);
      },
    };
  },
  summary: (v) => `“${short(v.msg.replace(/\s+/g, ' '), 28)}” · d ≤ 2^${v.bits} · d = ${fmt(v.d)}`,
  notes: [
    '<strong>The message</strong> is shared by every page: the Toy ECC and Caesar pages encrypt the same text, Break Caesar can encrypt it with a random key, and Compare puts the two ciphers side by side. The paragraph is long enough for the histograms to take shape. It applies when you leave the field or press Enter (or Apply).',
    '<strong>The key range</strong> is the toy restriction: <span class="eq">d</span> is drawn with the CSPRNG from <span class="eq">[1, 2^bits]</span> instead of <span class="eq">[1, n − 1]</span>, n ≈ 2²⁵⁶. A 20-bit key means about a million candidates, and the Break toy ECC page searches them: brute force doubles with every extra bit, the other two searches grow by √2. <strong>New key</strong> draws another <span class="eq">d</span> in the range.',
    'Every value is computed in your browser on the real secp256k1 curve; only the size of <span class="eq">d</span> is toy. The toy key is public by construction: it is in the URL.',
  ],
};

/**
 * The dock, mounted or refreshed. Returns null: it takes no place in the page.
 * @param {{msg: string, bits: number, d: bigint}} key  from readKey
 * @param {object|null} [page]  the page's own section (see assets/js/ui/dock.js)
 * @param {any} [pageValue]     what that section shows
 */
export function toyDock(key, update, page = null, pageValue = null) {
  return inputDock({
    id: 'hw03', title: 'Message & key', update,
    sections: page ? [SHARED, page] : [SHARED],
    values: { toy: key, ...(page ? { [page.id]: pageValue } : {}) },
  });
}
