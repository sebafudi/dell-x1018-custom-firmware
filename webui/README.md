# The web UI

A replacement for the X1018's built-in web interface. The switch serves it itself, from a rebuilt 3.0.1.9 image.
Plain JS and CSS, no dependencies, ~36 KB gzipped core.

## Files

- `src/js/*.js`, `src/css/*.css`: the UI. `bundle.py` joins the JS files in name order into one IIFE (one shared scope), same for the CSS.
- `src/shell.html`: the page shell.
- `dev.py`: dev server on `http://127.0.0.1:8018/`. Serves the UI and proxies everything else to a real switch. No flashing needed.
- `build.py`: patches your copy of Dell's official image into `build/x10xx-3019-x1018ui.ros`.
- `tools/uitest.js`: helpers for driving the UI from browser automation.
- Design: [`docs/design/`](../docs/design/) (`PRODUCT.md`, `DESIGN.md`, the original mock).
- Full classic feature/API catalogue: [`docs/classic-api/`](../docs/classic-api/).

## Develop against a live switch

1. `python3 -I webui/dev.py 192.168.2.1` (your switch's IP)
2. Open `http://127.0.0.1:8018/` and sign in with the switch's credentials
3. Edit `src/`, reload the page

## How it is organised

One workspace instead of pages: the **front panel** (real jacks on VLAN-colour plates, LNK/ACT LEDs as on the hardware) is always on screen;
**lenses** (Link, VLANs, Traffic, Errors, Devices) change what the panel and the area under it show; the **inspector** shows and edits whatever is selected
(ports, a VLAN, or the switch). Edits become **pending changes** drawn as the future state (+ joins untagged / tagged, − leaves, "→ new VLAN" chips) and are applied as
a few batched writes; "Save N changes" then writes the startup configuration. Global configuration lives in the **Settings** sheet (grouped, searchable), the event log in
**Activity**, and ⌘K searches ports, VLANs, devices, settings and actions.

| File | Role |
|---|---|
| `00-util.js` | DOM helper `h()`, VLAN list helpers, formatting, localStorage |
| `10-net.js` | request queue (one request at a time, by priority), expiry detection + retry after sign-in, keepalive, `api.get/post/formPost/cli/login` |
| `20-data.js` | per-resource cache with freshness classes, batched refresh, re-read after writes, unsaved-state, idle prefetch with back-off |
| `30-model.js` | merges sections into ports / VLANs / devices; VLAN colours; "your connection" detection |
| `35-pending.js` | pending changes: future state, plain-language description, risk check, write plan |
| `40-ui.js` | icons, toasts, sheets, confirm, theme |
| `50-workspace.js`, `60-inspector.js` | the workspace and inspector |
| `70-engine.js` | settings engine: `defSettings` sections, `defPortGroup` inspector groups, form/table builders |
| `71…79-*.js` | features, one area per file |
| `80-auth.js`, `85-sheets.js`, `90-main.js` | sign-in, ⌘K / Activity, boot |

## Design rules (why it is fast)

- **Cache everything, show it at once, refresh behind it.** Each wcd section is cached separately with a freshness class (live 30 s, config 10 min, static 1 day,
  demand = never prefetched). Every view renders from cache instantly; the top bar says "Live" or how old the data is, and each area shows its own age.
- **Batch.** Stale sections are merged into one `wcd?{A}{B}{C}` request (about the cost of one section: ~1 s, mostly the TLS handshake).
- **One request at a time.** Parallel requests are slower in total on this switch. User actions jump the queue; prefetch waits for idle time (3 s quiet,
  then at most one request per 2 s, backing off to 60 s while the switch is slow) and stops once everything is fresh. No polling.
- **Avoid the slow sections.** `AdminUserSetting` (~4.7 s, hashes passwords) and the bulk `VLANInterfaceISList` (~24 s) are never read in bulk;
  VLAN membership comes from `VLANMembershipInterfaceList` + `VLANInterfaceISLiteList` instead.
- **Every request has a timeout** (25 s by default) so one stuck request can't block the queue.
- **Static files are cached forever** (the switch sends `Expires: 2094`), so they are content-hashed (`js/x1018.<hash>.js`). Only the shell
  (`config/log_off_page.htm`, served `no-cache`) changes between builds.

Measured (2026-11-16, dev proxy): workspace from cache instantly, live in 1.3 s (ports, link settings, VLANs, membership, mode, counters in one request);
devices (MAC table, LLDP, ARP) 1.3 s; applying a VLAN create + 2 port changes 4.3 s (3 writes).

## API reference (3.0.1.9), as used here

Paths are relative to the per-build prefix (`/cs8dc6b8c3`).

**Session**
- Login: `GET config/System.xml?action=login&user=U&password=P`. Only `#` `%` `&` `+` are percent-encoded (the same as Dell's login page).
  Response `<statusCode>`: `0` ok, `10`/`12` weak password, `9` expired, `13` about to expire; other values mean failure. The session id is in the `sessionID` response header.
- The browser then sets cookies `sessionID`, `userStatus=ok`, `ContaxUserName`, `PriviligeLevel`, `DeviceMode=1` (path `/`). The classic UI reads the same cookies.
- Logout: `GET System.xml?action=logout`.
- **Idle timeout (measured 2026-11-15): a session dies after ~60 s without requests** (alive after a 50 s gap, gone after 70 s; the switch log
  shows "https connection for user admin … TERMINATED" exactly 60 s after the last request). This does **not** follow the configured web timeout:
  - The configured value is readable from `device/noStamp.xml` (`rlEmWebMaxIdleTimeout`, `rlEmWebMaxHttpsIdleTimeout`, seconds; the same page carries
    `rlRunningCDBequalToStartupCDB`), from `wcd?{DeviceBasicInfo}` → `idleTimeout` (minutes), and from CLI `show ip http` / `show ip https`.
  - It is set with CLI `ip http timeout-policy <seconds> [http-only|https-only]` (MIB `rlEmWebServiceTable.rlEmWebServiceMaxIdleTimeOut`, row 0 HTTP,
    row 1 HTTPS); no classic page writes it. Raised from 600 to 3600 s on 2026-11-15 (running config): the real ~60 s expiry did not change.
    The classic UI's own client-side logoff uses the configured value; it survives because it polls constantly.
- **Keepalive:** `GET device/authenticate_user.xml` (requires a session, ~1.2 s, a short static HTML body "this page is for periodic authentication use only!").
  Any authenticated request resets the idle timer, so a ping is only needed when nothing else went out for ~35 s.
- **How the UI handles it:** a keepalive ping after 30 s without requests while the tab is visible, and in a background tab for as long as the
  Session sheet says (default 1 hour; the timer runs in a Web Worker because browsers slow page timers in background tabs to once a minute,
  too late for a 60 s session). Fixed 60 s timeout; the UI no longer
  "learns" a shorter one, since a reboot or a sign-out elsewhere also ends sessions and taught it a ~20 s value that kept an "expires" bar on screen).
  The "session ends in N s" bar shows only when a keepalive failed to reach the switch. When the session ends anyway, the workspace and any open
  sheet are hidden behind a sign-in screen (kept in memory, so pending changes and typed input survive) and the failed request is retried after
  signing in. The session status in the top bar opens a Session sheet: sign out, clear the cache, and "Forget cached data when signed out"
  (off by default; when on, every cached switch value in localStorage is wiped whenever the session ends).
- **Auto refresh:** each view has a refresh picker next to its tabs (Off, 5 s, 10 s, 30 s, 1 min, 5 min; Traffic defaults to 10 s for its graph,
  the others to 30 s) that re-reads only that view's live data (link state and counters, or the device tables, or spanning tree). Configuration data
  keeps its own 10-minute freshness. The refresh button next to it reads again at once.
- Several sessions per client IP coexist (the session id is `UserId=<client-ip>&<32 hex>&`); a new login does not end the others.
- **What an expired session returns:**
  - `wcd?…` (GET or POST): **HTTP 200**, XML `ActionStatus/statusCode` **`4`**, `statusString` `Request Is not authenticated`. The response also carries a
    `sessionID` header, which is not a new session.
  - `API/*.htm`, `device/authenticate_user.xml`, `device/noStamp.xml`: **HTTP 302** to `<prefix>/config/log_off_page.htm`, empty body (`fetch` follows it and
    ends on the login shell, so check `res.redirected`/the final URL or a missing `<?xml`).

**Remote CLI** (runs CLI commands through the API; used by the classic Port Profile page and the Dashboard):
`POST wcd?{RemoteCLITable}` with `<RemoteCLITable action="set"><Entry><commandText>exit</commandText></Entry><Entry><commandText>exit</commandText></Entry>…</RemoteCLITable>`
(the two `exit`s leave whatever mode the CLI context is in; then `configure` … `end` for config commands), then poll `wcd?{ConfigInfoStatus}` until
`state` = `6` and read `wcd?{RemoteCLIOutputTable}` (one `<text>` CDATA chunk per output line or fragment). ~1.1 s for the POST, output ready at the first poll.
Errors appear as output text (`% Wrong number of parameters or invalid range, size or characters entered`); the POST itself still returns statusCode 0.
**Never send `terminal …` through Remote CLI.** `terminal datadump` (sent to avoid paging before `show running-config`, 2026-11-16 01:41) made the
remote CLI task hit `%MSCM-F-UNKNOWNIOTERMID: Unknown IO Terminal ID - MSCMG_DumpMode` → FATAL ERROR (task RCLA) → the switch rebooted (~3.5 min
until it answered again; unsaved running config lost). `api.cli` refuses such commands. Long `show` output is also risky through this channel; use the
serial console or SSH for full config listings.

The complete classic feature set (every page's sections, fields, enums and write formats) is catalogued in `docs/classic-api/`.

**Read**: `GET wcd?{Section}{Section&param=v}`. The response is XML: `ResponseData/DeviceConfiguration/<Section type="section">…`, plus `ActionStatus` (an empty statusCode means OK).

| Section | Contents | Notes |
|---|---|---|
| `SystemGlobalSetting` | name, location, contact, description, uptime (1/100 s), MAC, firmware/boot/hw versions, serial | |
| `TimeSetting` | local time, `setTimeMode` (2 = SNTP), time zone, DST rule | |
| `StackInfoTable` | service tag, model, versions | |
| `ImageUnitList` | `currentImage`, `nextBootImage`, image1/2 versions | |
| `ports` (→ `Ports`) | front-panel table: `ifIndex`, `portName`, `row`, `column`, `transType` (2 = SFP), `swIfType` (3 = Ethernet, 8 = LAG), oper/admin status | |
| `Standard802_3List&interfaceType=1` | per port: `interfaceDescription`, `adminState` (1 up / 2 down), `linkState`, `speedAdmin`/`speedOper` (Mb/s), `duplexAdminMode` (2 half / 3 full), `duplexOperMode` (1 half / 2 full), `autoNegotiationAdminEnabled` (1/2), `flowControlAdminType`, `mediaType` (2 = fiber) | 1.5 s |
| `VLANList` | `VLAN{VLANID, VLANName, VLANType, authorizationType}` | |
| `VLANMembershipInterfaceList&interfaceType=1` | per port: `portVLANMode` (10 general / 11 access / 12 trunk / 15 customer), `currentUntaggedVLANs`, `currentTaggedVLANs` (ranges like `1-3,10`) | 1.4 s; updates ~1 s after a write |
| `VLANInterfaceISList&interfaceName=gi1/0/N` | `switchportModeAdmin`, `accessPVID`, `trunkNativeVID`, `trunkMemberVLANs`, `generalPVID`, `generalTagged/Untagged/ForbiddenVLANs` | 2.3 s for one port; **24 s for all** |
| `StatisticsList&interfaceType=1` | `InterfaceStatisticsEntry`: rx/tx bytes, unicast/multicast/broadcast packets, errors | |
| `MemoryLogTable&count=N` | `LogEntry{dateTime "MMDDYYYY hh:mm:ss", severityType 0–7, message}` | |
| `IPv4InterfaceList`, `IPv4GatewayList`, `DNSGlobalSetting` | IP (`owner` 2 = DHCP), gateway, DNS | |
| `AdminUserSetting` | users **including password hashes** | 4.7 s, avoid |

**Write**: `POST wcd?{Section}` with body `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><Section action="set|delete">…</Section></DeviceConfiguration>`
(Content-Type `application/x-www-form-urlencoded`). Success means `ActionStatus/statusCode` = `0`; otherwise the reason is in `statusString`.
- Port: `Standard802_3List set <Entry><interfaceName>gi1/0/N</interfaceName> + changed fields</Entry>`.
- VLAN create/rename: `VLANList set <VLAN><VLANID>N</VLANID><VLANName>x</VLANName></VLAN>`. Delete: `VLANList delete <VLAN><VLANID>N</VLANID></VLAN>`.
- Port VLANs: `VLANInterfaceISList set <Entry><interfaceName/>…</Entry>` with `switchportModeAdmin`, `accessPVID`, `trunkNativeVID`.
  **List fields** (`trunkMemberVLANs`, `generalTaggedVLANs`, …) are incremental: `set` adds the given VLANs and `delete` removes them. Tested: trunk `1-4094` → `delete 2-98,100-4094` → `1,99`.
  **Several blocks in one POST run in order** (tested 2026-11-16 on gi1/0/17, 1.9 s): `<VLANInterfaceISList action="set">` mode,
  then `action="delete"` `trunkMemberVLANs=1-4094`, then `action="set"` `trunkMemberVLANs=<list>` + `trunkNativeVID` replaces a port's whole
  VLAN config in one request without reading it first. Several `<Entry>`s per block cover several ports.
  **Trunk semantics:** the native VLAN is untagged only if it is also in `trunkMemberVLANs`; with the native VLAN left out, the port is
  tagged-only (`currentUntaggedVLANs` empty). So untagged U (0 or 1 VLAN) + tagged T maps to trunk with `trunkMemberVLANs = T ∪ U`, native = U.
  The stored lists persist across mode changes (an access port keeps `trunkMemberVLANs`, default `1-4094`); restore them when reverting.
- System: `SystemGlobalSetting set` with `systemName` / `systemLocation` / `systemContact` (no Entry wrapper).
- Save running → startup: `GlobalActions set <copyCnfRun2Start></copyCnfRun2Start>`. Reboot: `Reload set <dummy></dummy>`.

**Form pages** (`GET API/<page>.htm`, an HTML form whose hidden inputs hold the values):
- `API/startup_changes.htm`: `rlRunningCDBequalToStartupCDB` (1 = saved, 2 = unsaved changes).
- `API/sntp_servers.htm`: `rlSntpServerInetAddress$repeat?N`, `rlSntpServerInetStatus$repeat?N` (3 = in sync), `rlSntpNtpConfigSyncSrvAddr`.

## More verified API facts (2026-11-16)

**Form pages (RomPager), learned by testing writes:**
- Edit pages (`x_e.htm?Query:...`) accept only the changed `$query` fields plus `<VT>$endQuery=OK` (storm control, default CoS verified).
  Some edit pages (port bandwidth `rlQosPortRateLimitStatus`, 802.1X `dot1xAuthAuthControlledPortControl`) also need the begin marker `<VT>$query=OK`
  and the fields **in page order**; otherwise "Might be missing parameters (x$query)". `api.formPost` reads the page once (cached template), orders the
  fields like the page and adds the begin marker when the page has one. `<select>`s count as page inputs (their value = the selected option).
- A post that applies several pending steps can fail halfway: each plan step carries its own ops and only the steps that succeeded leave the tray
  ("N of M steps applied; …").
- **Row-creating posts (`$add`) must send the page's own enabled inputs too**, in page order: the table marker (e.g. `PortMirror=OK`), the
  `$VT` descriptors, `$endVT`, and the page's end marker (e.g. `PortMirror$end1=OK`; not `$endAdd`). With the fields out of order the switch answers
  "Might be missing parameters (…)" (sometimes after creating the row anyway). `api.formPost` reads the page first and merges in page order whenever a field ends in `$add`.
- Attributes come in any case and often unquoted (`<INPUT TYPE=hidden NAME=portCopySource$repeat?1 disabled value="17">`).
- Errors come back in a hidden `mibError` input, HTML-escaped (`&nbsp;`), after `Diag=`.
- Rows are `field$repeat?N` (some pages use `$repeat2?N` or `$repeatIfPolicy?N`); writes to a row need `<Table>$endRepeat?N=OK`.

**Sections and fields (read and, where noted, written by the UI):**
- `STP&interfaceType=1`: `GlobalSetting{BPDUHandlingMode, pathCostDefaultValueType, BridgeSetting{bridgePriority, helloTime, maxAge, forwardDelay}, DesignatedRoot{bridgeID, rootBridgeID, rootPortID, rootPathCost, topologyChangeCount}}` and `InterfaceList/InterfaceEntry{STPEnabled, portFastEnabled (1 on, 2 off, **3 auto**), portFastOperEnabled, portState (1 disabled … 5 forwarding), portRole (4 root, 5 designated), pathCost, …}`. Written with nested `InterfaceList/InterfaceEntry` (fast link verified).
- `LAGList`: 12 `LAGEntry{interfaceName LAG1..12, LACPType (1 static, 2 LACP, 3 empty), PortList/PortEntry{portName, membershipType}}`; LAG ifIndex 1000+ (verified create/empty).
- `ProtectedPortList/IfEntry{interfaceName, interfaceID, interfaceType, type (1 unprotected, 2 protected), community}` (verified).
- `ForwardingTable/Entry{VLANID, MACAddress, interfaceName, addressType}`, `LLDPMEDNeighborList/NeighborEntry{deviceIDSubtype, deviceID, advertisedPortIDSubtype, advertisedPortID, systemName, …}`, `ARPList/ARPEntry{IPAddress, physicalAddress, interfaceName VLAN1}`.
- `DeviceBasicInfo{idleTimeout (minutes), telnetEnabled, …}`; `SystemGlobalSetting{systemMode (first char 0 = L2), jumboFrameEnabled(AfterReset), …}`.
- `CableTestPortList` entries per test type (2 status, 3 fault distance, 4 length class, 13–24 per pair); dates are `MMDDYYYY hh:mm:ss`.
- QoS mode: `API/cosqos_global.htm` `rlQosGlobalQoSMode$query` (1 off, 2 basic, 3 advanced; this switch: 3); written via Remote CLI (`qos basic|advanced`, `no qos`).
- Host parameters: `wcd?{general&HostParam=/js/hostparams.js}` (4 queues, policer and burst ranges, first LAG ifIndex 1000, 12 LAGs).
- Empty sections parse as an empty string; `SNMPTrap.SNMPTrapReceiverList` is `''` with no receivers.
- `LLDPInterfaceList` write: send `managementAddress` with every explicit (`mngAddrState=0`) write (empty = not advertised). The switch refuses an
  address while its IP comes from DHCP ("Advertisement cannot be configured on non-static IP address"), so the UI offers only static addresses.
  After a TLV write the switch still reports `mngAddrState=1`.
- `auth_table_TIC.htm` lists users **without** password hashes (8 s); `sec_line_password_TIC.htm` returns hashed line passwords.

**Write test log (2026-11-16, via the UI on unused ports 16–18 and harmless globals, each verified by an independent read and reverted):**
VLAN create + untagged + tagged trunk (and the reverse), STP fast link, protected port, default CoS, storm control, port mirroring add/remove,
static MAC add/remove, DNS host add/remove, SNMP community add/remove, LAG create/empty, switch location, ACL + ACE create/delete, cable test,
Remote CLI `ip http timeout-policy`; on port 16: port security lock, EEE, UDLD, incoming rate limit (bandwidth), DHCP snooping trust, 802.1X
port control, LLDP TLVs. Writes not yet exercised on the switch: everything else in Settings (they follow the catalogue; see the per-area notes in the commit history).
