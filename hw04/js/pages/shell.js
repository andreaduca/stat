/* shell.js — what the header, the tab bar and the footer say on every page
   of this homework. One place to add a page to the navigation. */

/* every page, in reading order; `built` turns a page on in the tabs and the
   home page's list as its phase is finished */
export const PAGES = [
  { href: 'index.html', label: 'Home', built: true },
  { href: 'model.html', label: 'Model & paths', built: false,
    blurb: 'The two step models and what a step means; up to 50 attackers’ paths drawn as Sₖ, Sₖ/k and Sₖ/√k, with their envelopes; the first 50 steps revealed one system at a time.' },
  { href: 'distributions.html', label: 'Distributions', built: false,
    blurb: 'Histograms of the three quantities at each n, with the exact law and the limit drawn over them: Sₙ spreading, Sₙ/n collapsing, Sₙ/√n holding still. The Bernoulli drift, and the moments against theory.' },
  { href: 'variance.html', label: 'Variance', built: false,
    blurb: 'The variance of Sₙ/n^α against n on log-log axes: slopes +1, −1 and 0, fitted with error bars, and a slider for α showing that √n is the only scaling that neither explodes nor vanishes.' },
  { href: 'lln.html', label: 'LLN', built: false,
    blurb: 'Convergence in probability of Sₙ/n: the tail P(|Sₙ/n − μ| > ε) measured, computed exactly, bounded by Chebyshev, Hoeffding and Chernoff, and approximated by the CLT.' },
  { href: 'clt.html', label: 'CLT', built: false,
    blurb: 'Convergence in distribution of Sₙ/√n to N(0, 1): lattice histograms, ECDF, Q-Q plot, and the Kolmogorov–Smirnov distance against n, where the simulation meets its own noise floor.' },
  { href: 'thresholds.html', label: 'Thresholds', built: false,
    blurb: 'How many observations a defender needs, when an attacker first reaches a level (reflection principle), and the race between attacker and defender (gambler’s ruin).' },
  { href: 'attackers.html', label: 'Systems & attackers', built: false,
    blurb: 'What system size and the number of attackers do to the aggregate score; the luckiest attacker; and what happens when attackers differ or systems are correlated.' },
  { href: 'essay.html', label: 'Essay', built: false,
    blurb: 'The argument in prose, with the measured numbers and the evidence behind each claim.' },
];

/** Shell arguments for one page of hw04. @param {string} current its filename */
export const hw04Shell = (current) => ({
  title: 'HW04 · Penetration as a random walk',
  subtitle: 'LLN, variance scaling and the CLT for n systems and m attackers',
  links: PAGES.filter((p) => p.built),
  current,
  home: '../index.html',
  notice: 'An educational model, not attack data: every step is an independent coin by assumption, and the simulations use a seeded, non-cryptographic generator (xoshiro128**) so that any run can be reproduced from its seed. Everything runs in your browser; nothing is sent anywhere.',
});

/* What every page shares: the step model and the run (attackers and seed),
   so that each page looks at the same simulation. */
export const STICKY = ['model', 'p', 'm', 'seed'];
export const MEMORY = 'hw04';
