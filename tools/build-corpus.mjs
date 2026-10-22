/* build-corpus.mjs — build hw03's English letter model from Project Gutenberg
   books. Development tool, run once; the site only reads its output.

   node tools/build-corpus.mjs <dir with pg<ID>.txt files>

   Get the books first (public domain, plain-text UTF-8):
     for id in 1342 2701 98 1661 84 345; do
       curl -L -o pg$id.txt https://www.gutenberg.org/cache/epub/$id/pg$id.txt; done

   Train/test split BY BOOK (note "Caesar statistical cryptanalysis" §1.5):
   the model is estimated on four books and the experiments draw their
   ciphertexts from two others, so accuracy is never measured on the data
   the model was fitted to. Normalisation is caesar.js's own, so corpus and
   ciphertexts are treated identically.

   Writes hw03/data/model.json (counts per book, training frequencies and
   bigram counts, entropy rates, a sample paragraph), hw03/data/quadgrams.bin
   (26⁴ training quadgram counts, Uint32 little-endian, index = 26³a+26²b+26c+d)
   and hw03/data/test.txt (one line of letters per test book).

   n-grams are counted over each book's normalised letters, word boundaries
   included, because the attack sees ciphertexts normalised the same way. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalise, letterCounts, frequencies, indexOfCoincidence, letterEntropy } from '../hw03/js/core/caesar.js';

const BOOKS = [
  { id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen', role: 'train' },
  { id: 2701, title: 'Moby-Dick', author: 'Herman Melville', role: 'train' },
  { id: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens', role: 'train' },
  { id: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', role: 'train' },
  { id: 84, title: 'Frankenstein', author: 'Mary Shelley', role: 'test' },
  { id: 345, title: 'Dracula', author: 'Bram Stoker', role: 'test' },
];
// the page's long example: a paragraph of a TEST book, located by its opening words
const SAMPLE = { id: 84, starts: 'It was on a dreary night of November' };

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/build-corpus.mjs <dir with pg<ID>.txt>'); process.exit(2); }

/** The book itself: what lies between Gutenberg's START and END markers. */
function body(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const start = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/);
  const end = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK/);
  if (start < 0 || end < 0) throw new Error('Gutenberg markers not found');
  return text.slice(text.indexOf('\n', start) + 1, end);
}

const round = (x, d = 6) => Number(x.toFixed(d));
const books = [], testLines = [];
const train = new Array(26).fill(0);
const bi = new Float64Array(26 ** 2), tri = new Float64Array(26 ** 3), quad = new Uint32Array(26 ** 4);
let sample = null;

for (const b of BOOKS) {
  const text = body(readFileSync(join(dir, `pg${b.id}.txt`), 'utf8'));
  const letters = normalise(text);
  const counts = letterCounts(letters);
  books.push({ ...b, letters: letters.length, counts, ic: round(indexOfCoincidence(counts)), entropy: round(letterEntropy(counts), 4) });
  if (b.role === 'train') {
    counts.forEach((c, i) => { train[i] += c; });
    const x = Uint8Array.from(letters, (ch) => ch.charCodeAt(0) - 65);
    for (let i = 0; i + 1 < x.length; i++) {
      bi[x[i] * 26 + x[i + 1]]++;
      if (i + 2 < x.length) tri[(x[i] * 26 + x[i + 1]) * 26 + x[i + 2]]++;
      if (i + 3 < x.length) quad[((x[i] * 26 + x[i + 1]) * 26 + x[i + 2]) * 26 + x[i + 3]]++;
    }
  }
  else testLines.push(letters);
  if (b.id === SAMPLE.id) {
    const at = text.indexOf(SAMPLE.starts);
    if (at < 0) throw new Error('sample paragraph not found');
    sample = { source: `${b.author}, ${b.title}`, text: text.slice(at, text.indexOf('\n\n', at)).replace(/\s+/g, ' ').trim() };
  }
  console.log(`${b.role.padEnd(5)} ${String(b.id).padStart(4)} ${b.title.padEnd(34)} ${String(letters.length).padStart(8)} letters`);
}

const total = train.reduce((s, c) => s + c, 0);

/* Entropy rates: H_n = H(n-gram) − H((n−1)-gram) is the entropy of a letter
   given the n − 1 before it (chain rule). Plug-in estimates from counts; for
   n = 4 the 457 000 cells against 2.5 M samples bias it downward a little. */
const H = (cells) => { let n = 0, h = 0; for (const c of cells) n += c; for (const c of cells) if (c) h -= (c / n) * Math.log2(c / n); return h; };
const Hn = [H(train), H(bi), H(tri), H(quad)];
const rates = Hn.map((h, i) => round(i ? h - Hn[i - 1] : h, 4));
const model = {
  about: 'English letter model for hw03, built by tools/build-corpus.mjs from Project Gutenberg plain-text books (public domain). Normalisation: NFD, accents dropped, uppercase, A-Z only.',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  books,
  train: { letters: total, counts: train, bigrams: Array.from(bi), entropyRates: rates, distinctQuadgrams: quad.filter((c) => c).length, freq: frequencies(train).map((p) => round(p, 7)), ic: round(indexOfCoincidence(train)), entropy: round(letterEntropy(train), 4) },
  sample,
};

const out = new URL('../hw03/data/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('model.json', out), JSON.stringify(model) + '\n');
writeFileSync(new URL('test.txt', out), testLines.join('\n') + '\n');
writeFileSync(new URL('quadgrams.bin', out), new Uint8Array(quad.buffer));
console.log(`\ntrain: ${total} letters · IC ${model.train.ic} · H ${model.train.entropy} bits/letter`);
console.log(`top letters: ${model.alphabet.split('').map((l, i) => [l, model.train.freq[i]]).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([l, p]) => `${l} ${(100 * p).toFixed(2)}%`).join(' · ')}`);
console.log(`entropy rates H1..H4: ${rates.join(' · ')} bits/letter · distinct quadgrams ${model.train.distinctQuadgrams}`);
console.log(`test: ${testLines.map((l) => l.length).join(' + ')} letters · sample: ${sample.text.length} characters`);
