# Statistics · homework

No dependencies, no build step, no network requests: plain
HTML, CSS and JavaScript ES modules.

## Layout

```
index.html        hub linking the homeworks
assets/           the shared shell and maths, reused by every homework
  css/base.css      design tokens, layout, light and dark themes
  js/core/
    field.js        the prime field F_p (BigInt, no DOM)
    curve.js        elliptic-curve points, group law, scalar multiplication
    stats.js        χ² with exact p-values, z-tests, Bonferroni, Wilson, reference laws, entropy
    rng.js          seeded xoshiro128** for reproducible simulations (never for keys)
  js/ui/
    site.js         author, course, repository link — edit here
    dom.js          el(), the page shell, the "What am I looking at?" box
    page.js         startPage(): state in the URL, remembered between pages
    grid.js         SVG scatter on an integer lattice
    linechart.js    small multi-series line chart
    barchart.js     bars (histograms, counts) with a theory overlay
    heatmap.js      an n × n grid on a canvas (2-D spectra), with hover and click
    worker.js       run a job in a module Web Worker, with progress and cancel
    export.js       CSV / JSON download
    params.js       read and write the query string
    store.js        guarded localStorage
hw01/             homework 1 — elliptic-curve scalar multiplication
  index.html curve.html keygen.html visualiser.html
  css/hw01.css      styles only this homework needs
  js/core/          curves.js: the toy curve presets (the maths is in assets/js/core)
  js/pages/         shell.js, curve-input.js, saved-curves.js, one *-page.js per page
hw02/             homework 2 — from wallet seed to Ethereum address
  index.html pipeline.html bip39.html bip32.html address.html history.html primitives.html stats.html
  incidents.html structure.html wallet-lab.html essay.html
  css/hw02.css      category badges, hex values, bit groups, reveal marks, timeline and diagrams
  data/             the official BIP-39 English wordlist (SHA-256 checked at load), timeline.json,
                    incidents.json
  js/core/          the maths, documented for study: bytes, sha256 (sync, with length extension),
                    hash (Web Crypto), keccak, secp256k1, entropy, bip39, bip32, address, pipeline, data,
                    yasmarang (the Coldcard generator model), toycurves, ecdsa, lamport,
                    lab/ (one module per experiment, S2–S11)
  js/workers/lab.js the Web Worker that runs the statistics-lab experiments
  js/pages/         shell.js, wallet-input.js (shared input card), widgets.js, one *-page.js per page
tools/            development aids; not part of the published site
docs/             the specification and the conventions (not committed)
```

## Running it locally

```sh
python3 -m http.server
```

then open <http://localhost:8000>. Opening the files directly with `file://` does not
work: browsers refuse to load ES modules from the filesystem, and hw02's Web Crypto calls
need a secure context (`http://localhost` or `https://`).

## Publishing

1. Push the repository to GitHub, then Settings → Pages → deploy from the `main` branch, root folder.
   GitHub Pages serves over HTTPS, which Web Crypto requires.
2. Put the repository's address in `sourceUrl` in `assets/js/ui/site.js`; the footer of hw01 then
   links to it.
3. Send the homework's own home page, e.g. `https://<user>.github.io/<repo>/hw02/index.html`.
4. Check it in a private window and on a phone. In the browser's developer tools, the Network tab
   must show only the site's own files: no page requests anything from elsewhere.

**Safety.** The pages are educational: the cryptography is not constant-time, and the default
mnemonic is the public test vector. Random keys are drawn with `crypto.getRandomValues` and kept in
the tab only; nothing is stored, logged or sent. Never type a real seed phrase into any website.

## Tools

```sh
node tools/check.mjs hw01                 # build every page of a homework, report what came out
node tools/check.mjs hw01 '?curve=C2&k=7' # ...with those parameters
tools/shot.sh hw01/curve.html out.png     # screenshot a page (starts a server if needed)
node tools/new-homework.mjs hw 02 "Title" "subtitle"   # scaffold the next homework
node tools/new-homework.mjs page 02 entropy "Entropy"  # add a page to it
```

`check.mjs` renders the pages under a minimal DOM in Node. It verifies that they build
and that the shell is intact — it is a development aid, not a test suite, and it makes no
claim about whether the mathematics is right.
