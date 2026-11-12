/* nist-table.js — the web reference of Ex. 2: rows of the NIST/SEMATECH e-Handbook table of the standard
   normal distribution, transcribed by hand (never fetched at runtime). The table gives the area from 0 to z
   to 5 decimals, so each row must equal Φ(z) − ½ rounded to 5 decimals. */
export default {
  source: 'NIST/SEMATECH e-Handbook of Statistical Methods, §1.3.6.7.1 "Cumulative Distribution Function of the Standard Normal Distribution"',
  url: 'https://itl.nist.gov/div898/handbook/eda/section3/eda3671.htm',
  retrieved: '2026-11-11',
  tabulates: 'area under the standard normal density from 0 to z',
  rows: [
    [0.5, '0.19146'], [1.0, '0.34134'], [1.64, '0.44950'], [1.96, '0.47500'], [2.0, '0.47725'],
    [2.58, '0.49506'], [3.0, '0.49865'], [3.5, '0.49977'], [4.0, '0.49997'],
  ],
};
