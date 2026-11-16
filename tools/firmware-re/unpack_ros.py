#!/usr/bin/env python3
"""Unpack a Dell X10xx .ros firmware image (Radlan/Marvell 'PACK' container).

Layout (little-endian):
  0x00  'DE092.00' magic + misc header (checksums, sizes)
  0x18  'PACK' ... version string at 0x40
  0x50  entry table, 32 bytes each: name[16], offset u32, size u32, flags u32, pad u32
        terminated by the build-info text block.
Entries with flags 0x200 carry their own 'DE092.00' sub-header followed by an
LZMA-alone stream (props 0x5d...).
"""
import lzma, os, struct, sys

src, out = sys.argv[1], sys.argv[2]
d = open(src, "rb").read()
os.makedirs(out, exist_ok=True)

entries = []
pos = 0x50
while pos + 32 <= len(d):
    name = d[pos:pos + 16].split(b"\0")[0]
    if not name or not all(32 < c < 127 for c in name):
        break
    off, size, flags, _ = struct.unpack_from("<IIII", d, pos + 16)
    if off + size > len(d):
        break
    entries.append((name.decode(), off, size, flags))
    pos += 32

print(f"{'name':14} {'offset':>10} {'size':>10} flags  result")
for name, off, size, flags in entries:
    blob = d[off:off + size]
    raw_path = os.path.join(out, f"{name}.raw")
    open(raw_path, "wb").write(blob)
    note = ""
    i = blob.find(b"\x5d\x00\x00")  # LZMA props byte + dict size start
    if flags & 0x200 and i != -1 and i < 0x100:
        try:
            data = lzma.decompress(blob[i:], format=lzma.FORMAT_ALONE)
            p = os.path.join(out, f"{name}.bin")
            open(p, "wb").write(data)
            note = f"LZMA@+0x{i:x} -> {len(data)} bytes"
        except lzma.LZMAError as e:
            # stream may lack an end marker / have trailing bytes; decompress incrementally
            dec = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE)
            try:
                data = dec.decompress(blob[i:])
            except lzma.LZMAError:
                data = b""
            if data:
                p = os.path.join(out, f"{name}.bin")
                open(p, "wb").write(data)
                note = f"LZMA@+0x{i:x} (partial: {e}) -> {len(data)} bytes"
            else:
                note = f"LZMA failed: {e}"
    elif blob[:2] == b"\x1f\x8b":
        note = "gzip"
    print(f"{name:14} 0x{off:08x} {size:10} 0x{flags:03x}  {note}")
