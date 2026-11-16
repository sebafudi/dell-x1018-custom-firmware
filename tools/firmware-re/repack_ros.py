#!/usr/bin/env python3
"""Replace one compressed section of a Dell X10xx .ros image and fix up the container.

usage:
  repack_ros.py verify   <orig.ros> <lzmautil>                 # self-tests against the official image
  repack_ros.py extract  <orig.ros> <SECTION> <out.bin>         # LZMA-decode + undo ARM BCJ -> payload
  repack_ros.py replace  <orig.ros> <SECTION> <payload> <out.ros> <lzmautil>

Container format (all little-endian), worked out from 3.0.1.9:
  0x00 'DE092.00'
  0x08 u32 0x50 (header size)
  0x0c u32 ~bytesum(header[0x00:0x50]) computed with this field zeroed
  0x10 u32 len(image) - 0x30          0x14 u32 bytesum(image[0x30:])
  0x18 'PACK' ... 0x20 u32 entry count
  0x30 u32 len(image) - 0x50          0x34 u32 bytesum(image[0x50:])
  0x40 version string
  0x50 entry table: name[16], offset u32, size u32, flags u32, 0  (sections are contiguous, unaligned)
Compressed sections (flags 0x200): 32-byte sub-header
  'DE092.00', build time (s,m,h,0), build date (d,m,yyyy u16), u32 ?, u32 uncompressed size, u32 1, u32 0
  followed by an LZMA-alone stream (props 5d, dict 8 MiB, known size, no end marker) of the
  payload after 7-Zip's ARM BCJ filter (applied from offset 0 of the payload).
`lzmautil` is LzmaUtil from the LZMA SDK built with dictSize=1<<23, lc3 lp0 pb2, writeEndMark=0.
"""
import lzma, os, struct, subprocess, sys, tempfile

HDR = 0x50


def bytesum(b):
    return sum(b) & 0xFFFFFFFF


def entries(d):
    n = struct.unpack_from("<I", d, 0x20)[0]
    out = []
    for i in range(n):
        p = HDR + 32 * i
        name = d[p:p + 16].split(b"\0")[0].decode()
        off, size, flags, _ = struct.unpack_from("<IIII", d, p + 16)
        out.append([name, off, size, flags])
    return out


def fix_header(d):
    d = bytearray(d)
    n = len(d)
    # order matters: the 0x14 sum covers 0x30.., which includes the 0x30/0x34 fields
    struct.pack_into("<II", d, 0x30, n - 0x50, bytesum(d[0x50:]))
    struct.pack_into("<II", d, 0x10, n - 0x30, bytesum(d[0x30:]))
    struct.pack_into("<I", d, 0x0c, 0)
    struct.pack_into("<I", d, 0x0c, (~bytesum(d[:HDR])) & 0xFFFFFFFF)
    return bytes(d)


def check_header(d):
    n = len(d)
    ok = struct.unpack_from("<II", d, 0x10) == (n - 0x30, bytesum(d[0x30:]))
    ok &= struct.unpack_from("<II", d, 0x30) == (n - 0x50, bytesum(d[0x50:]))
    z = bytearray(d[:HDR]); z[0x0c:0x10] = b"\0\0\0\0"
    ok &= struct.unpack_from("<I", d, 0x0c)[0] == (~bytesum(z)) & 0xFFFFFFFF
    return ok


def arm_bcj(buf, encode):
    b = bytearray(buf)
    for i in range(0, len(b) - 3, 4):
        if b[i + 3] == 0xEB:
            v = (b[i + 2] << 16) | (b[i + 1] << 8) | b[i]
            v = (v << 2) + (i + 8) if encode else (v << 2) - (i + 8)
            v >>= 2
            b[i], b[i + 1], b[i + 2] = v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF
    return bytes(b)


def section_lzma(blob):
    assert blob[:8] == b"DE092.00" and blob[0x20] == 0x5D, "not a compressed section"
    return blob[:0x20], blob[0x20:]


