"""Stamp app/sw.js with a cache version derived from the app's content.

Installed copies of the game only update when app/sw.js changes by a byte, and
the service worker only drops its old cache when CACHE changes name. Bumping it
by hand is easy to forget, and a forgotten bump leaves phones on the old files
indefinitely. So the version is a fingerprint of what ships instead.

The fingerprint covers every file under app/ as staged for the commit (git's
own blob hashes, so it is exact and fast), plus sw.js itself with its CACHE line
blanked out. Any change to anything that deploys gives a new version; a commit
that changes nothing under app/ keeps the old one, so phones never re-download
for nothing.

It stamps the staged sw.js directly and mirrors the new line into the working
copy, so unrelated unstaged edits to sw.js are left alone.

Run by the pre-commit hook in .githooks/ (enable once per clone with
`git config core.hooksPath .githooks`). By hand:

    python tools/stamp_sw.py           stamp the staged sw.js
    python tools/stamp_sw.py --check   exit 1 if the staged stamp is stale
"""

import hashlib
import re
import subprocess
import sys
from pathlib import Path

SW = "app/sw.js"
PREFIX = "2048-pixel-"
LINE = re.compile(r'var CACHE = "' + re.escape(PREFIX) + r'[^"]*";')


def git(*args, stdin=None):
    return subprocess.run(
        ["git", *args], check=True, capture_output=True, input=stdin
    ).stdout


def fingerprint(sw_source):
    digest = hashlib.sha256()
    for entry in sorted(git("ls-files", "-s", "--", "app").decode().splitlines()):
        if entry.split("\t", 1)[1] == SW:
            continue
        digest.update(entry.encode() + b"\n")
    digest.update(LINE.sub("", sw_source).encode())
    return PREFIX + digest.hexdigest()[:10]


def main():
    root = git("rev-parse", "--show-toplevel").decode().strip()
    staged = git("-C", root, "show", ":" + SW).decode()
    if len(LINE.findall(staged)) != 1:
        sys.exit(f"stamp_sw: expected exactly one CACHE line in {SW}")

    version = fingerprint(staged)
    stamped = LINE.sub(f'var CACHE = "{version}";', staged)

    if "--check" in sys.argv:
        if stamped != staged:
            sys.exit(f"stamp_sw: {SW} is stale; expected {version}")
        return

    if stamped == staged:
        return

    blob = git("-C", root, "hash-object", "-w", "--stdin",
               stdin=stamped.encode()).decode().strip()
    mode = git("-C", root, "ls-files", "-s", "--", SW).decode().split()[0]
    git("-C", root, "update-index", "--cacheinfo", f"{mode},{blob},{SW}")

    working = Path(root) / SW
    text = working.read_bytes().decode()
    if len(LINE.findall(text)) == 1:
        working.write_bytes(LINE.sub(f'var CACHE = "{version}";', text).encode())

    print(f"stamp_sw: {SW} -> {version}")


if __name__ == "__main__":
    main()
