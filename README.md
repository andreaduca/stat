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
    worker.js       run a job in a module Web Worker, with progress and cancel
    export.js       CSV / JSON download
    params.js       read and write the query string
    store.js        guarded localStorage
hw01/             homework 1 — elliptic-curve scalar multiplication
  index.html curve.html keygen.html visualiser.html
  css/hw01.css      styles only this homework needs
  js/core/          curves.js: the toy curve presets (the maths is in assets/js/core)
  js/pages/         shell.js, curve-input.js, saved-curves.js, one *-page.js per page
hw02/             homework 2 — from wallet seed to Ethereum address (in progress)
  index.html pipeline.html bip39.html bip32.html address.html history.html primitives.html stats.html
  css/hw02.css      category badges, hex values, bit groups, reveal marks, timeline and diagrams
  data/             the official BIP-39 English wordlist (SHA-256 checked at load), timeline.json
  js/core/          the maths, documented for study: bytes, sha256 (sync, with length extension),
                    hash (Web Crypto), keccak, secp256k1, entropy, bip39, bip32, address, pipeline, data,
                    yasmarang (the Coldcard generator model), lab/ (one module per experiment)
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
