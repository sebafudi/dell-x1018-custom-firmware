#!/usr/bin/env python3
"""Minimal read-only TFTP server (RFC 1350 + blksize/tsize options) that serves ONE file.

usage: tftpserve.py <file> [bind-ip]     # serves <file> under its basename; Ctrl-C to stop
Runs without sudo on macOS, but only when bound to 0.0.0.0 (binding port 69 on a specific
address such as 127.0.0.1 gives "Permission denied" for non-root). Exits after one
complete transfer unless --keep is given as the 3rd argument.
"""
import os, socket, struct, sys, time

path = sys.argv[1]
bind = sys.argv[2] if len(sys.argv) > 2 else "0.0.0.0"
keep = len(sys.argv) > 3 and sys.argv[3] == "--keep"
name = os.path.basename(path)
data = open(path, "rb").read()

srv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind((bind, 69))
print(f"serving {name} ({len(data)} bytes) on {bind}:69", flush=True)


def err(sock, addr, code, msg):
    sock.sendto(struct.pack("!HH", 5, code) + msg.encode() + b"\0", addr)


while True:
    pkt, addr = srv.recvfrom(2048)
    op = struct.unpack("!H", pkt[:2])[0]
    if op != 1:  # RRQ only
        err(srv, addr, 4, "read-only server")
        continue
    parts = pkt[2:].split(b"\0")
    fname, mode = parts[0].decode(errors="replace"), parts[1].decode().lower()
    opts = {parts[i].decode().lower(): parts[i + 1].decode() for i in range(2, len(parts) - 1, 2) if parts[i]}
    print(f"RRQ {fname!r} mode={mode} opts={opts} from {addr}", flush=True)
    if fname.lstrip("/") != name:
        err(srv, addr, 1, "file not found")
        continue
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind((bind, 0))
    s.settimeout(2.0)
    blk = 512
    oack = {}
    if "blksize" in opts:
        blk = max(8, min(int(opts["blksize"]), 1468))
        oack["blksize"] = str(blk)
    if "tsize" in opts:
        oack["tsize"] = str(len(data))
    if "timeout" in opts:
        oack["timeout"] = opts["timeout"]

    def xchg(payload, want_block):
        for _ in range(10):
            s.sendto(payload, addr)
            try:
                while True:
                    r, a = s.recvfrom(1024)
                    if a != addr:
                        continue
                    rop, rblk = struct.unpack("!HH", r[:4])
                    if rop == 4 and rblk == want_block:
                        return True
                    if rop == 5:
                        print("client error:", r[4:].split(b"\0")[0].decode(errors="replace"), flush=True)
                        return False
            except socket.timeout:
                continue
        print("timeout", flush=True)
        return False

    t0 = time.monotonic()
    ok = True
    if oack:
        ok = xchg(struct.pack("!H", 6) + b"".join(k.encode() + b"\0" + v.encode() + b"\0" for k, v in oack.items()), 0)
    n = 0
    nblocks = len(data) // blk + 1  # last block is short (possibly empty)
    while ok and n < nblocks:
        b = (n + 1) & 0xFFFF
        ok = xchg(struct.pack("!HH", 3, b) + data[n * blk:(n + 1) * blk], b)
        n += 1
        if n % 2000 == 0:
            print(f"  {n * blk * 100 // len(data)}%", flush=True)
    s.close()
    print(f"transfer {'complete' if ok else 'FAILED'}: {min(n * blk, len(data))} bytes in {time.monotonic() - t0:.0f}s", flush=True)
    if ok and not keep:
        break
