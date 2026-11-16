# Firmware format: Dell X10xx `.ros` images (3.0.1.9)

Worked out from Dell's `x10xx-3019.ros`. Tools: [`tools/firmware-re/`](../tools/firmware-re/).

## Quick start

1. `python3 -I tools/firmware-re/unpack_ros.py x10xx-3019.ros out/`: dumps every section (`.raw`) and decompresses what it can (`.bin`)
2. `tools/firmware-re/build_lzmautil.sh work/`: builds the matching LZMA encoder (downloads the LZMA SDK 25.01, checks its SHA-256)
3. `python3 -I tools/firmware-re/repack_ros.py verify x10xx-3019.ros work/lzmautil`: self-test, rebuilds the official image byte for byte

## Container

- All little-endian
- `0x00` magic `DE092.00`, `0x18` `PACK`, `0x40` version string
- `0x50`: entry table, 32 bytes each: `name[16]`, offset u32, size u32, flags u32, pad
- Sections are contiguous and unaligned: a resized section shifts every later offset

## Integrity checks

- **No signature.** Only byte sums in the 0x50-byte header:
  - `0x10` = len − 0x30, `0x14` = byte sum of `[0x30, end)`
  - `0x30` = len − 0x50, `0x34` = byte sum of `[0x50, end)`. Write this one first: the `0x14` sum covers it.
  - `0x0c` = bitwise NOT of the byte sum of header `[0x00, 0x50)`, computed with `0x0c` zeroed
- The switch checks these on `copy … image` ("Image header not supported or corrupted!", "checksum error!") and in the bootloader's "Flash Image Validation Test"

## Compressed sections (flags `0x200`)

- 32-byte sub-header: `DE092.00`, build time, build date, ?, **uncompressed size at +0x14**, 1, 0
- Then an LZMA-alone stream: props `5d`, 8 MiB dictionary, known size, **no end marker**
- **After LZMA, undo the ARM BCJ filter** (7-Zip "ARM") over the whole payload from offset 0
  - without this every ARM `BL` is wrong, and so are data bytes that look like one (PNG CRCs and gzip streams break)

## Sections

| Section | Contents |
|---|---|
| `RSCODE` | Main firmware: one 38.7 MB flat ARM little-endian binary. VxWorks-based Radlan/Marvell OS, Marvell CPSS switch SDK, GoAhead/RomPager web server, OpenSSL 1.0.2k, SSH server `OpenSSH_5.9p1.RL` |
| `EWS_FILE` | Web UI: a 7z archive (1207 files: HTML/JS/CSS, jQuery, images, `.gz` copies) |
| `CLI_FILE`, `DELSCRF`, `UPNP_FILE` | Binary tables (CLI definitions, wcd sections / MIB data, UPnP) |
| `HPRM`, `X10XX_L3`, `ADV_FAMILY`, `POE*`, `FIBER` | Plain-text platform parameter files |
| `MACRO_FILE` | Built-in port-profile macros |
| `CPLD_FILE_8/18/26/52` | CPLD images for X1008 / X1018 / X1026 / X1052 (2.06 / 2.09 / 2.09 / 2.13) |

## Change the web UI by hand

```
python3 -I tools/firmware-re/repack_ros.py extract x10xx-3019.ros EWS_FILE ews.7z
7zz x ews.7z Home.htm                     # edit; files use CRLF, Home.htm has a UTF-8 BOM
7zz u ews.7z -m0=LZMA:d=6m:lc=2:pb=0 -mtm=on -mtc=off -mta=off Home.htm
python3 -I tools/firmware-re/repack_ros.py replace x10xx-3019.ros EWS_FILE ews.7z custom.ros work/lzmautil
```

- Changed files need a **newer mtime** than the archive entry, or 7-Zip silently skips them ("Files read from disk: 0")
- Only the solid block holding the changed files is recompressed; the rest is copied unchanged
- The build is reproducible: the same inputs give the same image
- `webui/build.py` does all of this for the new UI

## How the web server serves files

- Any file in the EWS archive is served by its path (names aren't compiled into `RSCODE`)
- For `x.js` it serves `x.js.gz` with `Content-Encoding: gzip`
- Static files get `Expires: 2094` and an ETag based on the firmware date: **changed files need new names**
- `.htm` files need a session, except `config/log_off_page.htm` (the page `/` redirects to)
- `<!-- Rp… -->` header lines are stripped when a page is served

## Things that are compiled in but switched off

- **Bonjour/mDNS**: the responder exists in `RSCODE`, but `HPRM` has `Bonjour.supported=(BOOLEAN)FALSE`. The CLI and web pages are gated on it.
