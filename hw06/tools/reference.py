"""reference.py — the trusted values of hw06, computed once at 80 significant digits
with Python's standard library only (`decimal`), and written as ES modules into
hw06/data/ so that the pages and Node import them like code (no fetch at runtime).

    python3 hw06/tools/reference.py           # write hw06/data/{phi-reference,cdt-tables,chebyshev}.js
    python3 hw06/tools/reference.py --check   # cross-check the two methods, print the test points

Category: reference. Why two methods: a reference computed one way can share the
bug of the code it judges; two independent expansions that agree to 60+ digits
cannot both be wrong in the same way (note 03 §3).

  Method A, positive series (note 03 §2 M4; [[Error function]]):
      Φ(x) − ½ = φ(x) · Σ_{n≥0} x^{2n+1} / (2n+1)!!     every term positive for x > 0,
      so no cancellation inside the sum; used for |x| < 6.
  Method B, Laplace's continued fraction (note 03 §2 M5):
      Q(x) = 1 − Φ(x) = φ(x) / (x + 1/(x + 2/(x + 3/(x + …))))     for x > 0,
      evaluated backward from a fixed depth; converges fast for large x; used for |x| ≥ 6.
  π is an 80-digit literal: Decimal has no π of its own.

The x of every point is the exact binary64 value (Decimal(float) is exact), so the
reference is the true Φ at the very double the JavaScript code receives.
"""
from decimal import Decimal as D, getcontext, ROUND_FLOOR
import math
import os
import sys

getcontext().prec = 80
PI = D("3.14159265358979323846264338327950288419716939937510582097494459230781640628620899")
SQ2PI = (2 * PI).sqrt()
HALF = D("0.5")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")


def phi_pdf(x):
    """φ(x) = e^{−x²/2} / √(2π), at 80 digits."""
    return (-(x * x) / 2).exp() / SQ2PI


def series_half(x):
    """Method A: Φ(x) − ½ = φ(x) Σ x^{2n+1}/(2n+1)!!, for x ≥ 0 (each term is the
    previous one times x²/(2n+1)); stops when a term is below 10⁻⁷⁵ of the sum."""
    term = x
    s = x
    n = 0
    while True:
        n += 1
        term = term * x * x / (2 * n + 1)
        s += term
        if abs(term) < abs(s) * D(10) ** (-75) and n > 5:
            break
    return phi_pdf(x) * s


def cf_tail(x, depth):
    """Method B at a fixed depth: the continued fraction x + 1/(x + 2/(x + …)),
    evaluated from the bottom up (backward), for x > 0."""
    t = D(0)
    for k in range(depth, 0, -1):
        t = D(k) / (x + t)
    return x + t


def Q_cf(x, depth=None):
    """Q(x) = φ(x) / CF(x) for x > 0. With no depth given, the depth doubles from
    100 until two successive values agree to 10⁻⁷⁵ relative."""
    if depth is not None:
        return phi_pdf(x) / cf_tail(x, depth)
    d, prev = 100, cf_tail(x, 100)
    while True:
        d *= 2
        cur = cf_tail(x, d)
        if abs(cur - prev) < abs(cur) * D(10) ** (-75):
            return phi_pdf(x) / cur
        prev = cur


def Phi(x):
    """Φ(x) at 80 digits. Returns (Φ, Q = 1 − Φ, method). Both tails are kept, so
    that Φ(x) ≈ 1 still has a meaningful upper tail Q(x)."""
    x = D(x)
    if x == 0:
        return HALF, HALF, "exact"
    a = abs(x)
    if a < 6:
        lower = HALF - series_half(a)       # = Φ(−a) = Q(a)
        method = "A"
    else:
        lower = Q_cf(a)
        method = "B"
    return (1 - lower, lower, method) if x > 0 else (lower, 1 - lower, method)


def cross_check(x):
    """|A − B| / B for Q(x), 2 ≤ x < 6, with B at depth 20 000 (draft §8.5: < 10⁻⁶⁰)."""
    x = D(x)
    a = HALF - series_half(x)
    b = Q_cf(x, 20000)
    return abs(a - b) / b


def sig(v, digits=25):
    """A Decimal as a string with `digits` significant digits (JS Number() reads it
    to the nearest double)."""
    return f"{v:.{digits - 1}e}" if v != 0 else "0"


# ---------------------------------------------------------------------------
# Φ reference: test points (draft §8.2) and the dense grid of E7

TEST_POINTS = [-37.5, -30, -20, -10, -9, -8.25, -8, -6, -5, -5.451310437845478, -4, -3, -2.5, -2, -1.5, -1,
               -0.5, -0.125, 0, 0.5, 1, 1.5, 1.6448536269514722, 1.959963984540054, 2, 2.5, 3, 4, 5, 6, 8, 8.25]
