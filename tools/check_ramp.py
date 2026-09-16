"""Measure how distinct the tile colours actually are.

Eyeballing swatches is unreliable — sRGB hex distance says nothing about how
different two colours look. This converts each tile colour (sRGB hex or
display-p3) into CIE Lab and reports CIEDE2000 between neighbouring tiles, which
is a perceptual distance: roughly 1.0 is the smallest difference a person can
detect on adjacent patches, and for tiles you are scanning at a glance while
playing you want considerably more.

Thresholds used below, for large flat patches seen side by side:
    dE < 5    too close - reads as the same tile mid-game
    5-10      distinguishable if you stop and compare
    > 10      comfortably distinct

Run:  python tools/check_ramp.py
"""

import math

# (label, sRGB hex fallback, display-p3 triple or None)
LIGHT = [
    ("2",	"#daaddc", (0.826, 0.685, 0.852)),
    ("4",	"#bebbff", (0.739, 0.732, 1.000)),
    ("8",	"#95d1ff", (0.617, 0.816, 1.000)),
    ("16",	"#39e7ff", (0.405, 0.899, 1.000)),
    ("32",	"#00d5c3", (0.000, 0.845, 0.771)),
    ("64",	"#00db97", (0.321, 0.856, 0.593)),
    ("128",	"#63d754", (0.510, 0.835, 0.400)),
    ("256",	"#a4c800", (0.667, 0.780, 0.228)),
    ("512",	"#d2ae00", (0.808, 0.687, 0.112)),
    ("1024",	"#f28b00", (0.926, 0.548, 0.108)),
    ("2048",	"#ff6035", (1.000, 0.345, 0.190)),
    ("super", "#3c3a32", None),
]

# Display P3 and sRGB share the sRGB transfer curve; only the primaries differ.
SRGB_TO_XYZ = (
    (0.4123907992659595, 0.35758433938387796, 0.1804807884018343),
    (0.21263900587151036, 0.7151686787677559, 0.07219231536073371),
    (0.019330818715591851, 0.11919477979462599, 0.9505321522496606),
)

P3_TO_XYZ = (
    (0.4865709486482162, 0.26566769316909306, 0.1982172852343625),
    (0.2289745640697488, 0.6917385218365064, 0.0792869140937450),
    (0.0000000000000000, 0.04511338185890264, 1.0439443689009760),
)

WHITE = (0.95047, 1.00000, 1.08883)  # D65, 2 degree


def linearize(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def to_xyz(rgb, matrix):
    lin = [linearize(c) for c in rgb]
    return tuple(sum(m[i] * lin[i] for i in range(3)) for m in matrix)


def xyz_to_lab(xyz):
    def f(t):
        return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116

    fx, fy, fz = (f(xyz[i] / WHITE[i]) for i in range(3))
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def delta_e_2000(lab1, lab2):
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2

    avg_L = (L1 + L2) / 2
    C1 = math.hypot(a1, b1)
    C2 = math.hypot(a2, b2)
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

    dLp = L2 - L1
    dCp = C2p - C1p
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp) / 2)

    if C1p * C2p == 0:
        avg_hp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        avg_hp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        avg_hp = (h1p + h2p + 360) / 2
    else:
        avg_hp = (h1p + h2p - 360) / 2

    T = (1
         - 0.17 * math.cos(math.radians(avg_hp - 30))
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


def lab_of(entry, use_p3):
    _, hex_value, p3 = entry
    if use_p3 and p3:
        return xyz_to_lab(to_xyz(p3, P3_TO_XYZ))
    return xyz_to_lab(to_xyz(hex_to_rgb(hex_value), SRGB_TO_XYZ))


def verdict(d):
    if d < 5:
        return "TOO CLOSE"
    if d < 10:
        return "marginal"
    return "ok"


def report(ramp, use_p3, title):
    print(f"\n=== {title} ===")
    print(f"{'pair':>14}  {'dE2000':>7}  {'dL':>6}  verdict")
    worst = []
    for i in range(1, len(ramp)):
        prev, cur = ramp[i - 1], ramp[i]
        l1, l2 = lab_of(prev, use_p3), lab_of(cur, use_p3)
        d = delta_e_2000(l1, l2)
        pair = f"{prev[0]}->{cur[0]}"
        print(f"{pair:>14}  {d:7.2f}  {l2[0] - l1[0]:6.2f}  {verdict(d)}")
        if d < 10:
            worst.append((d, pair))

    print(f"\nlightness (L*) across the ramp:")
    for entry in ramp:
        print(f"{entry[0]:>6}  L* {lab_of(entry, use_p3)[0]:6.2f}")

    if worst:
        print(f"\n{len(worst)} pair(s) under dE 10:")
        for d, pair in sorted(worst):
            print(f"   {pair:>14}  {d:.2f}")


if __name__ == "__main__":
    report(LIGHT, False, "sRGB fallback ramp (shipped)")
    report(LIGHT, True, "display-p3 ramp (shipped, what the Pixel shows)")