def lzma_decode(stream):
    usize = struct.unpack_from("<Q", stream, 5)[0]
    dec = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE)
    out = dec.decompress(stream, max_length=usize)
    assert len(out) == usize, (len(out), usize)
    return out


def lzma_encode(data, lzmautil):
    with tempfile.TemporaryDirectory() as t:
        i, o = os.path.join(t, "in"), os.path.join(t, "out")
        open(i, "wb").write(data)
        subprocess.run([lzmautil, "e", i, o], check=True, stdout=subprocess.DEVNULL)
        s = open(o, "rb").read()
    assert s[:5] == b"\x5d\x00\x00\x80\x00" and struct.unpack_from("<Q", s, 5)[0] == len(data)
    return s


def extract(d, name):
    for n, off, size, flags in entries(d):
        if n == name:
            sub, stream = section_lzma(d[off:off + size])
            return arm_bcj(lzma_decode(stream), encode=False)
    raise SystemExit(f"no section {name}")


def replace(d, name, new_blob):
    ents = entries(d)
    out = bytearray(d[:ents[0][1]])
    pos = ents[0][1]
    for i, (n, off, size, flags) in enumerate(ents):
        blob = new_blob if n == name else d[off:off + size]
        struct.pack_into("<II", out, HDR + 32 * i + 16, pos, len(blob))
        out += blob
        pos += len(blob)
    return fix_header(bytes(out))


def build_section(d, name, payload, lzmautil):
    for n, off, size, flags in entries(d):
        if n == name:
            sub = bytearray(d[off:off + 0x20])
            struct.pack_into("<I", sub, 0x14, len(payload))
            return bytes(sub) + lzma_encode(arm_bcj(payload, encode=True), lzmautil)
    raise SystemExit(f"no section {name}")


def main():
    cmd = sys.argv[1]
    d = open(sys.argv[2], "rb").read()
    if cmd == "verify":
        lzmautil = sys.argv[3]
        assert check_header(d), "header checksums of the original do not verify"
        print("original header checksums: OK")
        assert fix_header(d) == d
        print("fix_header(original) == original: OK")
        for n, off, size, flags in entries(d):
            if flags & 0x200:
                assert replace(d, n, d[off:off + size]) == d
        print("replace(section, same bytes) reproduces the original byte-for-byte: OK")
        ews_off, ews_size = [(e[1], e[2]) for e in entries(d) if e[0] == "EWS_FILE"][0]
        raw = lzma_decode(d[ews_off + 0x20:ews_off + ews_size])
        assert arm_bcj(arm_bcj(raw, False), True) == raw
        print("ARM BCJ encode(decode(EWS)) == EWS LZMA output: OK")
        payload = arm_bcj(raw, False)
        assert payload[:6] == b"7z\xbc\xaf\x27\x1c"
        blob = build_section(d, "EWS_FILE", payload, lzmautil)
        assert lzma_decode(blob[0x20:]) == raw and blob[:0x14] == d[ews_off:ews_off + 0x14]
        img = replace(d, "EWS_FILE", blob)
        assert check_header(img) and extract(img, "EWS_FILE") == payload
        for n, off, size, flags in entries(d):
            if n != "EWS_FILE":
                o2, s2 = [(e[1], e[2]) for e in entries(img) if e[0] == n][0]
                assert img[o2:o2 + s2] == d[off:off + size], n
        print(f"re-encoded EWS_FILE ({len(d[ews_off:ews_off+ews_size])} -> {len(blob)} bytes) decodes to the same payload,"
              " all other sections identical, checksums valid: OK")
    elif cmd == "extract":
        open(sys.argv[4], "wb").write(extract(d, sys.argv[3]))
    elif cmd == "replace":
        name, payload, outp, lzmautil = sys.argv[3], open(sys.argv[4], "rb").read(), sys.argv[5], sys.argv[6]
        img = replace(d, name, build_section(d, name, payload, lzmautil))
        assert check_header(img) and extract(img, name) == payload
        open(outp, "wb").write(img)
        print(f"wrote {outp}: {len(img)} bytes (original {len(d)}), checksums valid, {name} round-trips")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