GRID = [-37.5 + i * (45.75 / 2000) for i in range(2001)]          # 2001 doubles on [−37.5, 8.25]
FAR = [-38.5, -40, -50, -100, -1000]                              # Φ underflows: log Φ only


def log_phi_far(x):
    """log Φ(x) for x ≪ 0 from Method B: −x²/2 − ln √(2π) − ln CF(|x|)."""
    a = -D(x)
    d = 100
    prev = cf_tail(a, d)
    while True:
        d *= 2
        cur = cf_tail(a, d)
        if abs(cur - prev) < abs(cur) * D(10) ** (-75):
            break
        prev = cur
    return -(a * a) / 2 - SQ2PI.ln() - cur.ln()


def phi_rows(xs):
    rows = []
    for x in xs:
        p, q, method = Phi(D(float(x)))
        rows.append(f"[{x!r}, '{sig(p)}', '{sig(q)}', '{sig(p.ln()) if p > 0 else ''}', '{method}']")
    return rows


# ---------------------------------------------------------------------------
# M8: Chebyshev expansions of Φ with a fixed number of operations

def cheb_coeffs(g, n):
    """Chebyshev interpolation of g on [−1, 1] at the n Chebyshev nodes:
    c_k = (2/n) Σ_j g(cos θ_j) cos(k θ_j), θ_j = π(j + ½)/n (c₀ halved). 80 digits,
    so the coefficients themselves carry no rounding error into binary64."""
    nodes = []
    for j in range(n):
        theta = PI * (D(j) + HALF) / n
        nodes.append((theta, g(cos_d(theta))))
    out = []
    for k in range(n):
        s = sum(gv * cos_d(k * th) for th, gv in nodes)
        out.append(s * 2 / n / (2 if k == 0 else 1))
    return out


def cos_d(t):
    """cos of a Decimal by its Taylor series after reduction to [0, 2π) (80 digits)."""
    t = t % (2 * PI)
    term = D(1)
    s = D(1)
    n = 0
    while abs(term) > D(10) ** (-85):
        n += 2
        term = -term * t * t / ((n - 1) * n)
        s += term
    return s


def chebyshev(s=D(2), c=D(4), tol=D(10) ** (-17)):
    """M8 coefficients, both pieces (draft §4.5; note 03 §2):
      tail  |x| ≥ s:  Q(a) = φ(a) g(u) / a,  g(a) = a Q(a)/φ(a) ∈ (0, 1],  u = (a − c)/(a + c) ∈ [(s−c)/(s+c), 1);
      body  |x| < s:  Φ(x) − ½ = φ(x) · x · h(x²),  h(v) = Σ v^n/(2n+1)!!,  w = 2x²/s² − 1 ∈ [−1, 1).
    g is fitted on the u-interval mapped to [−1, 1]; each series is cut where the
    coefficients fall below tol (relative to c₀)."""
    u0 = (s - c) / (s + c)

    def g_of_t(t):                       # t ∈ [−1, 1] → u ∈ [u0, 1] → a
        u = u0 + (t + 1) * (1 - u0) / 2
        if u >= 1:
            return D(1)
        a = c * (1 + u) / (1 - u)
        if a >= 6:                       # g = a/CF(a) directly: φ(a) would underflow for huge a
            return Q_cf(a) / phi_pdf(a) * a if a < 1000 else a / cf_tail(a, 400)
        return a * (HALF - series_half(a)) / phi_pdf(a)

    def h_of_t(t):                       # t ∈ [−1, 1] → v = x² ∈ [0, s²]
        v = (t + 1) * s * s / 2
        term = D(1)
        acc = D(1)
        n = 0
        while abs(term) > D(10) ** (-80):
            n += 1
            term = term * v / (2 * n + 1)
            acc += term
        return acc

    out = {}
    for name, g in (("tail", g_of_t), ("body", h_of_t)):
        full = cheb_coeffs(g, 80)
        keep = len(full)
        while keep > 1 and abs(full[keep - 1]) < tol * abs(full[0]):
            keep -= 1
        out[name] = [sig(x, 20) for x in full[:keep]]
    return {"s": str(s), "c": str(c), "u0": sig(u0, 20), **out}


# ---------------------------------------------------------------------------
# CDT tables (draft §4.9): the discrete Gaussian on {−T..T}, its cumulative table
# C_i = ⌊2^b F_i⌋ (last entry 2^b), and the statistical distance it introduces.
# Above 48 bits a table built from binary64 F_i is wrong in its low bits; these
# exact integer tables are the reference the lattice page compares with.

CDT_SIGMAS = [1, 1.5, 2, 3, 4, 5, 8, 10, 16, 20]
CDT_BITS = [8, 16, 32, 48, 64]


