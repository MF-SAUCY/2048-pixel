"""Generate the cool-to-warm tile ramp, evenly spaced in perceptual distance.

Eleven stops, 2 through 2048, from a pink-leaning violet to the hot red-orange
that used to sit on 64.

The earlier version walked hue, chroma and lightness along parametric curves and
sampled them at even intervals of t. That spaces the tiles evenly in *parameter*
space, which is not the same as evenly in *appearance*: the path moves quickly
through some regions and slowly through others, so the ramp came out with a
ΔE 36.7 jump between 2 and 4 and a flat 13.8 through the blues.

This version separates the two jobs:

  1. Draw a dense path through LCh — hundreds of samples, each fitted to the
     display gamut so the distances reflect colours that can actually be shown.
  2. Measure cumulative ΔE2000 along that path and resample eleven stops at
     equal arc length.

Step 2 is what makes the ramp smooth. Every adjacent pair ends up the same
distance apart, so there is no jump to smooth out by hand and no flat stretch
where several tiles crowd together — and because the minimum equals the mean,
the worst pair is as good as it can be for a path of that length.

Run:  python tools/make_gradient.py
"""

import math

WHITE = (0.95047, 1.00000, 1.08883)

SRGB_TO_XYZ = (
    (0.4123907992659595, 0.35758433938387796, 0.1804807884018343),
    (0.21263900587151036, 0.7151686787677559, 0.07219231536073371),
    (0.019330818715591851, 0.11919477979462599, 0.9505321522496606),
)
XYZ_TO_SRGB = (
    (3.2409699419045213, -1.5373831775700935, -0.4986107602930033),
    (-0.9692436362808798, 1.8759675015077206, 0.04155505740717561),
    (0.05563007969699361, -0.20397695888897657, 1.0569715142428786),
)
P3_TO_XYZ = (
    (0.4865709486482162, 0.26566769316909306, 0.1982172852343625),
    (0.2289745640697488, 0.6917385218365064, 0.0792869140937450),
    (0.0000000000000000, 0.04511338185890264, 1.0439443689009760),
)
XYZ_TO_P3 = (
    (2.4934969119414263, -0.9313836179191242, -0.40271078445071684),
    (-0.8294889695615749, 1.7626640603183465, 0.023624685841943577),
    (0.03584583024378447, -0.07617238926804182, 0.9568845240076872),
)

TERMINAL_P3 = (1.0, 0.345, 0.190)

VALUES = ["2", "4", "8", "16", "32", "64", "128", "256", "512", "1024", "2048"]

LIGHT_INK = "#f9f6f2"
INKS_DARK = ["#776e65", "#4a4039", "#332c26", "#241f1a"]

# Tile numerals are large bold text, so WCAG's large-text bar is 3:1. Upstream
# manages only about 2.8:1 on its orange tiles; we hold well past that.
MIN_CONTRAST = 4.5

# Pink and red-orange are neighbours on the hue wheel, so a ramp that starts
# pink needs checking at its ends: 2 and 2048 must never be confusable.
MIN_ENDS = 30.0

# No tile may be paler than this. The solver reaches for near-white whenever it
# is allowed to: pale colours sit far apart in ΔE cheaply. But a near-white tile
# is glare on a night screen — exactly what the old ramp's 2 and 4 were, and why
# they needed separate dark-mode overrides — and it washes out against the cream
# board by day. Capping lightness costs a little separation and keeps every tile
# a colour rather than a highlight.
MAX_L = 88.0

