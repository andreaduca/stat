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
    secp256k1.js    secp256k1 at full size, Jacobian coordinates (hw02 keys, hw03 ElGamal and searches)
    stats.js        χ² with exact p-values, z-tests, Bonferroni, Wilson, reference laws, entropy
    rng.js          seeded xoshiro128** for reproducible simulations (never for keys)
  js/ui/
    site.js         author, course, repository link — edit here
    dom.js          el(), the page shell, the "What am I looking at?" box
    page.js         startPage(): state in the URL, remembered between pages; optional in-place redraws
    grid.js         SVG scatter on an integer lattice
    linechart.js    small multi-series line chart
    plot.js         continuous axes (linear/log): lines, steps, error bars, histograms on a real axis, paths
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
                    hash (Web Crypto), keccak, entropy, bip39, bip32, address, pipeline, data,
                    yasmarang (the Coldcard generator model), toycurves, ecdsa, lamport,
                    lab/ (one module per experiment, S2–S11)
  js/workers/lab.js the Web Worker that runs the statistics-lab experiments
  js/pages/         shell.js, wallet-input.js (shared input card), widgets.js, one *-page.js per page
hw03/             homework 3 — Caesar vs toy EC-ElGamal on secp256k1
  index.html ecc.html caesar.html break-caesar.html break-ecc.html compare.html essay.html
  css/hw03.css      public/secret tags, alphabet strips, n-gram tiles, diagrams, essay
  data/             model.json (letter, bigram and entropy statistics of four Gutenberg books),
                    quadgrams.bin (26⁴ quadgram counts), test.txt (two test books, letters only)
  js/core/          the maths, documented for study: elgamal (textbook EC-ElGamal, Koblitz encoding),
                    caesar (cipher and letter statistics), attack (Caesar recognisers, experiment),
                    ecdlp (brute force, baby-step giant-step, Pollard kangaroo, experiment), data
  js/workers/       experiment.js (Caesar experiment), ecdlp.js (the key searches and their experiment)
  js/pages/         shell.js, toykey.js (the shared toy key), widgets.js, one *-page.js per page
hw04/             homework 4 — penetration as a random walk: LLN, variance scaling, CLT
  index.html model.html distributions.html variance.html lln.html clt.html thresholds.html (more pages phase by phase)
  css/hw04.css      layer legends, evidence labels, word tables
  js/core/          the maths, documented for study: numeric (erfc, Φ, Φ⁻¹, log-sum-exp, line fit),
                    models (Bernoulli, Rademacher, Beta attackers), exact (binomial laws and tails, LLN tail,
                    exact KS, reflection, hitting times, gambler's ruin), bounds (Chebyshev, Hoeffding,
                    KL–Chernoff, CLT, sample sizes), estimate (moments, ECDF, KS, Q-Q, χ²), sampling,
                    simulate (the Monte Carlo engine, and the attacker–defender races)
  js/workers/sim.js the Web Worker that runs a simulation
  js/pages/         shell.js, run-input.js (the input dock at the bottom of the window), run.js (worker + cache), lab-panel.js (experiment frame),
                    widgets.js, one *-page.js per page
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
node tools/build-corpus.mjs <dir>                     # rebuild hw03/data from Gutenberg books (see its header)
```

`check.mjs` renders the pages under a minimal DOM in Node. It verifies that they build
and that the shell is intact — it is a development aid, not a test suite, and it makes no
claim about whether the mathematics is right.
