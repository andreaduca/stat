/* hash-demo.js — the Keccak-256 vs SHA3-256 padding demo, shared by the
   address lab and the history page: one sponge, two domain bytes. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { bytesToHex, utf8 } from '../core/bytes.js';
import { keccak256, sha3_256, padMessage } from '../core/keccak.js';
import { stepCard, hexValue, facts } from './widgets.js';

export function spongePanel(state, update) {
  const out = el('div');
  const draw = (message) => {
    const bytes = utf8(message);
    const tail = (pad) => {
      // the last 136-byte block the permutation absorbs: message end, domain byte, zeros, 0x80
      const padded = padMessage(bytes, 136, pad);
      const block = bytesToHex(padded.slice(padded.length - 136));
      const at = 2 * (bytes.length % 136);
      return hexValue(`last block absorbed, domain byte 0x0${pad}`, block, {
        mark: (i) => (i === at || i === at + 1 ? 'chg' : i >= block.length - 2 ? 'keep' : i < at ? '' : 'dim'),
      });
    };
    out.replaceChildren(
      facts([['input bytes (UTF-8)', `${bytes.length}`]]),
      hexValue('Keccak-256 (Ethereum)', bytesToHex(keccak256(bytes))),
      hexValue('SHA3-256 (FIPS 202)', bytesToHex(sha3_256(bytes))),
      tail(1), tail(6),
    );
  };
  const message = state.msg ?? '';
  draw(message);
  const input = el('input', { class: 'wide', value: message, placeholder: '(empty string)', spellcheck: 'false',
    oninput: (e) => draw(e.target.value), onchange: (e) => update({ msg: e.target.value || null }) });

  return stepCard({
    title: 'Keccak-256 is not SHA3-256', cats: ['hashing'],
    formula: 'one sponge, rate 136 bytes, capacity 64 bytes &nbsp;·&nbsp; pad byte 0x01 → Keccak-256 &nbsp;·&nbsp; pad byte 0x06 → SHA3-256',
    body: [
      el('div', { class: 'row' }, [field('message (UTF-8 text)', input)]),
      el('div', { style: 'margin-top:12px' }, [out]),
      el('p', { class: 'small muted', html: 'Empty message, reference values: Keccak-256 <span class="eq">c5d24601…5d85a470</span>, SHA3-256 <span class="eq">a7ffc6f8…80f8434a</span>. The red byte is the only difference between the two blocks; the green <span class="eq">80</span> closes the padding in both.' }),
    ],
    why: 'Ethereum adopted Keccak before SHA-3 was standardised, and the standard changed one padding byte afterwards.',
    notes: [
      'Both outputs come from the same function in <span class="eq">js/core/keccak.js</span>: the same permutation, the same rate, the same capacity. The only argument that differs is the domain byte written after the message — <span class="eq">0x01</span> for the original Keccak submission, <span class="eq">0x06</span> for FIPS 202, which added two bits to separate SHA-3 from its other uses (SHAKE). One different input bit to the permutation, and the outputs are unrelated.',
      'Ethereum’s design (2014) named “Keccak-256 as per the winning entry” while FIPS 202 was still a draft; the standard came in August 2015 with the new padding. Libraries that call Ethereum’s hash “SHA3” mean Keccak-256 — a source of real bugs.',
      'PRACTICE: Solidity’s <span class="eq">keccak256()</span>, function selectors (the first 4 bytes of <span class="eq">keccak256("transfer(address,uint256)")</span>), storage slots and transaction hashes all use the 0x01 variant.',
    ],
  });
}

