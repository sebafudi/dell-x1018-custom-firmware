# X1018 web UI map (3.0.1.9)

Notes on the classic web UI, collected while driving it through browser automation (chrome-devtools MCP).
Each entry records where things are, what the page is called, and which API section it reads or writes.

## Access

- This map describes the **classic** Dell UI. With the new UI flashed, the classic one is still at `<prefix>/home.htm`. The new UI's API reference is in `webui/README.md`.
- URL: `https://<switch>/` redirects to `/csXXXXXXXX/config/log_off_page.htm` (login). The `csXXXXXXXX` prefix is per firmware build.
  Factory address `192.168.2.1`; the switch drops it once its DHCP client gets a lease.
- After login: `<prefix>/home.htm#` (dashboard).
- Login API: `GET <prefix>/config/System.xml?action=login&user=..&password=..`. It takes about 8 s; the session ID comes back in the `sessionID` response header.
- The UI talks to the switch in two different ways:
  1. **wcd** (newer pages): `GET <prefix>/wcd?{Section1}{Section2&filter=...}` reads data; `POST <prefix>/wcd?{Section}` with an XML body
     `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><Section action="set|add|delete|restore">...</Section></DeviceConfiguration>` writes it.
     Section names are defined in the firmware (`DELSCRF` section of the .ros), not in the web files. Unknown names return `statusCode -1 Cannot find the section X`.
  2. **RomPager forms** (most "Edit" dialogs): `GET <prefix>/API/<page>.htm` returns an HTML form whose hidden inputs carry the current MIB values
     (`<mib>$scalar`, `<table>$query`, `<col>$repeat?N`, …). Saving POSTs `application/x-www-form-urlencoded` to the same URL.
     Only fields declared in that page's template are accepted (the templates are in `web-ui/API/*.htm`), so this is **not** a generic MIB gateway.
     Names like `AutoUpdateScalar` in `js/Pages/*.js` are UI labels, not wcd sections.
- The UI uses synchronous XHRs and blocks with a "Working..." overlay during each call. The MCP `click` on an OK button often times out
  while the overlay is up even though the save went through. Clicking OK from `evaluate_script` (`input[type=submit][value=OK]`) and then
  reading the XHR log is more reliable.
- Many `<select>`s are hidden behind styled widgets (`<id>` select + `<id>_Text` input). Set them with `jQuery('#id').val(v).trigger('change')`.
- Modal dialogs close with `#closeLevel1` (Escape does not close them).

### XHR logger (paste via evaluate_script once per page load)

```js
() => { if (!window.__xlog) { window.__xlog=[]; const o=XMLHttpRequest.prototype.open, s=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(m,u){this.__m=m;this.__u=u;return o.apply(this,arguments)};
  XMLHttpRequest.prototype.send=function(b){window.__xlog.push({m:this.__m,u:String(this.__u),b:b?String(b):null});return s.apply(this,arguments)}; } }
```

## Menu tree (3.0.1.9)

Top level (left menu): **Dashboard**, **Switch Management**, **Logs and Alerts**, **Statistics and Diagnostics**, **Network Administration**.

Switch Management →
- **Switch Information**
- **IPv4 Addressing**
- **IPv6 Addressing**
- **File Update and Backup**
- **Domain Name (DNS)**
- **Time Synchronization**
- **Management Security**

## Pages that have been used

| Menu path → dialog | What it sets | Request it sends |
|---|---|---|
| Switch Management → Switch Information → **Edit** | System Name / Contact / Location, date, time, asset tag | `POST wcd?{SystemGlobalSetting}{TimeSetting}{StackInfoTable}`: `SystemGlobalSetting set <systemName>` (= CLI `hostname`), plus `TimeSetting set` with the date/time shown in the form (so saving also rewrites the clock) |
| Time Synchronization → Clock Source → **Edit** | Local / SNTP | `POST API/time_synch_global.htm` `rlTimeSyncMethod$scalar` (1 = local, 2 = SNTP) |
| Time Synchronization → Local Time Settings → **Edit** | date, time, time zone, DST (None/USA/Europe/Other, recurring pattern) | `POST API/general_sntp_settings.htm`: `rndTimeSyncManagedDateTime$scalar` (DDMMYYhhmmss), `rlTimeZoneVT` row: `rlTimeZoneTimeZoneOffset` (`01:00`), `rlTimeZoneDaylightSavingTimeMode`, `…Start`/`…End` (hex of ASCII `"WW DD MM hh:mm"`; week `06` = last, day `01` = Sun), `…Offset` (min) |
| Time Synchronization → SNTP Global Settings → **Edit** | poll interval, broadcast/anycast/unicast receive, unicast polling | `POST API/general_sntp_set.htm`: `rlSntpNtpConfigPollInterval`, `rlSntpBroadcastAdminState`, `rlSntpAnycastAdminState`, `rlSntpUnicastAdminState`, `rlSntpUnicastPollState` (`$scalar`, 1 = enabled, 2 = disabled) |
| Time Synchronization → SNTP Servers → **Edit** → **Add** | SNTP server (IPv4/IPv6 **address only**; hostnames are rejected with "Please enter a legal IP address") | `POST API/sntp_servers_a.htm`: `rlSntpServerInetAddress$add`, `rlSntpServerInetPolled$select` |
| (read) SNTP server status | status, last response, offset | `GET API/sntp_servers.htm`: `rlSntpServerInetStatus$repeat?N`, `rlSntpServerInetLastResp$repeat?N`, `rlSntpNtpConfigSyncSrvAddr` |

Gotchas:
- **Local Time Settings writes the date/time before the time zone.** If you change the zone and type the correct local time in the same save, the time is interpreted in the old zone (it ended up one hour ahead). Set the zone first, then the time, or just let SNTP fix it.
- The "Europe" DST preset doesn't show its start/end hours. "Other" + "Recurrence Pattern: Enabled" lets you enter the exact EU rule.

## Known pages / API sections (from the firmware source)

| Feature | Page script (js/Pages) | Request |
|---|---|---|
| Dashboard | Dashboard.js | big multi-section wcd query, `ConfigInfoExecute` / `ConfigInfoStatus` / `ConfigInfoOutputList` |
| SNTP servers | sntp_servers.js | `API/sntp_servers.htm`, add via `API/sntp_servers_a.htm` |
| SNTP mode (unicast/broadcast/poll interval) | general_sntp_set.js | `API/general_sntp_set.htm` |
| Clock source | time_synch_global.js | `API/time_synch_global.htm` |
| Time zone / DST | general_sntp_settings.js | `API/general_sntp_settings.htm` |
| System name / contact / location | (Switch Information) | wcd `SystemGlobalSetting` |
| HTTP/HTTPS ports, active HTTPS certificate | (Management Security?) | wcd `EWSGlobalSetting` (`rlEmWebHttpsActiveCertificateId`), `HTTPSActiveCertificate` |
| SNMP global on/off | snmp_global_params.js | `SNMPGlobalSetting.SNMPEnbl` |
| SNMP communities | snmp_communities.js | `CommunityList` (`CommunityEntry`) |
| Bonjour | (none) | **not available on X10xx**: `Bonjour.supported=FALSE` in the platform parameters (HPRM), no page, no CLI |
