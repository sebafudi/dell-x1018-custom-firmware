# Switch tips: upgrade, SSH, TLS certificate, time

For the Dell EMC Networking X1000 series on firmware 3.0.1.9.

## Firmware facts

- Newest firmware: **3.0.1.9 (A20), 3 Nov 2021**, Dell driver ID **N0VF7**: https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=n0vf7
- `x10xx-3019.zip` SHA-256: `142eb247bd242b3b5db7b71cea909d4e2ae2235152bab726555cdec6582bf1e8`
- `x10xx-3019.ros` inside it, SHA-256: `4fe07e02db9bb28b4c156942dc749c56519300fe7ff80db3f3624e691960f3a0`
- 3.0.1.9 fixes DSA-2021-191 (DoS, web session-ID auth bypass, host header injection)
- 3.0.1.8 changed:
  - HTTPS only by default: **HTTP is off after the upgrade**, use `https://`
  - 2048-bit SSH keys, salted SHA-512/PBKDF2 password hashes
  - **Don't downgrade to 3.0.0.x with the config in place**: the switch hangs at boot ([recovery.md](recovery.md))
- CPLD: firmware ≥ 3.0.0.82 reflashes the CPLD at boot if it is older than 2.07 (X1018). That takes 10–15 min. **Don't power-cycle during it.**
- **First boot of 3.0.1.9 takes ~9 min**: ports dark, heartbeat LED lit steadily. Don't power-cycle.

## Flash an image over TFTP

1. `sudo`-free TFTP server: `python3 -I tools/switch/tftpserve.py x10xx-3019-x1018ui.ros` (binds `0.0.0.0:69`, exits after one transfer)
2. `SW_HOST=<switch-ip> tools/switch/copy-image.exp tftp://<your-ip>/x10xx-3019-x1018ui.ros`
   - takes 4–7 min; the image goes into the **inactive** slot and is selected for the next boot
   - `show bootvar` at the end shows `Not active*` for the new image
3. `SW_HOST=<switch-ip> tools/switch/reload.exp`
4. Wait 1–4 min, open `https://<switch-ip>/`

## SSH from a modern client

The switch offers only old algorithms:

```
ssh -o KexAlgorithms=+diffie-hellman-group-exchange-sha1,diffie-hellman-group1-sha1 \
    -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAuthentication=no \
    -o Ciphers=+aes128-cbc,aes256-cbc,3des-cbc admin@192.168.2.1
```

- The session then shows its own `User Name:` / `Password:` prompt
- [`tools/switch/cli.exp`](../tools/switch/cli.exp) runs commands for you: `SW_HOST=… tools/switch/cli.exp "show version"`

## CLI limits (Managed mode)

- Exec mode: `clear, configure, copy, crypto, debug-mode, delete, dir, exit, help, ping, reload, show, write`
- Config mode: `crypto, do, end, exit, help, interface, ip, spanning-tree, username, vlan`
- No `boot system`, `show clock` or `show startup-config`
  - pick the boot image in the web UI (or copy an image: it becomes the next boot image)

## Use your own TLS certificate

1. Make an RSA 2048 key and a certificate with:
   - SAN for every name/IP you use
   - KU `digitalSignature, keyEncipherment` (the switch only does RSA key exchange)
   - ≤ 398 days validity (Chrome's limit)
2. Build the import bundle in this order:
   - the key as PKCS#1: `openssl pkey -in key.pem -traditional` (`-----BEGIN RSA PRIVATE KEY-----`)
   - the public key: `openssl rsa -in key.pem -RSAPublicKey_out` (`-----BEGIN RSA PUBLIC KEY-----`)
   - the certificate
3. `SW_HOST=… tools/switch/certimport.exp 1 bundle.pem` (expects "Certificate imported successfully")
4. `SW_HOST=… tools/switch/cli.exp configure "ip https certificate 1" end`. Takes effect at once, no reboot.
5. Check: `openssl s_client -connect <switch-ip>:443 -cipher 'DEFAULT:@SECLEVEL=0'`

- Trusting the certificate in the browser also lets it cache the UI's static files. With a certificate warning, Chrome caches nothing.

## Time (SNTP)

- The SNTP server field takes **IP addresses only** (no `pool.ntp.org`). Stable anycast choices:
  - `162.159.200.1` (time.cloudflare.com)
  - `216.239.35.0` (time.google.com)
- Example running config (CET/CEST):
  ```
  clock timezone UTC 1
  clock summer-time recurring last sun mar 02:00 last sun oct 03:00
  clock source sntp
  sntp unicast client enable
  sntp server 162.159.200.1 poll
  sntp server 216.239.35.0 poll
  ```
- Gotcha: the classic Local Time dialog applies the typed time before the new zone. Change the zone and the time in separate saves.

## Hardening checklist

- Change the `admin` password
- Factory config has `snmp-server community Public ro`: turn SNMP off or change the community
- Keep the management interface off untrusted networks: the TLS stack is OpenSSL 1.0.2k (2017) and the SSH server only speaks SHA-1 key exchange
