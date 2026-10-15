/* incidents-page.js — Incidents (spec §6.7, notes 05 and 09): where real
   losses happened, layer by layer, from data/incidents.json; the Coldcard case
   in its own code; the DApp front-end attacks; and the lessons, each linked to
   the experiment that shows it. Every claim carries its evidence label. */

import { el } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { loadData } from '../core/data.js';
import { stepCard, evidence } from './widgets.js';
import { hw02Shell } from './shell.js';

const LAYERS = [
  ['Entropy', 'key generation'],
  ['Cryptographic implementation', 'signing, nonces'],
  ['Key storage and handling', 'where the secret lives'],
  ['Smart-contract logic', 'what the program does'],
  ['Front-end and supply chain', 'servers, CDNs, npm'],
  ['Human interface', 'what the user reads'],
];

/** A code excerpt; `marks` maps line numbers (from 1) to 'hl' (the bug) or 'ok' (the fix). */
function code(lines, marks = {}) {
  return el('pre', { class: 'code' }, lines.flatMap((line, i) => [
    marks[i + 1] ? el('span', { class: marks[i + 1], text: line }) : line,
    i < lines.length - 1 ? '\n' : '',
  ]));
}

/* ---------- the layers ---------- */

function layersPanel(incidents) {
  return stepCard({
    title: 'Six layers around the mathematics', cats: [],
    body: [
      el('ol', { class: 'layers' }, LAYERS.map(([name, sub], i) => el('li', {}, [
        el('div', { class: 'layer-name' }, [`${i + 1}. ${name}`, el('small', { text: sub })]),
        el('div', { class: 'chips' }, incidents.filter((x) => x.layer === i + 1).map((x) => el('a', { href: `#inc-${x.id}`, text: `${x.name} · ${x.date.match(/^\d{4}/)?.[0] ?? x.date}` }))),
      ]))),
      el('div', { class: 'math-note' }, [
        evidence('record'), ' ',
        el('strong', { text: 'The mathematics — the discrete logarithm on secp256k1, Keccak, SHA-2, PBKDF2 — was broken in none of these incidents.' }),
        ' Every loss came from a layer around it. “Cryptography is typically bypassed, not penetrated” (attributed to Adi Shamir).',
      ]),
    ],
    why: 'it shows where to look for risk: not where the mathematics is, but where people and code touch it.',
    notes: [
      'The layers run from the first step of a wallet’s life (making the secret) to the last (a person reading an address). Click an incident to jump to its row in the table.',
      'PRACTICE: This is a <em>biased sample</em> — survivorship and reporting bias. Undetected thefts, keys compromised but not yet used, and losses individuals never report are missing; weak-entropy bugs can stay invisible for years (Randstorm: wallets from 2011–2015, disclosed in 2023; Coldcard: five years).',
    ],
  });
}

/* ---------- the table ---------- */

function tablePanel(incidents) {
  const rows = [...incidents].sort((a, b) => a.layer - b.layer || a.date.localeCompare(b.date)).map((x) => el('tr', { id: `inc-${x.id}` }, [
    el('td', { class: 'left', text: x.date }),
    el('td', { class: 'left' }, [el('strong', { text: x.name })]),
    el('td', { class: 'left', text: `${x.layer}. ${LAYERS[x.layer - 1][0]}` }),
    el('td', { class: 'left', text: x.mechanism }),
    el('td', { class: 'left ok', text: 'no' }),
    el('td', { class: 'left', text: x.amount }),
    el('td', { class: 'left' }, [x.url ? el('a', { href: x.url, text: x.source, rel: 'noopener' }) : x.source]),
  ]));
  return stepCard({
    title: 'The incidents', cats: [],
    body: [
      el('p', { class: 'small muted' }, [evidence('record'), ' Amounts in US dollars at the time, as reported; attributions (for example to the Lazarus group) are the investigators’, sometimes preliminary. Check the source before citing.']),
      el('div', { class: 'scroll-x' }, [el('table', { class: 'data compare prose incidents' }, [
        el('thead', {}, [el('tr', {}, ['date', 'incident', 'layer', 'what went wrong', 'primitive broken?', 'reported amount', 'source'].map((h) => el('th', { class: 'left', text: h })))]),
        el('tbody', {}, rows),
      ])]),
    ],
    why: 'one column is the same in every row: no primitive was broken.',
  });
}

/* ---------- Coldcard ---------- */

