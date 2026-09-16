"""Generate the cool-to-warm tile ramp.

Eleven stops, 2 through 2048, walking from a cool pale blue to the hot
red-orange that used to sit on 64. The path is drawn in CIE LCh rather than by
picking hex values, because the point of the exercise is that neighbouring tiles
stay far apart perceptually — the previous gold run failed at exactly that.

Three things move together along the ramp:
  hue        rotates from cool to warm, ending exactly on the terminal colour
  lightness  descends monotonically, so "darker = bigger" is readable on its own
  chroma     climbs, so the ramp intensifies rather than just rotating

Lightness descending the whole way is a deliberate constraint. It costs some
vividness in the yellow-green middle (a yellow held below its natural lightness
reads as gold, not lemon) and buys a floor under every adjacent pair: even where
two hues are neighbours, the lightness step keeps them apart.

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

# Terminal colour: the hot red-orange the ramp has to land on.
TERMINAL_P3 = (1.0, 0.345, 0.190)

VALUES = ["2", "4", "8", "16", "32", "64", "128", "256", "512", "1024", "2048"]

LIGHT_INK = "#f9f6f2"
DARK_INK = "#776e65"


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


def in_gamut(rgb):
    return all(-1e-6 <= c <= 1 + 1e-6 for c in rgb)


def fit(L, C, h, matrix):
    """Largest chroma at most C that fits the gamut, plus the resulting rgb."""
    lo, hi = 0.0, C
    best = mul(matrix, lab_to_xyz(lch_to_lab(L, 0, h)))
    for _ in range(50):
        mid = (lo + hi) / 2
        rgb = mul(matrix, lab_to_xyz(lch_to_lab(L, mid, h)))
        if in_gamut(rgb):
            lo, best = mid, rgb
        else:
            hi = mid
    return tuple(min(1, max(0, c)) for c in best), lo


def to_hex(rgb):
    return "#%02x%02x%02x" % tuple(round(delin(c) * 255) for c in rgb)


def relative_luminance_hex(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(hex_a, hex_b):
    la, lb = relative_luminance_hex(hex_a), relative_luminance_hex(hex_b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


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


# Tile numerals are large bold text, so WCAG's large-text bar of 3:1 applies
# rather than 4.5:1. Upstream itself only manages about 2.8:1 on its orange
# tiles; we aim past that. A darker ink than upstream's #776e65 is what makes
# the mid-lightness tiles readable at all.
INKS_DARK = ["#776e65", "#4a4039", "#332c26", "#241f1a"]
MIN_CONTRAST = 3.6


def best_ink(hex_value):
    best, ratio = LIGHT_INK, contrast(hex_value, LIGHT_INK)
    for ink in INKS_DARK:
        r = contrast(hex_value, ink)
        if r > ratio:
            best, ratio = ink, r
    return best, ratio


def build(start_L, start_C, start_h, chroma_exp, mode, peak_L):
    """Walk LCh from the cool start to the terminal colour.

    mode "descend" runs lightness straight down, which makes "darker = bigger"
    readable on its own. mode "arc" lets lightness rise through the yellow-green
    middle, which is where those hues naturally live, then fall to the terminal
    red — more vivid, and it gives adjacent pairs a lightness step in both
    halves rather than one shallow slope across the whole ramp.
    """
    term_L, term_C, term_h = lab_to_lch(xyz_to_lab(to_xyz(TERMINAL_P3, P3_TO_XYZ)))

    n = len(VALUES)
    out = []
    for i in range(n):
        t = i / (n - 1)
        if mode == "descend":
            L = start_L + (term_L - start_L) * t
        else:
            L = ((1 - t) ** 2) * start_L + 2 * (1 - t) * t * peak_L + (t ** 2) * term_L
        C = start_C + (term_C - start_C) * (t ** chroma_exp)
        h = start_h + (term_h - start_h) * t

        srgb, _ = fit(L, C, h, XYZ_TO_SRGB)
        p3, _ = fit(L, C, h, XYZ_TO_P3)
        out.append({
            "value": VALUES[i],
            "hex": to_hex(srgb),
            "p3": tuple(round(delin(c), 3) for c in p3),
            "L": L, "C": C, "h": h,
        })

    # Pin the last stop to the exact terminal colour rather than an approximation.
    out[-1]["p3"] = TERMINAL_P3
    out[-1]["hex"] = to_hex(fit(term_L, term_C, term_h, XYZ_TO_SRGB)[0])
    return out


def score(ramp):
    """(minimum adjacent dE, minimum ink contrast) for a candidate ramp."""
    labs = [xyz_to_lab(to_xyz(s["p3"], P3_TO_XYZ)) for s in ramp]
    min_de = min(delta_e_2000(labs[i - 1], labs[i]) for i in range(1, len(labs)))
    min_ct = min(best_ink(s["hex"])[1] for s in ramp)
    return min_de, min_ct


def search():
    best = None
    for mode in ("descend", "arc"):
        for start_L in (60, 66, 72, 88, 90, 92):
            for peak_L in (88, 92, 95):
                for start_C in (20, 28, 36, 44):
                    for start_h in (248, 258, 268, 278):
                        for chroma_exp in (0.85, 1.0, 1.2):
                            if mode == "descend" and start_L < 80:
                                continue
                            if mode == "arc" and start_L > 80:
                                continue
                            ramp = build(start_L, start_C, start_h,
                                         chroma_exp, mode, peak_L)
                            de, ct = score(ramp)
                            if ct < MIN_CONTRAST:
                                continue
                            if best is None or de > best[0]:
                                best = (de, ct, ramp, (mode, start_L, peak_L,
                                                       start_C, start_h, chroma_exp))
    return best


def main():
    found = search()
    if not found:
        raise SystemExit(f"no ramp met the {MIN_CONTRAST}:1 contrast floor")
    min_de, min_ct, ramp, params = found
    mode, start_L, peak_L, start_C, start_h, chroma_exp = params
    print(f"best: mode={mode} startL={start_L} peakL={peak_L} startC={start_C} "
          f"startH={start_h} chromaExp={chroma_exp}")
    print(f"       min adjacent dE {min_de:.2f}   min ink contrast {min_ct:.2f}:1\n")

    print(f"{'tile':>6}  {'sRGB':>9}  {'display-p3':>28}  {'L*':>5} {'C':>5} {'h':>5}"
          f"  {'dE':>6}  {'ink':>8} {'ratio':>5}")
    prev_lab = None
    worst = []
    for stop in ramp:
        lab = xyz_to_lab(to_xyz(stop["p3"], P3_TO_XYZ))
        d = delta_e_2000(prev_lab, lab) if prev_lab else None
        prev_lab = lab

        ink, ratio = best_ink(stop["hex"])

        p3s = "p3(%s)" % " ".join(f"{v:.3f}" for v in stop["p3"])
        de = f"{d:6.2f}" if d else "     -"
        flag = "  <-- TOO CLOSE" if d and d < 10 else ""
        if d and d < 10:
            worst.append((d, stop["value"]))
        print(f"{stop['value']:>6}  {stop['hex']:>9}  {p3s:>28}  "
              f"{stop['L']:5.1f} {stop['C']:5.1f} {stop['h']:5.0f}  {de}  "
              f"{ink:>8} {ratio:4.1f}{flag}")

    print("\n--- CSS ---")
    for stop in ramp:
        print(f"  --t{stop['value']}: {stop['hex']};")
    print("\n  /* display-p3 */")
    for stop in ramp:
        print(f"  --t{stop['value']}: color(display-p3 "
              f"{' '.join(f'{v:.3f}' for v in stop['p3'])});")

    if worst:
        print(f"\n{len(worst)} pair(s) under dE 10: "
              + ", ".join(f"{v} ({d:.1f})" for d, v in worst))
    else:
        print("\nevery adjacent pair is at or above dE 10")


if __name__ == "__main__":
    main()
