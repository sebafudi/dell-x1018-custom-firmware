# Recovery: serial console, boot menu, a switch that hangs at boot

Applies to the Dell EMC Networking X1000 series (X1008 / X1018 / X1026 / X1052, P variants too) on firmware 3.0.x.

## Connect to the serial console

1. Plug a USB cable into the switch's **USB console port** (an FTDI FT230X USB-to-serial chip inside)
2. Find the device:
   - macOS: `ls /dev/cu.usbserial-*` (use `cu.`, not `tty.`)
   - Linux: `ls /dev/ttyUSB*`
   - Windows: the FTDI driver is in Dell's firmware zip
3. Open it at **9600 baud, 8N1, no flow control**: `screen /dev/cu.usbserial-XXXX 9600`
   - quit `screen`: Ctrl-A, then K, then y
   - at 115200 every byte arrives as `0x00`

Scripted access: [`tools/serial/`](../tools/serial/) (`bridge.py` keeps the port open, logs to `console.log` and can stop autoboot for you).

## A normal boot

```
Boot1 Checksum Test....PASS
Boot2 Checksum Test....PASS
Flash Image Validation Test....PASS
CPLD Code match. No need to upgrade. CPLD Version 2.09
BOOT Software Version 1.0.0.25 Built 05-Apr-2017
Autoboot in 2 seconds - press RETURN or Esc. to abort and enter prom.
Decompressing SW from image-N ... Running from RAM...
*** Running SW Ver. x.x.x.x ***
...
%INIT-I-InitCompleted
User Name:
```

## Boot menu (PROM)

- Press Enter or Esc during "Autoboot in 2 seconds"
- **The menu closes by itself after a few seconds.** Type the choice quickly.

```
[1]  Download Software        XMODEM upload of an image (set 115200 with [5] first: 11.5 MB at 9600 takes ~3.5 h)
[2]  Erase Flash File         type "config" to wipe the configuration
[3]  CPLD Upgrade Force
[4]  Password Recovery Procedure
[5]  Set Terminal Baud-Rate
[6]  Back
```

- **[4] Password Recovery** ignores the password but still loads the config. It does **not** help when the config itself is broken.

## Fix: switch hangs at boot after a downgrade

Symptoms:
- Ports dark, no management access, only the heartbeat LED blinks
- Serial log stops after lines like these:
  ```
  %MNG_DIAG-E-DIAGATINIT: Init: Wrong private key footer format.
  %MNG_DIAG-E-DIAGATINIT: Init: SNMPCenG_setVariable - init: Bad value for configuration item rlSshServerImportExportSelfKeyTable ...
  ```

Cause:
- 3.0.1.8+ stores a 2048-bit SSH key in the config. A downgrade to 3.0.0.x keeps that config, and 3.0.0.x can't parse the key, so it freezes.
- The 7-second RESET button can't help: the frozen firmware never gets far enough to read it.

Fix (erases the whole configuration):
1. Open the serial console (above)
2. Power-cycle the switch, press Enter at "Autoboot"
3. Type `2` (Erase Flash File), then `Y`
4. At "Write Flash file name", type `config`, then Enter
5. Wait for `User Name:` (the log shows "About to erase CDB" and new SSH keys being generated)
6. Sign in with `admin` / `admin`

Prevention: **never downgrade from 3.0.1.8+ to 3.0.0.x with the config still in place.** Erase the config first.

## Go back to Dell's official firmware

Either:
- Web UI (new or classic): pick the other image slot as the boot image, then restart
- Or: copy Dell's official `x10xx-3019.ros` into the inactive slot (see [switch-tips.md](switch-tips.md#flash-an-image-over-tftp)), then `reload`

If a custom image ever fails to boot:
- The bootloader's "Flash Image Validation Test" falls back to the other slot when an image is invalid ("Only image-N is valid")
- Otherwise: boot menu `[1] Download Software` over XMODEM

## Buttons on the back

- **RESET**: hold 2 s = reboot, hold 7 s = factory reset
- **MODE**: hold > 7 s = toggle Managed / Unmanaged
- Factory defaults (Managed mode): `192.168.2.1/24`, `admin` / `admin`, DHCP client also on VLAN 1