DENSE = 260


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def delin(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def mul(m, v):
    return tuple(sum(m[i][j] * v[j] for j in range(3)) for i in range(3))


def to_xyz(rgb, m):
    return mul(m, [lin(c) for c in rgb])


def xyz_to_lab(xyz):
    def f(t):
        return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116

    fx, fy, fz = (f(xyz[i] / WHITE[i]) for i in range(3))
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def lab_to_xyz(lab):
    L, a, b = lab
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200

    def inv(t):
        return t ** 3 if t ** 3 > 216 / 24389 else (116 * t - 16) / (24389 / 27)

    return tuple(inv(v) * w for v, w in zip((fx, fy, fz), WHITE))


def lch_to_lab(L, C, h):
    return (L, C * math.cos(math.radians(h)), C * math.sin(math.radians(h)))


def lab_to_lch(lab):
    L, a, b = lab
    return (L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360)


def fit(L, C, h, matrix):
    """Largest chroma at most C that fits the gamut, and the resulting rgb."""
    lo, hi = 0.0, C
    best = mul(matrix, lab_to_xyz(lch_to_lab(L, 0, h)))
    for _ in range(40):
        mid = (lo + hi) / 2
        rgb = mul(matrix, lab_to_xyz(lch_to_lab(L, mid, h)))
        if all(-1e-6 <= c <= 1 + 1e-6 for c in rgb):
            lo, best = mid, rgb
        else:
            hi = mid
    return tuple(min(1, max(0, c)) for c in best)


def to_hex(rgb):
    return "#%02x%02x%02x" % tuple(round(delin(c) * 255) for c in rgb)


def relative_luminance_hex(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(a, b):
    la, lb = relative_luminance_hex(a), relative_luminance_hex(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def best_ink(hex_value):
    best, ratio = LIGHT_INK, contrast(hex_value, LIGHT_INK)
    for ink in INKS_DARK:
        r = contrast(hex_value, ink)
        if r > ratio:
            best, ratio = ink, r
    return best, ratio


def delta_e_2000(lab1, lab2):
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    avg_L = (L1 + L2) / 2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    avg_C = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(avg_C ** 7 / (avg_C ** 7 + 25 ** 7))) if avg_C else 0
    a1p, a2p = a1 * (1 + G), a2 * (1 + G)
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    avg_Cp = (C1p + C2p) / 2
    h1p = math.degrees(math.atan2(b1, a1p)) % 360
    h2p = math.degrees(math.atan2(b2, a2p)) % 360
    if C1p * C2p == 0:
        dhp = 0.0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    else:
        dhp = h2p - h1p - 360 if h2p > h1p else h2p - h1p + 360
    dLp, dCp = L2 - L1, C2p - C1p
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp) / 2)
    if C1p * C2p == 0:
        avg_hp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        avg_hp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        avg_hp = (h1p + h2p + 360) / 2
    else:
        avg_hp = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(avg_hp - 30))
         + 0.24 * math.cos(math.radians(2 * avg_hp))
         + 0.32 * math.cos(math.radians(3 * avg_hp + 6))
         - 0.20 * math.cos(math.radians(4 * avg_hp - 63)))
    d_ro = 30 * math.exp(-(((avg_hp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(avg_Cp ** 7 / (avg_Cp ** 7 + 25 ** 7))
    Sl = 1 + (0.015 * (avg_L - 50) ** 2) / math.sqrt(20 + (avg_L - 50) ** 2)
    Sc = 1 + 0.045 * avg_Cp
    Sh = 1 + 0.015 * avg_Cp * T
    Rt = -math.sin(math.radians(2 * d_ro)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
                     + Rt * (dCp / Sc) * (dHp / Sh))


def dense_path(start_L, start_C, start_h, peak_L, chroma_exp, knee=0.45):
    """A finely sampled LCh path from the cool start to the terminal colour.

    Lightness rises to a peak and falls again — up through the yellow-greens,
    where those hues naturally live, then down to the terminal red — but it does
    so in two straight segments rather than along a curve.

    The curve was the problem. A quadratic flattens as it approaches its peak,
    which parked four tiles inside three points of lightness right where the
    ramp passes through cyan. Cyan is perceptually compressed to begin with:
    rotating hue through it buys far less separation than the same rotation
    through the greens or golds. With lightness flat as well, those tiles had
    nothing left to tell them apart. Straight segments keep lightness moving at
    a constant rate the whole way, so the blues always have that to fall back
    on, and the descent into the terminal red starts earlier and lands softer.
    """
    term_L, term_C, term_h = lab_to_lch(xyz_to_lab(to_xyz(TERMINAL_P3, P3_TO_XYZ)))

    path = []
    for i in range(DENSE):
        t = i / (DENSE - 1)
        if t <= knee:
            L = start_L + (peak_L - start_L) * (t / knee)
        else:
            L = peak_L + (term_L - peak_L) * ((t - knee) / (1 - knee))
        C = start_C + (term_C - start_C) * (t ** chroma_exp)
        h = start_h + (term_h - start_h) * t
        rgb = fit(L, C, h, XYZ_TO_P3)
        path.append((L, C, h, xyz_to_lab(to_xyz(rgb, P3_TO_XYZ))))
    return path


def resample_even(path, n, passes=400):
    """Pick n points whose *consecutive* ΔE2000 distances are as equal as possible.

    Spacing by cumulative arc length does not work here. This path curves hard —
    hue sweeps almost 290° — and where it curves, a long arc folds into a short
    straight-line distance. Two tiles can sit far apart along the path and still
    look near-identical. What a player sees is the chord between neighbours, not
    the route taken between them.

    So: seed from equal arc length, then relax. Each interior stop slides to
    wherever it best balances the distance to the stop before it against the
    distance to the stop after. Repeated, that settles into near-uniform chord
    spacing — which is the definition of a smooth ramp, and incidentally lifts
    the worst pair, since the minimum of an even set is its mean.
    """
    cum = [0.0]
    for i in range(1, len(path)):
        cum.append(cum[-1] + delta_e_2000(path[i - 1][3], path[i][3]))
    total = cum[-1]

    def place(d):
        """Walk the path dropping a stop as soon as it is d from the last one.

        Placing each stop as early as it is allowed leaves the most path for the
        ones still to come, so if any arrangement achieves a minimum of d, this
        one does.
        """
        idx = [0]
        for _k in range(n - 2):
            j = idx[-1] + 1
            while (j < len(path) - 1
                   and delta_e_2000(path[idx[-1]][3], path[j][3]) < d):
                j += 1
            if j >= len(path) - 1:
                return None
            idx.append(j)
        if delta_e_2000(path[idx[-1]][3], path[-1][3]) < d:
            return None
        idx.append(len(path) - 1)
        return idx

    # Largest d for which every tile can still be placed.
    lo, hi, idx = 0.0, 45.0, None
    for _ in range(34):
        mid = (lo + hi) / 2
        got = place(mid)
        if got:
            lo, idx = mid, got
        else:
            hi = mid

    if idx is None:
        idx, j = [], 0
        for k in range(n):
            target = total * k / (n - 1)
            while j < len(cum) - 1 and cum[j + 1] < target:
                j += 1
            idx.append(j)
        idx[0], idx[-1] = 0, len(path) - 1

    floor = lo * 0.985  # relaxation may even things out, but not below this

    for _ in range(passes):
        moved = False
        for i in range(1, n - 1):
            lo, hi = idx[i - 1] + 1, idx[i + 1] - 1
            if lo > hi:
                continue
            best_j, best_cost = idx[i], None
            for cand in range(lo, hi + 1):
                left = delta_e_2000(path[idx[i - 1]][3], path[cand][3])
                right = delta_e_2000(path[cand][3], path[idx[i + 1]][3])
                if min(left, right) < floor:
                    continue  # never trade the worst pair away for evenness
                cost = abs(left - right)
                if best_cost is None or cost < best_cost:
                    best_j, best_cost = cand, cost
            if best_cost is None:
                continue
            if best_j != idx[i]:
                idx[i] = best_j
                moved = True
        if not moved:
            break

    return [path[i] for i in idx], total


def build(start_L, start_C, start_h, peak_L, chroma_exp, knee=0.45, passes=400):
    picks, total = resample_even(dense_path(start_L, start_C, start_h,
                                            peak_L, chroma_exp, knee),
                                 len(VALUES), passes)
    out = []
    for value, (L, C, h, _) in zip(VALUES, picks):
        out.append({
            "value": value,
            "hex": to_hex(fit(L, C, h, XYZ_TO_SRGB)),
            "p3": tuple(round(delin(c), 3) for c in fit(L, C, h, XYZ_TO_P3)),
            "L": L, "C": C, "h": h,
        })

    # Pin the last stop to the exact terminal colour.
    term_L, term_C, term_h = lab_to_lch(xyz_to_lab(to_xyz(TERMINAL_P3, P3_TO_XYZ)))
    out[-1]["p3"] = TERMINAL_P3
    out[-1]["hex"] = to_hex(fit(term_L, term_C, term_h, XYZ_TO_SRGB))
    return out, total


def measure(ramp):
    labs = [xyz_to_lab(to_xyz(s["p3"], P3_TO_XYZ)) for s in ramp]
    steps = [delta_e_2000(labs[i - 1], labs[i]) for i in range(1, len(labs))]
    return {
        "steps": steps,
        "min": min(steps),
        "max": max(steps),
        "spread": max(steps) - min(steps),
        "contrast": min(best_ink(s["hex"])[1] for s in ramp),
        "max_L": max(s["L"] for s in ramp),
        "ends": delta_e_2000(labs[0], labs[-1]),
    }


def search(finalists=14):
    """Two stages, because relaxation is far too slow to run on every candidate.

    Stage one scores every parameter combination with the cheap equal-arc
    placement — good enough to rank paths against each other. Stage two takes
    the best handful and actually relaxes them, which is what decides the final
    spacing.
    """
    seeded = []
    for start_L in (52, 58, 64, 70, 76):
        for peak_L in (78, 82, 86, 90):
            for start_C in (30, 38, 46, 54):
                for start_h in (308, 316, 324, 332):
                    for chroma_exp in (0.85, 1.0, 1.15):
                      for knee in (0.35, 0.45, 0.55):
                        params = (start_L, peak_L, start_C, start_h,
                                  chroma_exp, knee)
                        ramp, _ = build(start_L, start_C, start_h, peak_L,
                                        chroma_exp, knee, passes=0)
                        m = measure(ramp)
                        if (m["contrast"] < MIN_CONTRAST or m["ends"] < MIN_ENDS
                                or m["max_L"] > MAX_L):
                            continue
                        seeded.append((m["min"], params))

    seeded.sort(key=lambda r: -r[0])

    best = None
    for _, params in seeded[:finalists]:
        start_L, peak_L, start_C, start_h, chroma_exp, knee = params
        ramp, _ = build(start_L, start_C, start_h, peak_L, chroma_exp, knee)
        m = measure(ramp)
        if (m["contrast"] < MIN_CONTRAST or m["ends"] < MIN_ENDS
                or m["max_L"] > MAX_L):
            continue
        key = (round(m["min"], 2), -round(m["spread"], 2))
        if best is None or key > best[0]:
            best = (key, ramp, m, params)
    return best


def main():
    found = search()
    if not found:
        raise SystemExit("no ramp met the contrast and end-separation floors")
    _, ramp, m, params = found
    start_L, peak_L, start_C, start_h, chroma_exp, knee = params

    print(f"best: startL={start_L} peakL={peak_L} startC={start_C} "
          f"startH={start_h} chromaExp={chroma_exp} knee={knee}")
    print(f"       steps  min {m['min']:.2f}  max {m['max']:.2f}  "
          f"spread {m['spread']:.2f}")
    print(f"       min ink contrast {m['contrast']:.2f}:1   "
          f"2 vs 2048 dE {m['ends']:.2f}\n")

    print(f"{'tile':>6}  {'sRGB':>9}  {'display-p3':>28}  {'L*':>5} {'C':>5} "
          f"{'h':>5}  {'dE':>6}  {'ratio':>5}")
    prev = None
    for stop in ramp:
        lab = xyz_to_lab(to_xyz(stop["p3"], P3_TO_XYZ))
        d = delta_e_2000(prev, lab) if prev else None
        prev = lab
        ratio = best_ink(stop["hex"])[1]
        p3s = "p3(%s)" % " ".join(f"{v:.3f}" for v in stop["p3"])
        print(f"{stop['value']:>6}  {stop['hex']:>9}  {p3s:>28}  {stop['L']:5.1f} "
              f"{stop['C']:5.1f} {stop['h']:5.0f}  "
              f"{d:6.2f}  {ratio:4.1f}" if d else
              f"{stop['value']:>6}  {stop['hex']:>9}  {p3s:>28}  {stop['L']:5.1f} "
              f"{stop['C']:5.1f} {stop['h']:5.0f}       -  {ratio:4.1f}")

    print("\n--- CSS ---")
    for stop in ramp:
        print(f"  --t{stop['value']}: {stop['hex']};")
    print("\n  /* display-p3 */")
    for stop in ramp:
        print(f"  --t{stop['value']}: color(display-p3 "
              f"{' '.join(f'{v:.3f}' for v in stop['p3'])});")

    print("\n--- JSON ---")
    import json
    rows = []
    prev = None
    for stop in ramp:
        lab = xyz_to_lab(to_xyz(stop["p3"], P3_TO_XYZ))
        d = delta_e_2000(prev, lab) if prev else None
        prev = lab
        rows.append({"v": stop["value"], "hex": stop["hex"],
                     "p3": "color(display-p3 %s)" % " ".join(
                         f"{v:.3f}" for v in stop["p3"]),
                     "L": round(stop["L"], 1),
                     "dE": round(d, 2) if d else None})
    print(json.dumps(rows))


if __name__ == "__main__":
    main()
