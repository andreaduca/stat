/* shell.js — what the header and the tab bar say on every page of this
   homework. One place to add a page to the navigation. hw06 has no footer
   (as hw04 and hw05): the honesty note is NOTICE, shown on the home page. */

/* every page, in reading order; `built` turns a page on in the tabs and in
   the home page's list as its phase is finished */
export const PAGES = [
  { href: 'index.html', label: 'Home', built: true },
  { href: 'integration.html', label: 'Riemann vs Lebesgue (Ex. 1)', built: true,
    blurb: 'The same integrals cut two ways: rectangles over the domain, slabs over the range with their preimages. Convergence rates, the price of computing a preimage, and the proof that grid-based Lebesgue is a rearranged Riemann sum.' },
  { href: 'pathological.html', label: 'Pathological', built: true,
    blurb: 'Where the two integrals part ways: Dirichlet (and why every float is rational), Thomae in exact arithmetic, a fat Cantor set that numerics cannot tell from an interval, and sin x/x on [0, ∞).' },
  { href: 'normal.html', label: 'Normal CDF (Ex. 2)', built: true,
    blurb: 'Φ computed eight ways, from quadrature to a Chebyshev fit, against an 80-digit reference: where each method breaks, what it costs, and why the lower tail needs relative accuracy.' },
  { href: 'liouville.html', label: 'Liouville', built: true,
    blurb: 'Why Φ has no elementary formula: Liouville’s criterion and the full proof for exp(−x²), with a checker for candidate antiderivatives; what naming erf achieves, and why numerics are needed anyway.' },
  { href: 'inference.html', label: 'Inference', built: true,
    blurb: 'Φ at work: p-values are tail areas, uniform under the null; 5σ and Bonferroni push them to 10⁻⁷ and beyond, where a careless Φ returns zero.' },
  { href: 'lattice.html', label: 'Lattice sampling', built: true,
    blurb: 'A discrete Gaussian sampler for lattice cryptography is a table of Φ-like values: its precision is a statistical distance, and its running time can leak the sample. A simulation.' },
  { href: 'privacy.html', label: 'Distance & privacy', built: true,
    blurb: 'Statistical distance is an integral of |p − q|; the analytic Gaussian mechanism of differential privacy is a difference of two Φ tails that a naive Φ gets wrong.' },
  { href: 'monte-carlo.html', label: 'Monte Carlo', built: true,
    blurb: 'Integration by sampling the range: 1/√N in any dimension, quasi-random points for smooth functions, and importance sampling for a tail event of 3·10⁻⁷.' },
  { href: 'nature.html', label: 'Nature', built: true,
    blurb: 'Layer cakes and bell curves outside mathematics: a lake measured by contours, a Galton board, and where the normal law really comes from.' },
  { href: 'essay.html', label: 'Essay', built: true,
    blurb: 'The argument in prose, with the measured numbers and the evidence behind each claim.' },
];

/** Shell arguments for one page of hw06. @param {string} current its filename */
export const hw06Shell = (current) => ({
  title: 'HW06 · Riemann vs Lebesgue, and the normal CDF',
  subtitle: 'Two ways to measure area, and the integral every z-test needs',
  links: PAGES.filter((p) => p.built),
  current,
  home: '../index.html',
  footer: false,   // no site footer, as hw04 and hw05; NOTICE is on the home page
});

/** The honesty note, shown once on the home page. */
export const NOTICE = 'An educational project. Every number is computed in your browser in IEEE 754 double precision and checked against reference values computed separately at 80 digits; the simulations use a seeded, non-cryptographic generator (xoshiro128**), so any run can be reproduced from its seed. The lattice sampler and the privacy mechanism are simulations of cryptographic components, not implementations to deploy. Nothing is sent anywhere.';

/* What the pages share: the function being integrated and its sizes (Ex. 1
   pages), and the seed of every simulation. */
export const STICKY = ['f', 'N', 'K', 'seed'];
export const MEMORY = 'hw06';
