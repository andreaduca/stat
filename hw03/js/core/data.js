/* data.js — hw03's static data (hw03/data/), fetched relative to this module
   so pages and workers find it alike. Built by tools/build-corpus.mjs. Cached. */

const cache = new Map();
const get = (name, read) => {
  if (!cache.has(name)) {
    cache.set(name, fetch(new URL(`../../data/${name}`, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`data/${name} could not be loaded`);
      return read(r);
    }));
  }
  return cache.get(name);
};

/** The English letter model: per-book counts, training frequencies and bigrams, entropy rates, a sample paragraph. */
export const loadModel = () => get('model.json', (r) => r.json());

/** 26⁴ training quadgram counts (index 26³a + 26²b + 26c + d), 1.8 MB. */
export const loadQuadgrams = () => get('quadgrams.bin', async (r) => new Uint32Array(await r.arrayBuffer()));

/** The test books' normalised letters, one string per book (never used for training). */
export const loadTest = () => get('test.txt', async (r) => (await r.text()).trim().split('\n'));