function coldcardPanel() {
  return stepCard({
    title: 'Case study: the 2026 Coldcard entropy failure', cats: ['generation'],
    body: [
      el('p', {}, [evidence('record'), ' From March 2021 to July 2026, Coldcard hardware wallets generated seeds not from the chip’s hardware random-number generator but from a small pseudo-random generator seeded with a chip-ID word and a timer value. Every seed was valid, every test passed, and the seeds were guessable. Sweeps began on 30–31 July 2026; reported totals are about 1 400–2 000 BTC.']),
      el('h3', { text: 'The bug in four excerpts' }),
      el('div', { class: 'excerpts' }, [
        el('div', {}, [
          el('h4', { text: '1 · libngu asks for a hardware RNG' }),
          el('p', { class: 'src', text: 'switck/libngu, ngu/random.c' }),
          code(['#ifdef MICROPY_PY_STM', 'extern uint32_t rng_get(void);', '# define CHIP_TRNG_32()  rng_get()', '', '# ifndef MICROPY_HW_ENABLE_RNG', '# error "get a HW TRNG plz"', '# endif', '#endif'], { 5: 'hl' }),
          el('p', { class: 'small', html: '<span class="eq">#ifndef</span> asks “is the macro <em>undefined</em>?” The author meant <span class="eq">#if !</span>, “is it <em>zero</em>?”' }),
        ]),
        el('div', {}, [
          el('h4', { text: '2 · MicroPython always defines it — as 0' }),
          el('p', { class: 'src', text: 'Coldcard/micropython, ports/stm32/mpconfigboard_common.h' }),
          code(['// Whether to enable the hardware RNG peripheral', '#ifndef MICROPY_HW_ENABLE_RNG', '#define MICROPY_HW_ENABLE_RNG (0)', '#endif'], { 3: 'hl' }),
          el('p', { class: 'small', text: 'Defined, so the #error above never fires. And the Coldcard board deliberately sets it to 0 too, for its own driver.' }),
        ]),
        el('div', {}, [
          el('h4', { text: '3 · so the linker picks the fallback' }),
          el('p', { class: 'src', text: 'Coldcard/micropython, ports/stm32/rng.c (the #else branch)' }),
          code(['// For MCUs that don\'t have an RNG we still need to provide', '// a rng_get() function ... A pseudo-RNG is not really ideal', 'STATIC uint32_t pyb_rng_yasmarang(void) {', '    ...', '    pad = *(uint32_t *)MP_HAL_UNIQUE_ID_ADDRESS ^ SysTick->VAL;', '    ...', '}', 'uint32_t rng_get(void) { return pyb_rng_yasmarang(); }'], { 5: 'hl', 8: 'hl' }),
          el('p', { class: 'small', text: 'The board’s real hardware reader was static (invisible to the linker), so this became the only global rng_get().' }),
        ]),
        el('div', {}, [
          el('h4', { text: '4 · the fix' }),
          el('p', { class: 'src', text: 'Coldcard/firmware, commit ca724637, 30 July 2026' }),
          code(['+uint32_t rng_get(void)', '+{', '+    return rng_get_or_fault();', '+}', '', 'rng-code-check:   # build fails unless the board', '                  # exports the global rng_get'], { 1: 'ok', 2: 'ok', 3: 'ok', 4: 'ok' }),
          el('p', { class: 'small', text: 'A global rng_get() in the board driver, plus a build step that inspects the compiled objects: it checks which code ends up in the binary, not a flag that stands in for it.' }),
        ]),
      ]),
      el('h3', { text: 'Why nobody noticed for five years' }),
      el('ul', { class: 'small' }, [
        el('li', { html: 'The guard tested <em>defined</em> instead of <em>non-zero</em>; the board’s own guard made sure the value was zero.' }),
        el('li', { text: 'Two rng_get() candidates, one of them static: no duplicate-symbol error, a silent choice.' }),
        el('li', { text: 'assert len(set(seed)) > 4 measures variety, not unpredictability; “chip == last” catches a stuck register, not a deterministic one.' }),
        el('li', { text: 'The statistical test ran in the desktop simulator, whose bytes never came from the device path — and SHA-256d makes even weak output look perfect.' }),
        el('li', { text: 'Every file looked correct in isolation; the failure lived in the interaction of three repositories, one macro and the linker.' }),
      ]),
      el('p', {}, [el('a', { href: 'stats.html?exp=S5c', text: 'Run the generator yourself: statistics lab S5(c) →' }), ' its output passes the tests, and the 24 words fall to a search over timer values.']),
    ],
    why: 'it is the clearest recent case of the pipeline’s first lesson: no later step can repair the entropy.',
    notes: [
      'The secret was the generator’s <em>state</em>, not its 256-bit output. With the chip-ID word known, only the timer was unknown — about 80 000 values on Mk2/Mk3, roughly 16 bits. Hashing cannot add entropy, <span class="eq">H(SHA256d(X)) ≤ H(X)</span>; XORing a second generator that starts from public constants cannot either.',
      'Users who had added 50 or more dice rolls (≈ 129 bits of their own) were safe: an independent entropy source rescued them. Short or common passphrases did not reliably protect funds — once the seed space is small, a passphrase dictionary on top of it is affordable.',
      'The general lesson is “test the path, not the component”: the hardware RNG worked, Yasmarang did what its comment said, SHA-256 and BIP-39 are sound. Standards for randomness sources (NIST SP 800-90B, BSI AIS-31) require health tests on the noise source <em>in the product</em>.',
      'PRACTICE (on AI): Coinkite suggested that AI-assisted review may have sped up the discovery, and Galaxy Research reported attackers using AI models during the exploitation. Neither is forensic proof of how the bug was found <span class="evidence opinion">opinion</span>.',
    ],
  });
}

