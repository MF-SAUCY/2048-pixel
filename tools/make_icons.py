"""Generate the app icons for the 2048 phone build.

Draws the 2048 tile itself: the gold #edc22e face with the number on it. Two
families are produced, because Android treats them differently:

  standard  - the icon as drawn, used where the launcher shows it as-is
  maskable  - the same mark on a full-bleed gold field, with the artwork kept
              inside the inner 80% so a circular or squircle mask cannot clip
              the digits (Android's maskable safe zone)

Run:  python tools/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"

CREAM = (250, 248, 239, 255)
GOLD = (237, 194, 46, 255)
LIGHT = (249, 246, 242, 255)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def centered(draw: ImageDraw.ImageDraw, text: str, font, box, fill) -> None:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    x = box[0] + (box[2] - box[0] - (right - left)) / 2 - left
    y = box[1] + (box[3] - box[1] - (bottom - top)) / 2 - top
    draw.text((x, y), text, font=font, fill=fill)


def draw_icon(size: int, maskable: bool) -> Image.Image:
    # 4x supersample, then downscale: gives clean rounded corners and edges
    # without depending on the renderer's antialiasing.
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), GOLD if maskable else CREAM)
    draw = ImageDraw.Draw(img)

    if maskable:
        # Full-bleed gold; the mark must stay inside the central 80%.
        inset = s * 0.10
        box = (inset, inset, s - inset, s - inset)
    else:
        # A tile sitting on the board's cream ground.
        inset = s * 0.08
        box = (inset, inset, s - inset, s - inset)
        draw.rounded_rectangle(box, radius=s * 0.13, fill=GOLD)

    font = load_font(int(s * 0.30))
    centered(draw, "2048", font, box, LIGHT)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
        ("apple-touch-icon-180.png", 180, False),
    ]

    for name, size, maskable in targets:
        icon = draw_icon(size, maskable)
        icon.save(OUT / name, "PNG", optimize=True)
        print(f"{name:28} {size}x{size}  {(OUT / name).stat().st_size:>6} bytes")


if __name__ == "__main__":
    main()
