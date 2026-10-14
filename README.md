# Statistics · homework

One small static page per weekly homework, for the Statistics course of the MSc in
Cybersecurity, Sapienza. No dependencies, no build step, no network requests: plain
HTML, CSS and JavaScript ES modules.

## Layout

```
index.html        hub linking the homeworks
assets/           the shared shell, reused by every homework
  css/base.css      design tokens, layout, light and dark themes
  js/ui/            el()/shell helpers, SVG lattice plot, line chart, URL state
hw01/             homework 1 — elliptic-curve scalar multiplication
  index.html        overview
  curve.html        the curve over F_p: points, #E, Hasse, orders, base point
  keygen.html       Q = kG: multiples, toy public key, trace, operation counts
  visualiser.html   one group operation at a time, slowed down
  js/core/          the maths: field.js, curve.js, curves.js (BigInt, no DOM)
  js/pages/         one module per page
```

## Running it locally

```sh
python3 -m http.server
```

then open <http://localhost:8000>. Opening the files directly with `file://` does not
work: browsers refuse to load ES modules from the filesystem.

## Publishing

GitHub Pages: repository → Settings → Pages → deploy from `main`, root folder. Every
link is relative, so the site works from any subdirectory. Check the public URL in a
private window before sending it on.

## Credits

Written by Andrea. The curves, the reference values and the didactic goals follow the
homework specification in `docs/plans/hw01.md` (not committed: `docs/` is gitignored).