/* ---------- DApp front-end ---------- */

function frontEndPanel(incidents) {
  const pick = (id) => incidents.find((x) => x.id === id);
  return stepCard({
    title: 'DApp front-ends: the screen is the trust anchor', cats: [],
    body: [
      el('div', { class: 'breaks' }, ['badger', 'ledgerkit', 'bybit'].map(pick).filter(Boolean).map((x) => el('div', { class: 'break' }, [
        el('p', { style: 'margin:0 0 4px' }, [el('strong', { text: `${x.name} · ${x.date}` }), ' ', evidence('record')]),
        el('p', { class: 'small', style: 'margin:0 0 4px', text: x.mechanism }),
        el('p', { class: 'small muted', style: 'margin:0', text: x.amount }),
      ]))),
      el('h3', { text: 'Why this layer is so dangerous' }),
      el('ul', {}, [
        el('li', { html: '<strong>The screen is the trust anchor.</strong> A DApp is JavaScript fetched at run time from servers, CDNs and package registries. The wallet signs whatever that code prepares, and the user approves what the code chooses to show.' }),
        el('li', { html: '<strong>Blind signing.</strong> A hardware wallet often shows a hash or raw calldata rather than what the transaction <em>does</em>; the Bybit signers approved a contract change they did not intend.' }),
        el('li', { html: '<strong>Token approvals are delegated authority.</strong> One careless signature lets the attacker move tokens later with <span class="eq">transferFrom</span> — BadgerDAO’s contracts were never exploited.' }),
      ]),
    ],
    why: 'cryptography guarantees who signed, not what the person thought they were signing.',
    notes: [
      'Defences live outside the mathematics: subresource integrity and reproducible builds for the code, local or self-hosted front-ends, and <em>clear signing</em> on an independent device that shows the meaning of a transaction <span class="evidence opinion">opinion</span>.',
    ],
  });
}

/* ---------- lessons ---------- */

function lessonsPanel() {
  const items = [
    ['Entropy is the only source of security; tests on outputs cannot see it.', 'stats.html?exp=S5a', 'S5: weak keys pass the tests, then fall'],
    ['Nonces must be unique and unpredictable; the algebra of ECDSA does the rest for an attacker.', 'structure.html?exp=S9', 'S9: nonce reuse recovers the key'],
    ['An xpub plus one child key is the parent key; harden what may be exposed.', 'bip32.html', 'the BIP-32 leak demo'],
    ['A seed phrase is the key in plain words: logs, screenshots and clipboards are exfiltration channels.', 'primitives.html', 'encoding is not encryption'],
    ['EIP-55 catches typos, not attackers; compare the full address.', 'stats.html?exp=S6', 'S6: look-alikes in seconds'],
    ['None of these failures broke a primitive; the risk is in the layers around them.', 'primitives.html', 'why many primitives'],
  ];
  return stepCard({
    title: 'Lessons', cats: [],
    body: el('ol', {}, items.map(([text, href, label]) => el('li', { style: 'margin-bottom:6px' }, [text, ' ', el('a', { href, text: `→ ${label}` })]))),
  });
}

startPage({
  shell: hw02Shell('incidents.html'),
  render: async () => {
    const incidents = await loadData('incidents');
    return [layersPanel(incidents), tablePanel(incidents), coldcardPanel(), frontEndPanel(incidents), lessonsPanel()];
  },
});