def cdt(sigma, T):
    sigma = D(str(sigma))
    w = [(-(D(x) * D(x)) / (2 * sigma * sigma)).exp() for x in range(-T, T + 1)]
    total = sum(w)
    p = [wi / total for wi in w]
    F, acc = [], D(0)
    for pi in p:
        acc += pi
        F.append(acc)
    tables = {}
    for b in CDT_BITS:
        scale = D(2) ** b
        C = [int((scale * f).to_integral_value(rounding=ROUND_FLOOR)) for f in F]
        C[-1] = 2 ** b
        q = [(C[i] - (C[i - 1] if i else 0)) for i in range(len(C))]
        sd = sum(abs(p[i] - D(q[i]) / scale) for i in range(len(p))) / 2
        zeros = sum(1 for qi in q if qi == 0)
        tables[b] = {"C": C, "sd": sd, "zeros": zeros}
    return p, tables


def cdt_module():
    entries = []
    for sigma in CDT_SIGMAS:
        T = math.ceil(13 * sigma)
        p, tables = cdt(sigma, T)
        parts = [f"sigma: {sigma}", f"T: {T}", "pmf: [" + ", ".join(f"'{sig(x)}'" for x in p) + "]"]
        for b in CDT_BITS:
            t = tables[b]
            parts.append(f"b{b}: {{ sd: '{sig(t['sd'], 12)}', zeros: {t['zeros']}"
                         + (", C: [" + ", ".join(f"'{c}'" for c in t["C"]) + "]" if b >= 48 else "") + " }")
        entries.append("  { " + ",\n    ".join(parts) + " }")
    return entries


# ---------------------------------------------------------------------------

HEADER = """/* {name} — generated by hw06/tools/reference.py (Python decimal, 80 digits). Do not edit by hand:
   rerun the script. {what} */
"""


def write(name, what, body):
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, name), "w") as f:
        f.write(HEADER.format(name=name, what=what))
        f.write(body)
    print("wrote", os.path.join("hw06/data", name))


def main():
    rows_t = phi_rows(TEST_POINTS)
    rows_g = phi_rows(GRID)
    far = [f"[{x!r}, '{sig(log_phi_far(x))}']" for x in FAR]
    cross = [f"[{x!r}, '{sig(cross_check(D(x)), 3)}']" for x in (2, 2.5, 3, 4, 5, 5.9)]
    write("phi-reference.js",
          "Each row: [x (the exact double), Φ(x), Q(x) = 1 − Φ(x), ln Φ(x), method] with 25 significant\n"
          "   digits; method A = positive series (|x| < 6), B = Laplace continued fraction (|x| ≥ 6).",
          "export default {\n"
          "  digits: 80,\n"
          "  methods: { A: 'positive series φ(x) Σ x^(2n+1)/(2n+1)!!', B: 'Laplace continued fraction, backward' },\n"
          "  test: [\n    " + ",\n    ".join(rows_t) + "\n  ],\n"
          "  grid: [\n    " + ",\n    ".join(rows_g) + "\n  ],\n"
          "  far: [\n    " + ",\n    ".join(far) + "\n  ],\n"
          "  crossCheck: [\n    " + ",\n    ".join(cross) + "\n  ],\n"
          "};\n")
    ch = chebyshev()
    write("chebyshev.js",
          "M8: Chebyshev coefficients of g(a) = aQ(a)/φ(a) on a ≥ s (variable u = (a − c)/(a + c))\n"
          "   and of h(x²) = (Φ(x) − ½)/(x φ(x)) on |x| < s, fitted to 80-digit values.",
          "export default {\n"
          f"  s: {ch['s']}, c: {ch['c']}, u0: {ch['u0']},\n"
          f"  tail: [{', '.join(ch['tail'])}],\n"
          f"  body: [{', '.join(ch['body'])}],\n"
          "};\n")
    write("cdt-tables.js",
          "Discrete Gaussian on {−T..T}, T = ⌈13σ⌉: the pmf (25 digits), and for b = 8…64 bits the\n"
          "   statistical distance and zero-probability count of the CDT ⌊2^b F_i⌋; exact tables C for b ≥ 48.",
          "export default [\n" + ",\n".join(cdt_module()) + "\n];\n")


def check():
    print("Method A (series) vs B (continued fraction, depth 20 000), relative difference of Q(x):")
    for x in ["2", "2.5", "3", "4", "5", "5.9"]:
        print(f"  x = {x:>4}: {cross_check(D(x)):.2e}")
    print("\nThe test points (18 significant digits):")
    for x in TEST_POINTS:
        p, q, method = Phi(D(float(x)))
        print(f"  Φ({x!r:>20}) = {p:.17e}   [{method}]")
    for x in FAR:
        print(f"  ln Φ({x}) = {log_phi_far(x):.15f}")


if __name__ == "__main__":
    check() if "--check" in sys.argv else main()
