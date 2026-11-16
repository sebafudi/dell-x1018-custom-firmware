#!/usr/bin/env python3
"""Build a 3.0.1.9 firmware image whose web UI starts with the new x1018 UI.

usage: python3 -I webui/build.py <x10xx-3019.zip | x10xx-3019.ros>   -> webui/build/x10xx-3019-x1018ui.ros

The input is Dell's official 3.0.1.9 firmware, downloaded by you from Dell's support site
(driver ID N0VF7). It is checked by SHA-256 before anything is built. Needs 7zz and a C compiler.

What changes in the image (EWS_FILE section only; everything else is Dell's, byte for byte):
  config/log_off_page.htm      replaced by the new UI shell (public, served with no-cache; "/" redirects here)
  js/x1018.<hash>.js.gz        the app, gzipped (static files are cached until 2094, hence the content hash)
  css/x1018.<hash>.css.gz      the styles, gzipped
The classic UI stays at <prefix>/home.htm and works with the same session cookies.
"""
import gzip, hashlib, io, os, shutil, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC = os.path.join(HERE, "src")
OUT = os.path.join(HERE, "build")
sys.path.insert(0, os.path.join(REPO, "tools", "firmware-re"))
import repack_ros  # noqa: E402
sys.path.insert(0, HERE)
import bundle  # noqa: E402

# SHA-256 of x10xx-3019.ros (3.0.1.9) inside Dell's x10xx-3019.zip. Nothing else is accepted.
OFFICIAL_SHA256 = "4fe07e02db9bb28b4c156942dc749c56519300fe7ff80db3f3624e691960f3a0"

# Server-side page header the switch expects at the top of this page (copied from Dell's log_off_page.htm).
RP_HEADER = ("<!-- RpPageHeader RpUrl=/config/log_off_page.htm RpFunctionPtr=RL_PagePreProcess -->\r\n"
             "<!-- RpEnd -->\r\n<!-- RpDZT -->\r\n")


def run(*cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def main():
    os.makedirs(OUT, exist_ok=True)
    stage = os.path.join(OUT, "stage")
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(os.path.join(stage, "config"))
    os.makedirs(os.path.join(stage, "js"))
    os.makedirs(os.path.join(stage, "css"))

    # 1. official image (from the user's own download) + matching LZMA encoder
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    if zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            name = next((n for n in z.namelist() if n.endswith("x10xx-3019.ros")), None)
            if not name:
                sys.exit(f"{src}: no x10xx-3019.ros inside")
            official = z.read(name)
    else:
        official = open(src, "rb").read()
    if hashlib.sha256(official).hexdigest() != OFFICIAL_SHA256:
        sys.exit("not Dell's official x10xx-3019.ros (3.0.1.9): SHA-256 does not match, refusing to build")
    assert repack_ros.check_header(official), "official image header checksums do not verify"
    lzmautil = os.path.join(OUT, "lzma", "lzmautil")
    if not os.path.exists(lzmautil):
        run(os.path.join(REPO, "tools", "firmware-re", "build_lzmautil.sh"), os.path.join(OUT, "lzma"))

    # 2. bundle: content-hashed, gzipped
    names = {}
    for key, data, ext, d in (("js", bundle.js("core", True), "js", "js"), ("js2", bundle.js("more", True), "js", "js"), ("css", bundle.css(True), "css", "css")):
        hsh = hashlib.sha256(data).hexdigest()[:10]
        rel = f"{d}/x1018.{hsh}.{ext}"
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0) as g:
            g.write(data)
        open(os.path.join(stage, rel + ".gz"), "wb").write(buf.getvalue())
        names[key] = rel
        print(f"  {rel}.gz  {len(data)} -> {len(buf.getvalue())} bytes")
    shell = open(os.path.join(SRC, "shell.html"), encoding="utf-8").read()
    shell = shell.replace("{{CSS}}", "../" + names["css"]).replace("{{JS}}", "../" + names["js"]).replace("{{JS2}}", "../" + names["js2"])
    assert "<!-- Rp" not in shell
    open(os.path.join(stage, "config", "log_off_page.htm"), "wb").write((RP_HEADER + shell).replace("\r\n", "\n").replace("\n", "\r\n").encode())

    # 3. EWS archive: official payload + our files (only the touched solid blocks get recompressed)
    ews = os.path.join(OUT, "ews.7z")
    open(ews, "wb").write(repack_ros.extract(official, "EWS_FILE"))
    files = ["config/log_off_page.htm", names["js"] + ".gz", names["js2"] + ".gz", names["css"] + ".gz"]
    run("7zz", "u", ews, "-m0=LZMA:d=6m:lc=2:pb=0", "-mtm=on", "-mtc=off", "-mta=off", *files, cwd=stage, stdout=subprocess.DEVNULL)
    out = subprocess.run(["7zz", "l", "-slt", ews], capture_output=True, text=True, check=True).stdout
    for f in files:
        assert f"Path = {f}\n" in out, f"{f} missing from archive"
    run("7zz", "t", ews, stdout=subprocess.DEVNULL)

    # 4. firmware image
    img = repack_ros.replace(official, "EWS_FILE", repack_ros.build_section(official, "EWS_FILE", open(ews, "rb").read(), lzmautil))
    assert repack_ros.check_header(img) and repack_ros.extract(img, "EWS_FILE") == open(ews, "rb").read()
    dst = os.path.join(OUT, "x10xx-3019-x1018ui.ros")
    open(dst, "wb").write(img)
    print(f"wrote {dst}\n  {len(img)} bytes, sha256 {hashlib.sha256(img).hexdigest()}")


if __name__ == "__main__":
    main()
