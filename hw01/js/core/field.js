/* field.js — arithmetic in the prime field F_p = {0, 1, ..., p-1}.
   Everything the curve needs: the four operations mod p, fast powering,
   the modular inverse (this is how "division" exists at all), and Euler's
   criterion to recognise squares. Pure BigInt, no DOM: see curve.js for use. */

export class PrimeField {
  /** @param {bigint|number} p a prime > 3 */
  constructor(p) {
    this.p = BigInt(p);
    this.ops = { mul: 0, inv: 0 };   // counters shown by the keygen page
  }

  resetOps() { this.ops = { mul: 0, inv: 0 }; }

  /** Non-negative representative. JavaScript's % keeps the sign of the
   *  dividend (-3n % 17n === -3n), so the +p is not decoration. */
  mod(a) {
    const r = BigInt(a) % this.p;
    return r < 0n ? r + this.p : r;
  }

  add(a, b) { return this.mod(a + b); }
  sub(a, b) { return this.mod(a - b); }
  neg(a)    { return this.mod(-a); }

  mul(a, b) {
    this.ops.mul++;
    return this.mod(a * b);
  }

  /** a^e mod p by square-and-multiply: O(log e) multiplications. */
  pow(a, e) {
    let base = this.mod(a), exp = BigInt(e), acc = 1n;
    while (exp > 0n) {
      if (exp & 1n) acc = this.mod(acc * base);
      base = this.mod(base * base);
      exp >>= 1n;
    }
    return acc;
  }

  /** The inverse of a: the x with a*x = 1 (mod p).
   *  Extended Euclid tracks the coefficients of gcd(a, p) = s*a + t*p;
   *  since p is prime the gcd is 1 for every a != 0, so s is the inverse.
   *  This is the only reason the curve formulas may "divide" at all. */
  inv(a) {
    const value = this.mod(a);
    if (value === 0n) throw new Error('0 has no inverse mod p (the group law hits this as a vertical line)');
    this.ops.inv++;
    let [oldR, r] = [value, this.p];
    let [oldS, s] = [1n, 0n];
    while (r !== 0n) {
      const q = oldR / r;                       // BigInt division truncates: exactly what Euclid wants
      [oldR, r] = [r, oldR - q * r];
      [oldS, s] = [s, oldS - q * s];
    }
    return this.mod(oldS);
  }

  /** Same inverse by Fermat's little theorem, a^(p-2) = a^-1. Slower here,
   *  kept so the two routes can be compared on screen. */
  invFermat(a) {
    if (this.mod(a) === 0n) throw new Error('0 has no inverse mod p');
    return this.pow(a, this.p - 2n);
  }

  /** Euler's criterion: a^((p-1)/2) is 1 for squares and p-1 for non-squares.
   *  Used to count how many y satisfy y² = rhs, i.e. to count curve points. */
  isSquare(a) {
    const value = this.mod(a);
    return value === 0n || this.pow(value, (this.p - 1n) / 2n) === 1n;
  }
}

/** Trial division — enough for the p <= 5000 the explorer allows. */
export function isPrime(n) {
  const value = BigInt(n);
  if (value < 2n) return false;
  for (let d = 2n; d * d <= value; d++) if (value % d === 0n) return false;
  return true;
}

/** Divisors of n in ascending order; Lagrange says ord(P) is one of them. */
export function divisors(n) {
  const value = BigInt(n);
  const small = [], large = [];
  for (let d = 1n; d * d <= value; d++) {
    if (value % d !== 0n) continue;
    small.push(d);
    if (d * d !== value) large.unshift(value / d);
  }
  return small.concat(large);
}
