#!/usr/bin/env python3
"""Validate sources and generate dist/ for Incident Desk.

Stdlib-only. Fails with a non-zero exit code and a clear message when a
check does not pass.
"""

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_FILES = ["index.html", "styles.css", "app.js"]
DIST = ROOT / "dist"

REQUIRED_HTML_IDS = [
    "summary",
    "live-region",
    "service-list",
    "incident-list",
    "empty-note",
    "search",
    "status-filter",
    "severity-filter",
    "new-incident-btn",
    "new-incident-form",
    "new-title",
    "new-severity",
    "new-start",
    "new-services",
    "cancel-new-btn",
    "theme-select",
    "export-btn",
    "import-btn",
    "import-file",
    "reset-btn",
]

FORBIDDEN_JS = ["innerHTML", "outerHTML", "insertAdjacentHTML", "eval(", "Function("]


def fail(msg):
    print("build failed: " + msg, file=sys.stderr)
    sys.exit(1)


def check_sources():
    for name in SRC_FILES:
        p = ROOT / name
        if not p.is_file():
            fail("missing source file: " + name)
        if p.stat().st_size == 0:
            fail("source file is empty: " + name)


def check_html(html):
    for ref in ['rel="stylesheet" href="styles.css"', 'src="app.js"']:
        if ref not in html:
            fail("index.html is missing local asset reference: " + ref)
    for ext in ['src="http://', 'src="https://', 'href="http://', 'href="https://']:
        if ext in html:
            fail("index.html references an external asset: " + ext)
    for eid in REQUIRED_HTML_IDS:
        if 'id="' + eid + '"' not in html:
            fail("index.html is missing required element id: " + eid)


def check_js(js):
    for token in FORBIDDEN_JS:
        if token in js:
            fail("app.js uses forbidden construct: " + token)
    if "localStorage" not in js:
        fail("app.js does not use localStorage for persistence")
    if not js.lstrip().startswith("(function"):
        fail("app.js must be an IIFE starting with (function")
    if not js.rstrip().endswith("})();"):
        fail("app.js must end with });()")


def main():
    check_sources()
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    js = (ROOT / "app.js").read_text(encoding="utf-8")
    check_html(html)
    check_js(js)

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    for name in SRC_FILES:
        shutil.copyfile(ROOT / name, DIST / name)
        if (DIST / name).read_bytes() != (ROOT / name).read_bytes():
            fail("byte mismatch after copy: " + name)
    print("build ok: dist/ regenerated with " + ", ".join(SRC_FILES))


if __name__ == "__main__":
    main()
