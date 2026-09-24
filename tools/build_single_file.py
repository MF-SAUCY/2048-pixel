"""Bundle app/ into one self-contained HTML page.

The multi-file build in app/ is the real one — it is a PWA and it installs. This
bundle exists for hosts that serve a single page (the Claude artifact host among
them), so the markup, CSS and all nine scripts are inlined in load order.

Fonts stay external: three .woff files are ~82KB that would grow by a third as
base64, and they are referenced at the same relative path the app uses, so the
same style/fonts/ directory serves both builds.

Run:  python tools/build_single_file.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
OUT = ROOT / "dist" / "2048-pixel.html"

# Load order matters: polyfills, then the input manager and actuator, then the
# model, then effects (which patches HTMLActuator.prototype), then the bootstrap.
SCRIPTS = [
    "js/bind_polyfill.js",
    "js/classlist_polyfill.js",
    "js/animframe_polyfill.js",
    "js/input_manager.js",
    "js/html_actuator.js",
    "js/grid.js",
    "js/tile.js",
    "js/local_storage_manager.js",
    "js/game_manager.js",
    "js/palette.js",
    "js/effects.js",
    "js/application.js",
]


def extract_markup(html: str) -> str:
    """Everything between <body> and the first <script> — the game's markup."""
    body = re.search(r"<body[^>]*>(.*?)<script", html, re.S)
    if not body:
        raise SystemExit("could not find the markup block in index.html")
    return body.group(1).strip()


def main() -> None:
    index = (APP / "index.html").read_text(encoding="utf-8")
    css = (APP / "style" / "main.css").read_text(encoding="utf-8")
    markup = extract_markup(index)
    # The Dispatch link points at a sibling page the single file does not carry.
    markup = re.sub(r'\s*<br><a class="spinoff-link"[^\n]*', "", markup)

    # index.html links the stylesheet from style/, so its font URLs are relative
    # to that directory. Inlined into the page, they need the style/ prefix back.
    css = css.replace('url("fonts/', 'url("style/fonts/')

    scripts = []
    for name in SCRIPTS:
        source = (APP / name).read_text(encoding="utf-8")
        scripts.append(f"/* ---- {name} ---- */\n{source.strip()}")

    # No <html>/<head>/<body>: the artifact host supplies that skeleton.
    page = "\n".join([
        "<title>2048</title>",
        "",
        "<style>",
        css.strip(),
        "</style>",
        "",
        markup,
        "",
        "<script>",
        "\n\n".join(scripts),
        "</script>",
        "",
    ])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")

    kb = len(page.encode("utf-8")) / 1024
    print(f"{OUT.relative_to(ROOT)}  {kb:.1f} KB  ({len(SCRIPTS)} scripts inlined)")


if __name__ == "__main__":
    main()
