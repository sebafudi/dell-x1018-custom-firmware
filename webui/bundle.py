"""Assemble the UI: two scripts and one stylesheet. Used by dev.py and build.py.

core = src/js files numbered below 72 or from 80 up (workspace, data layer, settings engine, sign-in): loaded by the shell.
more = src/js files numbered 72-79 (all feature sections): fetched by the core in idle time after the first render.
Both are classic scripts without a wrapper, so their top-level declarations share one global lexical scope; feature files keep
their own helpers inside a block. minify=True strips comments and indentation (safe here: no multi-line template text)."""
import glob, os, re

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")


def _files(part):
    out = []
    for p in sorted(glob.glob(os.path.join(SRC, "js", "*.js"))):
        n = int(re.match(r"(\d+)", os.path.basename(p)).group(1))
        if (part == "more") == (72 <= n <= 79):
            out.append(p)
    return out


def _minify(text):
    text = re.sub(r"(?m)^[ \t]*/\*.*?\*/[ \t]*\n?", "", text, flags=re.S)   # block comments that start a line
    lines = []
    for line in text.split("\n"):
        s = line.strip()
        if not s or s.startswith("//"):
            continue
        lines.append(s)
    return "\n".join(lines) + "\n"


def js(part="core", minify=False):
    body = "'use strict';\n" + "\n".join(open(p, encoding="utf-8").read() for p in _files(part))
    return (_minify(body) if minify else body).encode()


def css(minify=False):
    text = "\n".join(open(p, encoding="utf-8").read() for p in sorted(glob.glob(os.path.join(SRC, "css", "*.css"))))
    if minify:
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        text = "\n".join(l.strip() for l in text.split("\n") if l.strip())
    return text.encode()
