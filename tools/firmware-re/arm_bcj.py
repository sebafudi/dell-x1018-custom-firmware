# Undo 7-Zip's ARM BCJ filter on data[start:] (decoding direction).
import sys
def arm_bcj_decode(buf, ip=0):
    b = bytearray(buf)
    for i in range(0, len(b) - 3, 4):
        if b[i+3] == 0xEB:
            src = ((b[i+2] << 16) | (b[i+1] << 8) | b[i]) << 2
            dest = (src - (ip + i + 8)) >> 2
            b[i] = dest & 0xFF; b[i+1] = (dest >> 8) & 0xFF; b[i+2] = (dest >> 16) & 0xFF
    return bytes(b)
if __name__ == "__main__":
    d = open(sys.argv[1], "rb").read(); start = int(sys.argv[3], 0)
    open(sys.argv[2], "wb").write(d[:start] + arm_bcj_decode(d[start:]))
