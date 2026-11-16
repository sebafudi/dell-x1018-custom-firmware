#!/bin/zsh
# Build the LZMA-alone encoder that matches Dell's .ros sections:
# LZMA SDK 25.01 LzmaUtil patched to dict 8 MiB, lc3 lp0 pb2, known size, NO end marker.
# usage: build_lzmautil.sh <workdir>   -> <workdir>/lzmautil
set -e
W=${1:?workdir}; mkdir -p $W/dl $W/src
cd $W/dl
[[ -f lzma2501.7z ]] || curl -sSfLO https://github.com/ip7z/7zip/releases/download/25.01/lzma2501.7z
echo "cbc3babd589d971e45971d787ff100be8aaa5eab15b2694497ec3e447009e1f2  lzma2501.7z" | shasum -a 256 -c -
7zz x -y -o$W/src lzma2501.7z >/dev/null
F=$W/src/C/Util/Lzma/LzmaUtil.c; chmod u+w $F
grep -q 'props.writeEndMark = 0' $F || sed -i '' 's/^  LzmaEncProps_Init(&props);/  LzmaEncProps_Init(\&props); props.dictSize = 1 << 23; props.lc = 3; props.lp = 0; props.pb = 2; props.writeEndMark = 0;/' $F
grep -q 'props.writeEndMark = 0' $F
cd $W/src/C
cc -O2 -o $W/lzmautil Util/Lzma/LzmaUtil.c Alloc.c LzFind.c LzFindMt.c LzFindOpt.c LzmaDec.c LzmaEnc.c 7zFile.c 7zStream.c Threads.c CpuArch.c
echo "built $W/lzmautil"
