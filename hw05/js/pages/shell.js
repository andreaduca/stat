/* shell.js — what the header and the tab bar say on every page of this
   homework. One place to add a page to the navigation. hw05 has no footer
   (as hw04, user's choice 5 Nov 2026): the honesty note is NOTICE, shown on
   the home page. */

/* every page, in reading order; `built` turns a page on in the tabs and in
   the home page's list as its phase is finished */
export const PAGES = [
  { href: 'index.html', label: 'Home', built: true },
  { href: 'welford.html', label: 'Welford (Ex. 1)', built: true,
    blurb: 'The recurrences derived the way Knuth derives the running mean; the mechanism drawn step by step (number line, rectangle, running sum of squares); the 3-line code; and why it is stable where the textbook formula returns a negative variance.' },
  { href: 'sampling.html', label: 'Sampling (Ex. 2)', built: true,
    blurb: 'Thousands of samples from four distributions: the average of the sample means and of the sample variances closing in on μ and σ², the biased SS/n missing, and the sampling distributions behind every interval.' },
  { href: 'hackers.html', label: 'Hackers', built: true,
    blurb: 'HW4 with 0–10 scores: m hackers attack n systems each, Welford per hacker, the averages against μ and σ² with their standard errors; and what changes when hackers differ (novices and experts).' },
  { href: 'n-effect.html', label: 'Effect of n', built: false,
    blurb: 'The same experiment for n from 2 to 1000: the spread of the sample means and variances falling like 1/n, the tails setting the constant for the variance, the bias of SS/n and of s vanishing, and how many systems a defender must watch.' },
  { href: 'intervals.html', label: 'Intervals', built: false,
    blurb: 'Do 95 % intervals contain the truth 95 % of the time? The t-interval for μ recovers with n for every shape; the χ² interval for σ² misses by a fixed amount set by the kurtosis.' },
  { href: 'anomalies.html', label: 'Anomalies', built: false,
    blurb: 'A defender keeps a running baseline per attacker and alarms on unusual scores. Frozen, Welford and exponentially weighted baselines against a sudden change and against an attacker who changes slowly enough to be learned.' },
  { href: 'privacy.html', label: 'Merge & privacy', built: false,
    blurb: 'Summaries computed apart merge exactly (Chan), but two of them one record apart reveal it. The Laplace mechanism publishes mean and variance with differential privacy, and Welford gives its sensitivity.' },
  { href: 'nature.html', label: 'Nature', built: false,
    blurb: 'Averaging, 1/√N noise and variance as a measurement in physics and biology, from thermal fluctuations to ion channels, with a photon shot-noise demo.' },
  { href: 'essay.html', label: 'Essay', built: false,
    blurb: 'The argument in prose, with the measured numbers and the evidence behind each claim.' },
];

/** Shell arguments for one page of hw05. @param {string} current its filename */
export const hw05Shell = (current) => ({
  title: 'HW05 · Welford, sampling mean and variance',
  subtitle: 'Running statistics, unbiased estimators, and m hackers × n systems',
  links: PAGES.filter((p) => p.built),
  current,
  home: '../index.html',
  footer: false,   // no site footer, as hw04 (user's choice, 5 Nov 2026); NOTICE is on the home page
});

/** The honesty note, shown once on the home page. */
export const NOTICE = 'An educational model, not attack data: the 0–10 scores come from a distribution chosen by assumption, and every simulation uses a seeded, non-cryptographic generator (xoshiro128**) so that any run can be reproduced from its seed. The differential-privacy noise is a simulation of the mechanism, not a deployable implementation. Everything runs in your browser; nothing is sent anywhere.';

/* What every page shares: the score distribution and the run (hackers m,
   systems n, seed), so that each page looks at the same experiment. */
export const STICKY = ['dist', 'p', 'a', 'b', 'm', 'n', 'seed'];
export const MEMORY = 'hw05';
