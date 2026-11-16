# Dell X1018 custom firmware (unofficial)

Custom firmware for the **Dell EMC Networking X1018** switch (X1000 series), built from Dell's official 3.0.1.9 image.
Also: tools to unpack and repack Dell X10xx `.ros` firmware images, plus recovery and upgrade notes.

> Not affiliated with or endorsed by Dell. This repo contains **no Dell code**: the build script patches **your own copy** of Dell's official firmware.

## What the custom image changes

- Everything outside the web UI section is Dell's, byte for byte
- The web UI section adds a new interface, the default at `https://<switch-ip>/` (below)
- The classic Dell UI stays in the image at `<prefix>/home.htm`, same session

## The new web UI

- **Front panel as the workspace**: real jack layout, ports painted by VLAN, LNK/ACT LEDs
- **Fast**: cached data shows at once and refreshes in the background, instead of the classic UI's 5–25 s waits
- **Pending changes**: edit ports and VLANs, see the result before applying, apply in one go, then "Save" to startup config
- **Everything the classic UI configures**: STP, LAG, QoS, ACLs, IGMP, LLDP, mirroring, users, time, firmware, diagnostics…
- **Traffic, devices (MAC / LLDP / ARP), event log, ⌘K search**

## Supported

- **Dell EMC Networking X1018 / X1018P** (16 × 1 GbE + 2 SFP): tested on X1018
- Firmware **3.0.1.9** only (the build refuses any other image)
- X1008 / X1026 / X1052 use the same image, but the front panel is drawn for the X1018. Not tested there.

## Build and flash (about 20 minutes)

Needs: Python 3, `7zz` (7-Zip), a C compiler, `expect`. macOS and Linux.

1. Download **`x10xx-3019.zip`** from Dell (driver ID **N0VF7**): https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=n0vf7
2. Build: `python3 -I webui/build.py ~/Downloads/x10xx-3019.zip`
   - output: `webui/build/x10xx-3019-x1018ui.ros`
   - first run also downloads and builds the LZMA SDK encoder (checked by SHA-256)
3. Serve it: `python3 -I tools/switch/tftpserve.py webui/build/x10xx-3019-x1018ui.ros`
4. Copy it to the switch (second terminal, 4–7 min):
   `SW_HOST=<switch-ip> SW_PASS=<password> tools/switch/copy-image.exp tftp://<your-ip>/x10xx-3019-x1018ui.ros`
5. Reboot: `SW_HOST=<switch-ip> SW_PASS=<password> tools/switch/reload.exp`
6. Open `https://<switch-ip>/` after 1–4 min

Notes:
- The new image goes into the **inactive** slot. The other slot keeps your current firmware as a fallback.
- Your configuration is kept.
- On 3.0.1.8+ HTTP is off by default: use `https://`.
- No `expect`? Use the classic web UI instead: Switch Management → File Update and Backup, then pick the new image as the boot image.

## Go back to Dell's firmware

- Without reflashing: sign in to the new UI, then in the address bar replace `config/log_off_page.htm` with `home.htm`
- To boot the other slot: Settings → Firmware images → choose the other image → restart
- To restore stock firmware: flash Dell's `x10xx-3019.ros` the same way as above

## Risks

- Flashing modified firmware can **brick the switch** and may **void your warranty**. You do this at your own risk.
- Keep a USB console cable around. [docs/recovery.md](docs/recovery.md) shows how to recover from the boot menu.
- Don't power-cycle the switch while it copies an image or boots for the first time.

## Repo map

- [`webui/`](webui/): the UI (vanilla JS/CSS), dev server, build script, [API reference](webui/README.md)
- [`tools/firmware-re/`](tools/firmware-re/): unpack / repack `.ros` images
- [`tools/switch/`](tools/switch/): SSH helpers, one-file TFTP server, API client
- [`tools/serial/`](tools/serial/): serial console bridge and capture
- [`docs/`](docs/):
  - [recovery.md](docs/recovery.md): serial console, boot menu, a switch that hangs at boot
  - [switch-tips.md](docs/switch-tips.md): upgrading, SSH from modern clients, your own TLS certificate, SNTP
  - [firmware-format.md](docs/firmware-format.md): the `.ros` container, checksums, sections
  - [classic-api/](docs/classic-api/), [classic-webui-map.md](docs/classic-webui-map.md): the classic UI's full feature and API catalogue
  - [design/](docs/design/): product brief and design system of the new UI

## Develop

1. `python3 -I webui/dev.py <switch-ip>`
2. Open `http://127.0.0.1:8018/`: the UI from `webui/src`, with API calls proxied to your switch
3. Edit, reload. No flashing needed.

## License

[MIT](LICENSE). Dell, Dell EMC and X1018 are trademarks of Dell Inc. or its subsidiaries, used here only to say which hardware this works with.
