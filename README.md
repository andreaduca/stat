# Statistics · homework

No dependencies, no build step, no network requests: plain
HTML, CSS and JavaScript ES modules.

## Layout

```
index.html        hub linking the homeworks
assets/           the shared shell, reused by every homework
  css/base.css      design tokens, layout, light and dark themes
  js/ui/
    site.js         author, course, repository link — edit here
    dom.js          el(), the page shell, the "What am I looking at?" box
    page.js         startPage(): state in the URL, remembered between pages
    grid.js         SVG scatter on an integer lattice
    linechart.js    small multi-series line chart
    params.js       read and write the query string
    store.js        guarded localStorage
hw01/             homework 1 — elliptic-curve scalar multiplication
  index.html curve.html keygen.html visualiser.html
  css/hw01.css      styles only this homework needs
  js/core/          the maths: field.js, curve.js, curves.js (BigInt, no DOM)
  js/pages/         shell.js, curve-input.js, saved-curves.js, one *-page.js per page
tools/            development aids; not part of the published site
docs/             the specification and the conventions (not committed)
```

## Running it locally

```sh
python3 -m http.server
```

then open <http://localhost:8000>. Opening the files directly with `file://` does not
work: browsers refuse to load ES modules from the filesystem.

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
