# X1018 classic web UI (fw 3.0.1.9): system & management catalogue

Source: decompressed classic UI (the `EWS_FILE` section), read from the files only (no requests sent to the switch). Sections:
- 0. Request conventions, menu trees, session/idle timeouts
- A1. Switch info, system mode, jumbo frames, IPv4, IPv6
- A2. DNS, DHCP relay/server/snooping, UDP relay
- B. Time, file management, save/reboot
- C. Management security
- D. Logging, RMON events, SNMP

Each part was written separately, so a part's own "conventions" note repeats some of section 0.

## 0.1 Request conventions (serverManager.js, views.js)

- **wcd read**: `GET wcd?{S1}{S2&k=v}...`. The response is XML, and every element with `type="section"` is one section. Elements whose names end in `List` or `Table` become arrays of their children, except `entryCount` and `currentVLANs`, which stay as properties. A table edit read replaces `&query` with `&<pkey>=<encodeURIComponent(val)>` for each primary key, e.g. `wcd?{SyslogServerList&index=1&addrType=1&IPAddr=1.2.3.4}`.
- **wcd write**: `ServerManager.wcdPost(SetDataURI, obj)`. The `json2xml` step turns `{Sec:{action:[{Wrapper:{f:v}}]}}` into `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><Sec action="act"><Wrapper><f>v</f></Wrapper></Sec>...</DeviceConfiguration>`. It writes one `<Sec action>` element per (section, action) pair, in key order or in `_order[]` if present. Actions seen: `set`, `add`, `delete`, `restore`, `edit`. A field set to `undefined` is left out; one set to `null` or `""` is sent as an empty element. The POST URL's section list is not authoritative: the body decides what changes (IPv4 posts to `wcd?{IPv6NeighborList}`).
  - The response is XML with `ActionStatus/statusCode`, where `0` means OK. Otherwise `statusString` holds the message, plus optional `localMsg/msgId` and `arg`.
  - The ajax timeout is **3000 ms**. On error the client calls `logoff()` unless the page defines `OnPostError`. Async pages treat a timeout as success.
- **Form ("Tags") pages**: `GET API/<page>.htm[?query]` returns RomPager HTML, and every `<input name>` is a field.
  - Field name patterns:
    - `<mib>$scalar` (or `$Scalar`)
    - `<col>$repeat?N`: row N, 1-based, as returned by GET
    - `<col>$add` with end marker `<Table>$endAdd`
    - `<col>$query` with end marker `<Table>$endQuery`
    - `<Table>$endRepeat?N`
    - `$VT` / `$endVT` virtual-table descriptors
    - `$default`
    - `X EXISTS` selectors
  - Write: `POST API/<page>.htm`, body = `$("form").serialize()` with `+`→`%2B`. The form's own ACTION is `/Forms/config/<page>.htm`, but the JS posts to `./API/`.
  - **Only enabled inputs are serialized.** Almost all value inputs come back `disabled`. The script sets a value, removes `disabled` from it and from its end marker (value `OK`), and then posts. Always sent: `restoreUrl`, `errorCollector`.
  - Errors: a non-empty hidden `mibError` input in the POST response; the message is the text after `Diag=`.
- **Tags query/filter syntax**:
  - Edit query: `page.htm?Query:col=val@col2=val2`. With several sections it becomes `[Section]Query:...`.
  - Filters: `Filter:(expr)`, joined to a query with `^`.
  - Paging: `[VT]partialKey:-Counter-25`, as in the Logs page.
  - Column names are the `$repeat?` names with the `$...` suffix stripped.
- **Session plumbing**:
  - Keepalive: `GET device/authenticate_user.xml` every 20 s (`Polling.authInterval`, `AUTH_INTERVAL` default 20000).
  - Global poller: reads `./device/noStamp.xml` and others.
  - Logout: `GET System.xml?action=logout`, then redirect to `config/log_off_page.htm`. It also sets cookie `LogOff_Reason=Manual` for 1 minute.

## 0.2 Menu tree (documentation/toc.html, all levels; level 3+ joined with `|`)

- Dashboard
  - Overview
  - Interfaces: Port Tab | VLAN Tab | LAG Tab | Port Profile Tab
  - Switch Information
  - Resources
  - Recent Logged Events
  - Active Alerts
  - Ports and VLANs
  - Configuration Wizards: LAG | Configure VLAN | Port Profile | Initial Setup
- Switch Management
  - IP Addressing Overview: Difference Between IPv4 and IPv6 Addressing | IPv6 Prefixes
  - Switch Information
  - IPv4 Addressing: IPv4 Default Gateway | IPv4 Addressing
  - IPv6 Addressing: IPv6 Global Parameters | IPv6 Interface | IPv6 Address | IPv6 Default Gateway | IPv6 Neighbors
  - File Update and Backup: Overview | Update Firmware / Configuration | Backup Files | Active Firmware Image | Auto-Update | Restore Factory Defaults
  - Domain Name System (DNS): DNS Settings | Host Name Mapping
  - Time Synchronization: Clock Source | Local Time Settings | System Time from an SNTP Server
  - Management Security: Global Password Management | Line Password for CLI | Enable Password for CLI | Active Users | Local User Database | Access Profiles and Rules Configuration | Authentication Profiles | Select Authentication | TACACS+ | RADIUS
- Logs and Alerts
  - Overview
  - Logs
  - Login History
  - Remote Log Servers
- Statistics and Diagnostics
  - Monitoring: Statistics | CPU Utilization | History Control | History Table | Threshold and Events
  - Statistics: Interface Counters | Denied ACEs Counters | EAP Statistics | Etherlike Statistics | GVRP Statistics | Utilization Summary
  - Diagnostics: Integrated Cable Test | Optical Transceiver Diagnostics | Identify
- Network Administration
- Network Administration: VLAN
  - VLAN Overview: Frame Flow | Special-case VLANs | QinQ Tagging | Port Modes | Acceptable Frame Type
  - Standard VLAN: VLAN Membership | VLAN Port Settings | Protocol Group | Protocol Port | GVRP Parameters | GARP Timers | Private VLAN
  - Voice VLAN: Overview | Properties | Port Settings | OUI
- Network Administration: Spanning Tree and LAG
  - Spanning Tree: Spanning Tree Overview | Global Settings | STP Port Settings | Rapid Spanning Tree | MSTP Properties | VLAN to MSTP Instance | MSTP Instance Settings | MSTP Interface Settings
  - Link Aggregation (LAG): Overview | LAG Membership | LAG Configuration | LACP Parameters | VLAN LAG Membership | VLAN LAG Settings | STP LAG Settings
- Network Administration: Link Layer Discovery Protocol (LLDP)
  - Overview
  - LLDP Properties
  - LLDP Port Settings
  - MED Network Policy
  - MED Port Settings
  - Neighbors Information
- Network Administration: Quality of Service
  - Overview
  - Global Settings: QoS Properties | Queue Scheduling | CoS to Queue | DSCP to Queue | Bandwidth Management | TCP Congestion Avoidance
  - QoS Mapping: Overview | DSCP Mapping | Class Mapping | Policers | Aggregate Policer | Policy Table | Policy Class Maps | Policy Binding
  - QoS Statistics: Policer Statistics | Aggregated Policer | Queues Statistics
- Network Administration: Route Settings
  - System Routing Mode: System Routing Mode
  - IPv4 Route Settings: IPv4 Routes Table | ARP Table | UDP Relay
  - IPv6 Route Settings: IPv6 Routes Table | ISATAP Tunnel | Router Advertisement | IPv6 Prefixes
- Network Administration: Security
  - Dot1x Authentications: Port-Based Authentication Overview | Dot1x Overview | Port-Based Authentication Global | Port-Based Authentication Interface Settings | Host Authentication | Port Authentication Users
  - Storm Control Configuration: Storm Control
  - Port Security: Port Security
  - Dynamic ARP Inspection (DAI): Overview | Global Settings | DAI List | DAI Entries | DAI VLAN Settings | Trusted Interfaces
  - ACL and ACE: Overview | MAC-Based ACLs | MAC-Based ACEs | IPv4-Based ACLs | IPv4-Based ACEs | IPv6-Based ACLs | IPv6-Based ACEs | ACL Binding | Proprietary Protocol Filtering | Time Range Configuration | Time Range | Time Range Recurrence
- Network Administration: Port Settings
  - Ports: Overview | Jumbo Frames | Protected Ports | Port Profile | Port Configuration | Port and VLAN Mirrorings
  - Address Tables: Overview | Static Address Table | Dynamic Address Table
  - UDLD: Overview | UDLD States and Modes | How UDLD Works | UDLD Not Supported or is Disabled on a Neighbor | Inconsistent UDLD Mode in Local and Neighboring Device | Reactivating a Shutdown Port | Usage Guidelines | Dependencies On Other Features | Default Settings and Configuration | Common UDLD Tasks | UDLD Global Settings | UDLD Interface Settings | UDLD Neighbors
- Network Administration: SNMP Monitoring
  - SNMP Overview
  - SNMP Global Parameters
  - View Settings
  - Access Control
  - User Security Model
  - Communities
  - Notification Filter
  - Notification Recipients
- Network Administration: Multicast
  - Overview: Layer 2 Switching | IGMP Snooping | MLD Snooping
  - Global Parameters
  - Multicast Group
  - Multicast Forward All
  - IGMP Snooping
  - MLD Snooping
  - Unregistered Multicast
  - Multicast TV VLAN: Multicast TV VLAN Overview | Multicast TV VLAN Membership | Multicast TV VLAN Mapping
- Network Administration: DHCP Snooping and DHCP Relay
  - DHCP Snooping: Overview | DHCP Snooping Global Settings | VLAN Settings | Trusted Interfaces | Binding Database
  - DHCP Relay: Overview | Global Settings | Option 82 | Interface Settings
- Network Administration: Power Management
  - Green Ethernet: Overview | Global Settings | Interface Settings | Link Layer Discovery Protocol (LLDP) Ethernet Details
  - Power Over Ethernet (PoE): PoE Parameters | Interface Settings
- Network Administration: DHCP Server
  - Overview: Dependencies Between Features | Default Settings and Configurations | Workflow for Enabling the DHCP Server Feature
  - DHCP Server Properties
  - Network Pool
  - Static Hosts
  - Address Binding
  - Excluded Addresses
- Network Administration: sFlow
  - Overview
  - sFlow Receiver Settings
  - sFlow Interface Settings
  - sFlow Statistics

### 0.2b Live UI menu (js/tree_Items.js) → page object (metadata.js) for this scope

Page objects that differ from the help TOC are marked with *.

- **Switch Management**
  - Switch Information: `SwitchInformation`
  - IPv4 Addressing: `IPv4Addressing` (Ipv4Addr.js)
  - IPv6 Addressing: `ipv6_global_param`, `ipv6_interface`, `ipv6_addr`, `ipv6_default_gateway`, `ipv6_neighbors`
  - File Update and Backup: `update_firmware`, `backup_files`, `ActiveFirmwareImage`, `file_auto_update`, `restore_factory_defaults`
  - Domain Name (DNS): `dns_table`, `host_name_mapping`
  - Time Synchronization:
    - `time_synch_global` (Clock Source)
    - `general_sntp_settings` (Local Time)
    - `general_sntp_set` (SNTP Global)
    - `show_authen_table` (SNTP Authentication)*
    - `sntp_servers`
    - `general_sntp_m` (SNTP Interface Settings)*
  - Management Security:
    - `PasswordManagement`
    - `line_password`
    - `Enable_Password` (sec_password)
    - `activeUsers_table`
    - `auth_table_TIC` (Local User Database)
    - `security_mng` (Access Profiles)
    - `authen_profiles_method`
    - `select_Authentication`
    - `tacacs`
    - `radius`
- **Logs and Alerts**: `logs_settings`, `LoginHistory`, `log_servers_table`
- **Statistics and Diagnostics › Monitoring (RMON)**: `rmon_stats`, `cpu_utilization_chart`, `history_control_table`, `history_ether`, `alarms_table`, `rmon_logs`, `events_table`
- **Network Administration**
  - Route Settings › System Routing Mode: `system_mode`. Shown only if `Conditions.systemModeEditable`. L3-only pages turn into a "switch to L2+" link (`systemModeLink`) when the switch is in L2 mode.
  - SNMP Monitoring:
    - `snmp_global_params`
    - `view_settings`
    - `access_control`
    - `user_sec_model`
    - `snmp_communities`
    - `notification_filter`
    - `SNTPnotification` (= SNMP **Notification Recipients**, despite the name)
  - DHCP Snooping and Relay:
    - DHCP Snooping: `property_dhcp`, `vlan_Settings`, `trusted_table`, `binding_database`
    - DHCP Relay (L3 mode only): `dhcp_relays_table`, `dhcp_relays`, `dhcp_int_settings`
  - DHCP Server: `DHCPServerProperties`, `NetworkPool`, `static_hosts`, `address_binding`, `ExcludedAddresses`
  - Port Settings › Ports: `switch_jumbo_fr` (Jumbo Frames)

The Dashboard tiles (Dashboard.js) also edit Switch Information and IPv4; see A1.

## 0.3 Session / idle / exec timeouts (searched across all of `classic/`)

**The classic UI has no page that sets any session or exec timeout.** A search of `js/`, `API/`, `tpl/`, `documentation/`, `polling/` and `device/` for timeout/idle/exec/session turned up only the items below.

1. **Web idle timeout (read-only in the UI)**
   - Source: `device/noStamp.xml`, polled by the global poller (`OTHER_PATH = "./device/noStamp.xml"` in polling/eventPolling.js). It is a RomPager page, `RpUrl=/Polling/noStamp.xml`.
   - Fields, both `RL_scalarGet` display text and not form inputs, so they can't be written through this page:
     - `<rlEmWebMaxIdleTimeout>`: HTTP idle timeout.
     - `<rlEmWebMaxHttpsIdleTimeout>`: HTTPS idle timeout. It is emitted only when the `rlEmWebMaxHttpsIdleTimeout EXISTS` dynamic selector is true.
     - Other fields in the same file: `rlSyslogAlarmFlag`, `rlRunningCDBequalToStartupCDB`.
   - Client logic (js/components/applicationManager.js, `checkLogoutTimeout`):
     - A timer ticks every `interactionTime` = 10 s and adds 10 to `lastInteractionTime`, counted in seconds.
     - Each page/view render calls `checkLogoutTimeout(true)`, which resets the counter (views.js, about 25 call sites).
     - It picks `rlEmWebMaxIdleTimeout` when `location.protocol == "http:"` and `rlEmWebMaxHttpsIdleTimeout` otherwise.
     - If `lastInteractionTime > timeout && timeout != 0` it calls `logoff()`. **Unit: seconds. 0 means never.** Effective granularity is 10 s.
   - Range/default (inferred, not in these files): the RADLAN MIB `rlEmWebMaxIdleTimeout` is in seconds, and the CLI equivalent is `ip http timeout-policy <0-86400>`, default 600 s. Treat these as unconfirmed for this firmware.
   - The switch also enforces the timeout server-side (inferred). The 20 s `authenticate_user.xml` keepalive does not reset it, because it is not "interaction" (inferred).
   - Writing it from a new UI (inferred options, untested):
     - (a) the CLI (`ip http timeout-policy`) via whatever CLI channel exists;
     - (b) a RomPager form that exposes `rlEmWebMaxIdleTimeout$scalar`. None ships in this UI; RomPager only accepts fields declared in its templates.
     - (c) SNMP SET of the MIB object.
   - No wcd section for it appears in any JS.
2. **Telnet / SSH / console exec-timeout**: **absent.** No field, section or help text covers exec-timeout or line timeout. Line Password for CLI (`rlAAALineTable`) carries only password, lock state and expiry. The only timeouts in Management Security are:
   - TACACS+ `timeoutForReply`, 1–30 s;
   - RADIUS `timeoutForReply`, 1–30 s; "use default" is sent as `0`.

   Details are in part C.
3. **Other timeouts in or near scope**:
   - SNMP inform recipient `timeout`, 1–300 s (part D).
   - ARP entry aging `ARPGlobalSetting.timeout` (arp_table, out of scope).
   - Identify LED timeout (diagnostics_identify).
   - wcdPost ajax 3 s (client side).
   - Firmware upload watchdog 60 s (part B).
4. **Service enable/ports (HTTP/HTTPS/Telnet/SSH)**: **absent as settings.** The services appear only as the Access Profile rule filter `rlMngInfListInetService`: 0 All, 1 Telnet, 2 SNMP, 3 HTTP, 4 HTTPS, 5 SSH (part C).


---

## A1. Switch identity, system mode, jumbo frames, IPv4 and IPv6 addressing

Conventions: `wcd?{S}` = GET returning XML `ResponseData/DeviceConfiguration/<S>`. A write is a POST of `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><S action="set|add|delete|restore">…</S>…</DeviceConfiguration>` to the page's SetDataURI. The JSON-to-XML step (`ServerManager.json2xml`) emits one `<S action=…>` element per (section, action) pair, in JS insertion order. Each array item becomes its wrapper element (`<ifEntry>`, `<Entry>`, …). A JS `undefined` field is omitted; `null` gives an empty element. Edit reads replace `&query` with `&<pkey>=<urlencoded value>` for each Pkey. A POST succeeds when `ActionStatus/statusCode` = 0; otherwise the client shows `statusString` and `localMsg/msgId,arg`. wcdPost uses a 3 s ajax timeout.

---

### 1. Switch Information
Menu: Switch Management > Switch Information (`SwitchInformation`, jQuery type, Id 1295).
- Read: `GET wcd?{SystemGlobalSetting}{TimeSetting}{StackInfoTable}` (same URI for the edit read).
- Write: `POST wcd?{SystemGlobalSetting}{TimeSetting}{StackInfoTable}`. The body sends sections in this order:
```xml
<SystemGlobalSetting action="restore"><systemName/>…</SystemGlobalSetting>   <!-- only the fields left EMPTY (value "") -->
<SystemGlobalSetting action="set"><systemName>x</systemName><systemContact>…</systemContact><systemLocation>…</systemLocation></SystemGlobalSetting> <!-- only non-empty fields -->
<TimeSetting action="set"><setTimeMode>1</setTimeMode><CurrentLocalTime><year>YYYY</year><month>MM</month><day>DD</day><hour>HH</hour><minute>mm</minute><second>ss</second></CurrentLocalTime></TimeSetting>
<StackInfoTable action="set"><Entry><unitID>{StackInfoTable[0].unitID}</unitID><assetTag>x</assetTag></Entry></StackInfoTable>  <!-- only if assetTag non-empty -->
```
| Field (section.field) | UI label | Meaning / range |
|---|---|---|
| SystemGlobalSetting.systemName | System Name | String 0-160. An empty value is sent as action="restore", which restores the default. |
| SystemGlobalSetting.systemContact | System Contact | 0-160. Empty value → restore. |
| SystemGlobalSetting.systemLocation | System Location | 0-160. Empty value → restore. |
| SystemGlobalSetting.MACAddress | MAC Address | Read-only. Displayed with `:` replaced by `-`. |
| SystemGlobalSetting.systemObjectID | Sys Object ID | Read-only |
| SystemGlobalSetting.systemUpTime | System Up Time | Read-only. Value is in ticks, converted by `/TICKS_PER_SECOND` and shown as `Xd Xh Xm Xs`. |
| SystemGlobalSetting.systemDescription | (read only, used by Dashboard) | |
| SystemGlobalSetting.firmwareVersion | (About dialog, Dashboard) | Read-only |
| SystemGlobalSetting.serialNumber | Serial No. | Read-only |
| TimeSetting.CurrentLocalTime.{day,month,year,hour,minute,second} | Date (DD/MM/YYYY picker), Time (H:i:s, 30 min step picker) | Docs: mandatory. Used when SNTP is unavailable. |
| StackInfoTable[0].serviceTag | Service Tag | Read-only |
| StackInfoTable[0].assetTag | Asset Tag | String 0-16 |
| StackInfoTable[0].unitID | (key for the assetTag write) | |

Gotchas:
- The Save handler always sends `TimeSetting set` with `setTimeMode=1` and the date/time fields' contents. Those fields are pre-filled when the page loads, so saving a name change also resets the clock to the page-load time. If the date or time field is empty, those subfields are undefined and omitted. Hour "24" is converted to "0".
- Clearing a text field does not send an empty set; it sends `action="restore"` for that field.
- The asset tag cannot be cleared from this page, because an empty value is not sent.
- MetaData has a bogus Pkey `["SNMPGroupName","securityModel"]`. It is unused.

**About dialog** (masthead, `About.js`, tpl/About.htm): reads `wcd?{SystemGlobalSetting}` and shows `firmwareVersion`. device/about.htm is a static template with no data.

**Dashboard "Switch Information" tile** (Dashboard.js, SwitchInformationContainerManager.js):
- Read: one big `wcd?{PortAppliedMacroList&interfaceType=1}{VLANCurrentStatus}{DiagnosticsUnitList}{VLANMembershipInterfaceList&interfaceType=1}{LACPPortList&filter=actorAdminKey>0}{MemoryLogTable&count=3}{SyslogSeverityCounters}{StackInfoTable}{SystemGlobalSetting}{SNMPGlobalSetting}{CommunityList}{AdminUserSetting}{IPv4InterfaceList&filter=(IPAddr>=1.0.0.0)}{TimeSetting}{IPv4GatewayList}`. It is preceded by `POST wcd?{ConfigInfoExecute}` with `<ConfigInfoExecute action="set"><type>4</type></ConfigInfoExecute>`, then a busy-poll of `wcd?{ConfigInfoStatus}` until `state==6`, then `wcd?{ConfigInfoOutputList}`. This makes it a slow, multi-step read.
- The tile shows IP, MAC, asset tag and firmware. The IP shown is the IPv4InterfaceList entry matching `location.hostname`, or entry 0.
- Edit (L2 mode only; in L2+ it opens IPv4 Addressing) posts to `wcd?{IPv4InterfaceList&filter=(interfaceName='VLAN<defaultVlan>')}[{IPv4GatewayList}]`:
```xml
<IPv4InterfaceList action="set"><ifEntry><IPAddr/><interfaceName/><subnetMask/><owner/></ifEntry></IPv4InterfaceList>
<IPv4GatewayList action="set"><GWEntry><IPAddr/><owner>1</owner></GWEntry></IPv4GatewayList>
<IPv4GlobalSetting action="set"><IPv4ManagementAddress/><managementInterfaceName/></IPv4GlobalSetting>
```
- Bugs in this edit path:
  - It sends `owner = StaticIP ? '2' : '1'`, which is inverted relative to the IPv4 page (1 = static).
  - It references an undefined `Gateway` variable (inferred: this throws or is always falsy).
  - Do not copy either of these.

---

### 2. System Routing Mode
Menu: Network Administration > Route Settings > System Routing Mode (`system_mode`, Id 250).
- Shown only when `Conditions.systemModeEditable` is set: hostparams key `tuning_features_enable_edit_allowed` & mask.
- Read: `GET wcd?{SystemGlobalSetting}`. The field is `systemMode`, a string whose first character is the routing mode.
- Write: `POST wcd?{SystemGlobalSetting}`. The body uses a different section:
```xml
<GlobalActions action="set"><systemMode>{newMode}{oldSystemMode.slice(1)}</systemMode></GlobalActions>
```
  The client rewrites only the first character and preserves the rest of the current string.
- Enum (first char): `0` = Layer 2, `1` = Layer 2+ Routing ("Layer 2 + Static Routing" in the table view).
  - L2 only: Dot1x guest VLAN, Dynamic VLAN Assignment, Multi Session. IPv4/IPv6 static routing is disabled in L2.
  - L2+ only: IPv4/IPv6 static routing.
- `globalParameters.displayRouter` (`Conditions.SystemMode.L3Mode`) controls many pages, e.g. the IPv4 routes and UDP relay pages and the IPv6 redirect column.
- Gotchas:
  - A confirm dialog warns: "Changing the system mode causes the device to automatically reboot itself after erasing the startup-configuration file… your current session will be disconnected."
  - The device reboots and the startup config is erased. The UI should force a backup step first.
  - The "Save to startup" checkbox (`.SaveTo`) is removed on this page.

---

### 3. Jumbo Frames
Menu: Network Administration > Port Settings > Ports > Jumbo Frames (`switch_jumbo_fr`, Tags/form type).
- Read: `GET API/switch_jumbo_fr.htm` (RomPager form, RpUrl `/api/switch_jumbo_fr.htm`, ACTION `/api/switch_jumbo_fr.htm`). Inputs:
  - `restoreUrl`, `errorCollector`, `mibError` (repeat; error text)
  - `dot1qMaxSupportedVlans` (disabled)
  - `rlJumboFramesCurrentStatus EXISTS` (tag selector)
  - inside the RpDynamicDisplay group: `rlJumboFramesCurrentStatus` and `rlJumboFramesStatusAfterReset` (both disabled hidden; no `$scalar` suffix)
- Write: `POST API/switch_jumbo_fr.htm`, a urlencoded serialization of the form with `+` → `%2B`. Disabled inputs are not sent. Save enables only `rlJumboFramesStatusAfterReset=<1|2>`, so the body is `restoreUrl=…&errorCollector=…&rlJumboFramesStatusAfterReset=1`.
- Errors come back as `mibError` inputs in the response HTML. Text after `Diag=` is the message.
- Fields:
  - `rlJumboFramesCurrentStatus`: read-only. 1 = Enabled, 2 (anything else) = Disabled.
  - `rlJumboFramesStatusAfterReset`: radio. 1 = Enabled, 2 = Disabled.
  - Default: Disabled (inferred).
- Gotcha: the setting takes effect only after you save the config and reboot (docs). The new UI should offer Save + Reboot.

---

### 4. IPv4 Addressing (interfaces, DHCP client, default gateway)
Menu: Switch Management > IPv4 Addressing (`IPv4Addressing`, JS `Ipv4Addr.js`, Id 1235).

Read:
- List: `GET wcd?{IPv4GlobalSetting}{IPv4InterfaceList}{IPv4GatewayList}`. IPv4GlobalSetting is fetched but unused by this page.
- Edit: `GET wcd?{IPv4GlobalSetting}{IPv4InterfaceList&IPAddr=<ip>}{IPv4GatewayList}` (Pkey of IPv4InterfaceList = `IPAddr`).

Write:
- SetDataURI is literally `wcd?{IPv6NeighborList}`. This is a copy-paste quirk; the body decides what changes.
- `IPv4Addressing.async = true`. A POST that times out (3 s) is treated as success: the page refreshes and the modal closes. This is expected when the management IP changes.
- `reloadWithNewIP(ip)` redirects to `<proto>//<ip>/home.htm` after 5 s. It is skipped if the hostname is IPv6.

Add/Save body (shared `IPv4Addressing.Save`):
```xml
<!-- optional, if a static gateway exists and the entered GW differs: -->
<IPv4GatewayList action="delete"><GWEntry><IPAddr>{old}</IPAddr><owner>{old owner}</owner></GWEntry></IPv4GatewayList>
<!-- if the GW field is non-empty (this REPLACES the post.IPv4GatewayList object, so the delete above is dropped): -->
<IPv4GatewayList action="set"><GWEntry><IPAddr>{gw}</IPAddr></GWEntry></IPv4GatewayList>
<IPv4InterfaceList action="set"><ifEntry><IPAddr/><interfaceName/><subnetMask/><owner/></ifEntry></IPv4InterfaceList>
```
- On edit, if the existing static GW belonged to this interface and the interface's IP/owner/name changed, the client sends `IPv4GatewayList delete <GWEntry><IPAddr>` (without owner).
- On a DHCP edit, IPAddr is the existing IP.

Remove: checked rows give
```xml
<IPv4InterfaceList action="delete"><ifEntry><IPAddr/><interfaceName/><owner/></ifEntry>…</IPv4InterfaceList>
```
plus `<IPv4GatewayList action="delete"><GWEntry><IPAddr/><owner/></GWEntry>` if the deleted row hosted a static default GW.

Fields:
| Field | UI | Values |
|---|---|---|
| IPv4InterfaceList.interfaceName | Interface (span on edit). On add, Interface Type dropdownRadio Port/VLAN/LAG then Interface. | Name without spaces, e.g. `VLAN1` (inferred format from `getInterfaceNameAccordingToValue().replace(" ","")`) |
| IPv4InterfaceList.interfaceType | (read) | |
| IPv4InterfaceList.owner | IP Address Source | `1` = Static, `2` = DHCP, `4` = Default (table only). Add default: DHCP. When owner==1 on edit, both radios are disabled (cannot switch static→DHCP in edit). |
| IPv4InterfaceList.IPAddr | IP Address | IPv4. Disabled on edit and when DHCP. Rows whose IP starts with "0" (DHCP not yet bound) display blank and are not editable. |
| IPv4InterfaceList.subnetMask | Subnet Mask | x.x.x.x, contiguous mask |
| (UI only) Address Class | `rdoClass` | 1 = Subnet Mask, 2 = Prefix Length (UI converts between them) |
| (UI only) Prefix Length | `txtPrefix` | Converted to a mask. Validation 1-32; checkPrefix also enforces 8-30 (/8 … 255.255.255.252). |
| IPv4GatewayList.GWEntry.IPAddr | Default Gateway | IPv4, optional. Hidden in L2+ mode, where gateways go via IPv4 static routes. |
| IPv4GatewayList.owner | | 1 = static (only static GWs are deleted/replaced) |
| IPv4GatewayList.fwdStatus | (read) | |

Gotchas:
- In L2 mode only one IPv4 interface may exist. Adding a new one asks: "Only one IPv4 interface can exist in L2 mode. Creating a new IPv4 interface … will delete the current IPv4 interface. This will cause the current session to terminate."
- In L2 the "Default Gateway" column is shown only for the interface whose subnet contains GW[0].
- No DHCP client options (hostname, etc.) appear in this page. The DHCP client is simply `owner=2`.

---

### 5. IPv6 Addressing
Menu: Switch Management > IPv6 Addressing > {IPv6 Global Parameters, IPv6 Interface, IPv6 Address, IPv6 Default Gateway, IPv6 Neighbors}.

#### 5.1 IPv6 Global Parameters (`ipv6_global_param`)
- Read: `GET wcd?{IPv6GlobalSetting}{IPv6InterfaceList}`.
- Write: `POST wcd?{IPv6GlobalSetting}{IPv6InterfaceList}`.
  - If `routingSupported` (`ipv6Supported==1 && routersIPforward==1`):
```xml
<IPv6GlobalSetting action="set"><ICMPErrorRateLimitInterval/><ICMPErrorRateLimitBucketSize/><unicastRoutingEnable/><linkLocalDefaultZoneIfName/><hopLimit/></IPv6GlobalSetting>
```
  - Otherwise only `ICMPErrorRateLimitInterval` and `ICMPErrorRateLimitBucketSize` are sent, and the UI shows only these two fields.

| Field | UI | Range / enum |
|---|---|---|
| unicastRoutingEnable | IPv6 Routing | 1 = Enabled, 2 = Disabled |
| ICMPErrorRateLimitInterval | ICMPv6 Rate Limit Interval (ms) | 0-2147483647 |
| ICMPErrorRateLimitBucketSize | ICMPv6 Rate Limit Bucket Size (messages) | 1-200 |
| hopLimit | IPv6 Hop Limit | 1-255 |
| linkLocalDefaultZoneIfName | IPv6 Link Local Default Zone Interface | Dropdown "None" plus IPv6 interfaces. The read value `none` or "" means None. The client posts the option TEXT (`None` or the interface name). |

Note: the read is field `linkLocalDefaultZoneIfName`; MetaData lists `LinkLocalDefaultZoneIfName` (case mismatch, harmless).

#### 5.2 IPv6 Interface (`ipv6_interface`)
- Read (list and edit): `GET wcd?{DHCPv6ClientInterfaceList&query}{IPv6InterfaceList&query}`. In the list read, `&query` is stripped. The edit read uses `&interfaceName=<name>` for IPv6InterfaceList.
- Write: `POST wcd?{DHCPv6ClientInterfaceList}{IPv6InterfaceList}`. Add and Save share the same body:
```xml
<DHCPv6ClientInterfaceList action="set">
  <Entry><interfaceName/><statelessEnable/>[<refreshTimeMinimum/>|<refreshTime/>]</Entry>
  <Entry><interfaceName/><statelessEnable/>[<refreshTime/>|<refreshTimeMinimum/>]</Entry>
</DHCPv6ClientInterfaceList>
<IPv6InterfaceList action="set"><InterfaceEntry><interfaceType></interfaceType><interfaceName/><interfaceID>{ifIndex}</interfaceID><DADAttemptsNo/><statelessAutoconfigEnable/><ICMPUnreachSendEnable/>[<redirectEnable/> only if displayRouter (L2+)]</InterfaceEntry></IPv6InterfaceList>
```
  - DHCPv6 is always sent as two entries for the same interface.
  - When stateless = 1: if 600 ≤ refreshTimeMinimum ≤ 86400, entry 1 carries refreshTimeMinimum and entry 2 carries refreshTime; otherwise the order is reversed. This ordering avoids a transient min>refresh rejection.
  - When stateless = 2, both entries carry only interfaceName and statelessEnable.
- Remove:
```xml
<IPv6InterfaceList action="delete"><InterfaceEntry><interfaceName/><interfaceID/><interfaceType/><DADAttemptsNo/><statelessAutoconfigEnable/><ICMPUnreachSendEnable/></InterfaceEntry>…</IPv6InterfaceList>
<DHCPv6ClientInterfaceList action="delete"><Entry><interfaceName/><interfaceType/><statelessEnable/><reconfigureEnable/><refreshTimeMinimum/><refreshTime/></Entry>…</DHCPv6ClientInterfaceList>
```
  All fields are echoed from the read.

| Field | UI | Range / enum / default |
|---|---|---|
| IPv6InterfaceList.interfaceName (Pkey) | Interface. On add, Interface Type dropdownRadio Port/VLAN/LAG. | On add: if the ifIndex lookup returns -1, the name is `"VLAN"+name`; if ifIndex ≥ 1000 (LAG), the name is `name[0..3]+name[4..6]` (strips a space). |
| interfaceID | | ifIndex |
| DADAttemptsNo | Duplicate Address Detection Attempts | 0-600. Default 1. 0 disables DAD. |
| statelessAutoconfigEnable | Autoconfiguration | 1 = Enabled (default), 2 = Disabled |
| ICMPUnreachSendEnable | Send ICMP Unreachable | 1 = Enabled (default), 2 = Disabled |
| redirectEnable | IPv6 Redirects (L2+ only; column hidden in L2) | 1 = Enabled (default), 2 = Disabled |
| DHCPv6ClientInterfaceList.statelessEnable | DHCPv6 Client Stateless | 1 = Enabled, 2 = Disabled (default) |
| DHCPv6ClientInterfaceList.refreshTimeMinimum | Minimum Information Refresh Time (sec) | User Defined 600-4294967294 (UI default 86400), or Infinite. Infinite is read as `4294967295` and written as a long string of 9s (`"999…9"`; inferred: the agent clamps it to max). |
| DHCPv6ClientInterfaceList.refreshTime | Information Refresh Time (sec) | 86400-4294967294 (default 86400), or Infinite (same encoding as above). The minimum must be ≤ this value. |
| reconfigureEnable | (read only; echoed on delete) | |

Gotchas: "Entry already exists" check on add. Adding or deleting re-routes the IPv6 Address page.

#### 5.3 IPv6 Address (`ipv6_addr`)
- Read:
  - Initial: `GET wcd?{IPv6InterfaceList}{IPv6AddressList}`.
  - The client then re-reads with a per-interface filter: `GET wcd?{IPv6AddressList&filter=(interfaceName='<if>')}{IPv6InterfaceList}`. The "View By" interface filter uses `wcd?{IPv6InterfaceList}{IPv6AddressList&filter=(interfaceName='<sel>')}`.
- Write (SetDataURI `wcd?{IPv6InterfaceList}{IPv6AddressList}`):
  - Add:
```xml
<IPv6AddressList action="set"><IPv6addressEntry><interfaceName/><type/><IPv6Address/><prefixLength/></IPv6addressEntry></IPv6AddressList>
```
    prefixLength is an empty element for Link Local.
  - Remove: `<IPv6AddressList action="delete"><IPv6addressEntry><interfaceName/><type/><IPv6Address/><prefixLength/></IPv6addressEntry>…`
  - No edit.

| Field | UI | Values |
|---|---|---|
| interfaceName | Interface (the current filter) | |
| type | IPv6 Address Type | 1 = Link Local (default), 2 = Global Unicast, 3 = Global Anycast, 4 = Multicast (display only) |
| IPv6Address | IP Address | Max 45 chars. Link Local must be fe80 with zone checks (`interfaceManager.checkZone/checkIPv6Local/checkIPv6Global`). |
| prefixLength | Prefix Length | 3-128. Disabled for Link Local. |
| origin | (read) | Rows with origin==5 cannot be deleted (inferred: auto/linklocal) |

Gotchas:
- Docs mention an EUI-64 option that is not in this UI.
- Max 5 global addresses per interface, 128 per system (docs).
- Tunnel interfaces (ISATAP) are read-only: add and delete are disabled.
- Add is disabled if no IPv6 interface exists.

#### 5.4 IPv6 Default Gateway (`ipv6_default_gateway`)
- Read: `GET wcd?{IPv6RouteList&filter=(destinationIPv6Address='::'&&destinationPrefixLength=0)}`.
- Write (`wcd?{IPv6RouteList}`):
  - Add: note the action is `add`, not `set`.
```xml
<IPv6RouteList action="add"><Entry><destinationIPv6Address>::</destinationIPv6Address><destinationPrefixLength>0</destinationPrefixLength><isPointToPoint>2</isPointToPoint><nextHopIPv6Address>{addr[%zone]}</nextHopIPv6Address><metric/></Entry></IPv6RouteList>
```
  - Remove: `<IPv6RouteList action="delete"><Entry><interfaceName/><nextHopIPv6Address>{addr[%zone]}</nextHopIPv6Address><destinationIPv6Address>::</destinationIPv6Address><destinationPrefixLength>0</destinationPrefixLength><isPointToPoint>2</isPointToPoint></Entry>…`

| Field | UI | Values |
|---|---|---|
| (UI) IPv6 Address Type `ipType` | Radio | 0 = Link Local (default), 1 = Global |
| (UI) Link Local Interface | Dropdown of IPv6 interfaces (from `interfaceManager.getSourceInterfaces`) | Error "You must first add an IPv6 Interface" if empty |
| nextHopIPv6Address | Default Gateway IPv6 Address | Max 45. For link-local, the client appends a zone suffix: `%vlanN`, `%poN` (LAG), `%<ifname lowercase>`, or `%tunnel1` (ISATAP). For delete, link-local is detected via `indexOf("fe80")`. |
| metric | Metric | 1-65535 (optional) |
| routeType | Type (table) | 1 Other, 2 ICMP, 3 Static, 4 Connected, 5 Local, 6/7 ND |
| interfaceName, interfaceType, interfaceID, isPointToPoint, destination* | (read) | |

Gotcha: only routeType 3 (Static) rows that are not directly connected can be deleted; the other checkboxes are disabled.

#### 5.5 IPv6 Neighbors (`ipv6_neighbors`)
- Read: `GET wcd?{IPv6NeighborList}`. Edit read: `wcd?{IPv6NeighborList&interfaceName=…&IPv6Address=…}`. The add form uses `wcd?{IPv6InterfaceList}`.
- Write (`wcd?{IPv6NeighborList}`):
  - Add: `<IPv6NeighborList action="set"><NeighborEntry><interfaceName/><IPv6Address/><MACAddress/><type>4</type></NeighborEntry></IPv6NeighborList>`
  - Edit: a no-op if the entry is Dynamic and stays Dynamic. Otherwise it sends delete then set in the same section:
```xml
<IPv6NeighborList action="delete"><NeighborEntry><interfaceName/><IPv6Address/><MACAddress/><type/></NeighborEntry></IPv6NeighborList>
<IPv6NeighborList action="set"><NeighborEntry><interfaceName/><IPv6Address/><MACAddress/><type/></NeighborEntry></IPv6NeighborList>
```
  - Remove: `<IPv6NeighborList action="delete"><NeighborEntry><interfaceName/><IPv6Address/></NeighborEntry>…`

| Field | UI | Values |
|---|---|---|
| interfaceName (Pkey) | Interface / IPv6 Interface | Spaces stripped |
| IPv6Address (Pkey) | IPv6 Address | Unicast IPv6, max 45 |
| MACAddress | MAC Address | MAC, max 17. Disabled when Dynamic. |
| type | Type | 1 Other, 2 Invalid, 3 Dynamic, 4 Static, 5 Local. Edit radio: 4 Static / 3 Dynamic. Static entries cannot be changed to Dynamic. |
| state | State | 0 Unreachable, 1 Reachable, 2 Stale, 3 Delay, 4 Probe, 5 Invalid, 6 Unknown, 7 Incomplete. Shown as "N/A" for Static. |
| isRouter | Router | 1 = Yes, else No |
| interfaceType, interfaceID | (read) | |

Gotcha: Dynamic rows cannot be deleted (checkbox disabled), though docs mention clearing the table (inferred: there is no clear-all in this UI).

---

## A2. DNS, Host Name Mapping, DHCP Relay / Server / Snooping, UDP Relay

Conventions used below:
- **wcd write**: `POST wcd?{Section}` with body `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><Section action="set|delete|restore">…entries…</Section></DeviceConfiguration>`. When one JS object holds several actions, `json2xml` writes them in key order, e.g. `delete` and then `set`. Each action is its own `<Section action=…>` element.
- **Form write**: `POST API/<page>.htm` with the urlencoded serialization of the form returned by GET (`+` is sent as `%2B`). Every `$repeat`/`$add`/`$scalar` input starts out `disabled`, and only the inputs the script enables are sent: the changed fields plus their end marker (`…$endRepeat?N` / `…$endAdd` / `…$endQuery` = `OK`). The always-enabled `restoreUrl` and `errorCollector` go too. A non-empty `mibError` in the response means an error. `?N` is the 1-based row index in the GET response.
- **wcd edit read**: `{Section&query}` turns into `{Section&<pkey>=<urlencoded value>…}`.

---

### DNS Settings
- **Menu:** Switch Management > Domain Name (DNS) > DNS Settings (page `dns_table`, Id 631, DataType Table2Scalar2)
- **Read (table):** `GET wcd?{NameServerList}`
- **Read (settings dialog "Domain Name (DNS) Settings"):** `GET wcd?{DNSGlobalSetting}`
- **NameServerList entry** (`<Entry>` wrapper, Pkey `IPAddr`):
  - `IPAddr`: the DNS server. IPv4 `X.X.X.X`. IPv6 is `X:X::X`. A link-local IPv6 address carries a zone suffix: `%vlanN`, `%poN`, `%tunnel1` or `%<ifname>` (interfaceManager.updateSentIPField).
  - `addrType`: `1` = IPv4, `2` = IPv6.
  - `owner` ("IP Address Source"): `1` = Static, `2` = DHCP (dynamic). The script disables the delete checkbox on DHCP rows.
  - `preference`: lower is preferred. The active server is the static entry with the lowest preference; if there is none, it is the first DHCP entry.
- **Add:** `NameServerList action="set"` re-sends **every existing entry** unchanged, plus `<Entry><IPAddr/><addrType>1|2</addrType><preference>max+1</preference><owner>1</owner></Entry>`. Client-side limit: 8 name servers ("There are already 8 name servers").
- **Set Active Server (table Save):** `NameServerList action="set"` with every entry `{IPAddr, addrType, preference+1, owner}`, except that the chosen row gets `preference=1`. Nothing is sent if the active server did not change.
- **Delete:** `NameServerList action="delete"` with `<Entry><IPAddr>…</IPAddr></Entry>` per selected row.
- **DNSGlobalSetting fields:**
  - `enbl` ("DNS Status"): `1` = Enabled, `2` = Disabled.
  - `domainName` ("Default Domain Name"): 1–158 characters, Domain validation.
  - `domainNameOwner` ("Domain Name Source"): read-only span, likely Static/DHCP (inferred).
  - `domainNameQueryInterval`: seconds, UI range 8–3600, default 8 ("Use Default (8 sec)" checkbox). The documentation says "20-3600", but the script uses 8–3600.
- **Settings save:** a single POST containing both:
  - `<DNSGlobalSetting action="restore"><domainName/><enbl/><domainNameOwner/><domainNameQueryInterval/></DNSGlobalSetting>`
  - `<DNSGlobalSetting action="set"><domainName>…</domainName><enbl>1|2</enbl>[<domainNameQueryInterval>n</domainNameQueryInterval>]</DNSGlobalSetting>`
  
  The empty `restore` comes first, apparently to reset to defaults; `domainNameQueryInterval` is left out of `set` when the default is used.
- **Gotchas:**
  - "restore then set" means any field left out of `set` falls back to its default.
  - The default checkbox id is misspelled in Save (`#chkDefaultDomainNameQuer` vs `chkDefaultDomainNameQuery`), so "default" is only detected when the text value == 8.
  - The SetDataURI is `wcd?{NameServerList}`; settings use the same wcd POST endpoint with a different section in the body.

### Host Name Mapping
- **Menu:** Switch Management > Domain Name (DNS) > Host Name Mapping (`host_name_mapping`, Id 640)
- **Read:** `GET wcd?{StaticHostNameToAddrList}`
- **Entry** (`<Entry>` wrapper; Pkey `hostName, owner, IPAddr`): one row per (host, IP).
  - `hostName`: 1–158 characters.
  - `owner`: `1` = static (the UI always sends 1). Other values are probably dynamic/DNS-learned (inferred).
  - `addrType`: `1` = IPv4, `2` = IPv6 Global, `3` = IPv6 Link-Local.
  - `IPAddr`.
- **Add:** `StaticHostNameToAddrList action="set"` with one `<Entry><hostName/><owner>1</owner><addrType/><IPAddr/></Entry>` per non-empty IP field. The UI offers 8 IP fields; the documentation says up to 4.
- **Delete:** `action="delete"`, re-sending the **full entry objects** (every field from the GET) for every row whose `hostName` matches a selected host. All of that host's IPs go.
- **Gotchas:**
  - There is no edit: delete and re-add instead.
  - The table groups the IPs of one hostName into the columns IP Address 1–8.

---

### DHCP Relay — Global Settings
- **Menu:** Network Administration > DHCP Snooping and Relay > DHCP Relay > Global Settings (`dhcp_relays_table`, Id 919). The whole DHCP Relay folder is shown only in L3 mode (`Conditions.SystemMode.L3Mode`).
- **Read:** `GET API/dhcp_relays_table.htm` (form action `/Forms/API/dhcp_relays_table.htm`)
- **Form fields:**
  - `rlDhcpRelayEnable$scalar` ("DHCP Relay", settings dialog): `1` = Enabled, `2` = Disabled. The settings radio is mislabelled "Source IP Address" in JS.
  - Table VT `dhcpRelaysTableVT` / `rlDhcpRelayNextServerTable`:
    - `rlDhcpRelayNextServerIpAddr$repeat?N` (DHCP server IPv4)
    - `rlDhcpRelayNextServerRowStatus$repeat?N`
    - `dhcpRelaysTableVT$endRepeat?N`
  - Add: `rlDhcpRelayNextServerIpAddr$add`, `rlDhcpRelayNextServerRowStatus$add`, `dhcpRelaysTableVT$endAdd`.
- **Add server:** enable `rlDhcpRelayNextServerIpAddr$add=<ip>`, `rlDhcpRelayNextServerRowStatus$add=4` (createAndGo), `dhcpRelaysTableVT$endAdd=OK`. IPv4 is required; maxLength 17.
- **Delete:** for each selected key i (0-based), write row slot `i+1`: `rlDhcpRelayNextServerIpAddr$repeat?{i+1}=<ip>`, `rlDhcpRelayNextServerRowStatus$repeat?{i+1}=6` (destroy), `dhcpRelaysTableVT$endRepeat?{i+1}=OK`.
- **Settings save:** enable `rlDhcpRelayEnable$scalar` with value 1/2.
- **Gotchas:**
  - Delete writes into slots 1..k, not the rows' real indices. It overwrites the IP field in those slots, so the device keys off the IP value (inferred).
  - The server list is limited by the device (the documentation gives no number).

### DHCP Relay — Option 82
- **Menu:** … > DHCP Relay > Option 82 (`dhcp_relays`, Id 559)
- **Read/Write:** `API/dhcp_relays.htm` (action `/Forms/API/dhcp_relays.htm`)
- **Field:** `rlIpDhcpOpt82InsertionEnable` (no `$scalar` suffix) ("DHCP Option 82 Insertion"): `1` = Enabled, `2` = Disabled. Save enables only this input.
- JS calls the section `DhcpRelaySetting`; that name is never put on the wire.
- **Doc:** both DHCP snooping and relay can insert option 82.

### DHCP Relay — Interface Settings
- **Menu:** … > DHCP Relay > Interface Settings (`dhcp_int_settings`)
- **Read:** `GET API/dhcp_int_settings.htm`. The add dialog reads `API/dhcp_int_settings_a.htm`, which has the same relay inputs **enabled** and is posted to `/Forms/API/dhcp_int_settings_a.htm`.
- **Form fields:**
  - `rlDhcpRelayEnable$scalar`: read only, shown as context.
  - Single-row query VT `rlDhcpRelayInterfaceListTableVT$query`, with these bitmap octet strings (bit n = ifIndex n, MSB first):
    - `rlDhcpRelayInterfaceListIndex$query`
    - `rlDhcpRelayInterfaceListPortList$query`: ports and LAGs by ifIndex
    - `rlDhcpRelayInterfaceListVlanId1To1024$query`
    - `rlDhcpRelayInterfaceListVlanId1025To2048$query`
    - `rlDhcpRelayInterfaceListVlanId2049To3072$query`
    - `rlDhcpRelayInterfaceListVlanId3073To4094$query`
    - `rlDhcpRelayInterfaceListTableVT$endQuery`
  - Also `ipAddrTable` repeat (`ipAdEntAddr`, `ipAdEntIfIndex`, `rsIpAdEntUniqueStatus`), used to show each interface's IP address.
- **Add:**
  - Interface Type: Port (radio "0"), VLAN ("1"), LAG ("2"); the radio values are inferred from the indices.
  - Set the interface's bit in the right bitmap: the port/LAG ifIndex in PortList, or the VLAN id in the VLAN block (offset by 1024/2048/3072).
  - Enable that field plus `…$endQuery=OK`. If the bit is already set: "Entry already exists".
- **Delete:** recompute all 5 bitmaps with the selected bits cleared. Enable `rlDhcpRelayInterfaceListIndex$query`, all 5 bitmaps, and `$endQuery=OK`.
- **Row keys in the table:** VLAN rows use the key ifIndex `100000+vid-1+1`, i.e. `99999+vid`.
- **Gotchas:**
  - The whole interface set is one read-modify-write of bitmaps; there are no per-row entries.
  - Bug: in Remove for VLANs 3073–4094, the cleared bits go into `dhcp_int_settings.vlanId3073to4094Res` and not the local variable, so that bitmap comes out shortened or corrupted.
  - The JS uses helpers `octetToBitsAsChars` / `bitsAsCharsToOctet` for the octet encoding (format defined in globalFunctions.js).

---

### DHCP Server — Properties
- **Menu:** Network Administration > DHCP Server > DHCP Server Properties (`DHCPServerProperties`)
- **Read:** `GET wcd?{DHCPSrvGlobalSetting}`
- **Write:** `POST wcd?{DHCPSrvGlobalSetting}` with `<DHCPSrvGlobalSetting action="set"><enbl>1|2</enbl></DHCPSrvGlobalSetting>`
- **Field:** `enbl` ("DHCP Server Status" checkbox): `1` = Enabled, `2` = Disabled.

### DHCP Server — Network Pool
- **Menu:** … > DHCP Server > Network Pool (`NetworkPool`)
- **Read:** `GET wcd?{DHCPSrvNetworkPoolList}`; edit reads `wcd?{DHCPSrvNetworkPoolList&poolName=<name>}`.
- **Entry** (`<Entry>`, Pkey `poolName`):
  - `poolName`: ≤32 characters, required.
  - `subnetMask`: dotted mask. The UI also accepts a prefix length (8–30 for auto-calculation) and converts it to a mask.
  - `loIPAddr` / `hiIPAddr` (Address Pool Start/End): auto-filled as subnet+1 … broadcast−1.
  - `leaseTime`: seconds. `4294967295` = Infinite. The UI takes days (doc: 0–49710; default 1 day) plus hours 0–23 plus minutes 0–59.
  - `nxtSrvIPAddr` (Next Server, siaddr)
  - `nxtSrvName` (option 66, ≤32)
  - `bootfileName` (option 67, ≤32)
  - `domainName` (option 15, ≤32)
  - `NetBIOSType` (option 46): `''` = None, `1` = Broadcast, `2` = Peer-to-Peer, `4` = Mixed, `8` = Hybrid. The doc calls Hybrid the default, but the UI preselects None on add.
  - Nested lists, each with a single entry:
    - `<RoutersList><RoutersEntry><routerIpAddr/></RoutersEntry></RoutersList>` (option 3)
    - `<TimeSrvList><TimeSrvEntry><timeSrvIpAddr/></TimeSrvEntry></TimeSrvList>` (option 4)
    - `<DNSSrvList><DNSSrvEntry><DNSSrvIpAddr/></DNSSrvEntry></DNSSrvList>` (option 6)
    - `<NetBIOSNameSrvList><NetBIOSNameSrvEntry><NetBIOSNameSrvIpAddr/></NetBIOSNameSrvEntry></NetBIOSNameSrvList>` (option 44)
  - Read-only: `totalAddrNum` and `freeAddrNum`. The table shows "Number of Leased Addresses" = total − free.
- **Add and Edit (same code):** `DHCPSrvNetworkPoolList action="set"` with the full `<Entry>` above.
- **Delete:** `action="delete"`, `<Entry><poolName/></Entry>`.
- **Gotchas:**
  - "Subnet IP Address" is not sent; the device infers the subnet from lo/hi + mask (inferred).
  - Empty option fields are sent as empty elements.
  - Only one router, DNS server, WINS server and SNTP server per pool is exposed, even though they are lists.

### DHCP Server — Static Hosts
- **Menu:** … > DHCP Server > Static Hosts (`static_hosts`)
- **Read:** `GET wcd?{DHCPSrvHostPoolList}`; edit reads `wcd?{DHCPSrvHostPoolList&poolName=…&IPAddr=…}`.
- **Entry** (`<Entry>`, Pkey `poolName, IPAddr`):
  - `poolName`: UI "Host Name", 1–32 characters.
  - `IPAddr`
  - `subnetMask`: Network Mask, or Prefix Length.
  - `clientIDType`: `1` = MAC Address, `2` = Client Identifier (hex, e.g. 01b60819681172).
  - `clientID`
  - `hostName`: UI "Client Name", 0–32 characters, no domain.
  - `nxtSrvIPAddr`, `nxtSrvName`, `bootfileName`, `domainName`
  - `NetBIOSType`: same enum as Network Pool.
  - The same nested `RoutersList` / `DNSSrvList` / `NetBIOSNameSrvList` / `TimeSrvList` as Network Pool.
  - Also read, never written: `community`, `NMSIPAddr`.
- **Add:** `DHCPSrvHostPoolList action="set"` with the full Entry.
- **Edit:** one POST with `<DHCPSrvHostPoolList action="delete"><Entry><poolName>X</poolName></Entry></DHCPSrvHostPoolList>` **followed by** `<DHCPSrvHostPoolList action="set">` and the full Entry. poolName cannot be edited.
- **Delete:** `action="delete"` with Entry keys `poolName, IPAddr` (generic Remove; inferred from the Pkey).

### DHCP Server — Address Binding
- **Menu:** … > DHCP Server > Address Binding (`address_binding`)
- **Read:** `GET wcd?{DHCPSrvBindingList}`
- **Fields:**
  - `IPAddr` (Pkey)
  - `clientIDType`
  - `clientID`: "Client Identifier/MAC Address".
  - `leaseExpiration`: a date/time, or Infinite.
  - `type`: `1` = Manual, `2` = Automatic, `3` = Dynamic. The doc only lists Static/Dynamic.
  - `state`: not displayed.
- **Write:** delete only: `DHCPSrvBindingList action="delete"`, `<Entry><IPAddr/></Entry>`.
- The delete checkbox is disabled on `Manual` rows (static hosts); delete those via Static Hosts instead.

### DHCP Server — Excluded Addresses
- **Menu:** … > DHCP Server > Excluded Addresses (`ExcludedAddresses`)
- **Read:** `GET wcd?{DHCPSrvExcludedNetworkList}`
- **Fields:** `poolName` (hidden; Pkey includes it), `loIPAddr` (Start), `hiIPAddr` (End). The client checks Start ≤ End.
- **Add:** `action="set"`, `<Entry><loIPAddr/><hiIPAddr/></Entry>`. No poolName is sent.
- **Delete:** `action="delete"`, `<Entry><poolName/><loIPAddr/><hiIPAddr/></Entry>`.

---

### DHCP Snooping — Global Settings (brief)
- **Menu:** Network Administration > DHCP Snooping and Relay > DHCP Snooping > Global Settings (`property_dhcp`)
- **Read/Write:** `API/property_dhcp.htm` (action `/Forms/API/property_dhcp.htm`)
- **Fields** (scalars, no `$scalar` suffix):
  - `rlIpDhcpSnoopEnable` (DHCP Snooping Status): 1/2 = Enabled/Disabled.
  - `rlIpDhcpOpt82RxOnUntrustedEnable` (Option 82 Passthrough): 1/2.
  - `rlIpDhcpSnoopVerifyMacAddress` (Verify MAC Address): 1/2.
  - `rlIpDhcpSnoopFileEnable` (Save Binding Database to File): 1/2.
  - `rlIpDhcpSnoopFileUpdateTime` (Save Binding Database Interval): seconds, doc range 600–86400. The form has this field, but the classic UI has no input for it.
- **Save:**
  - When enabling: enable and send the changed fields.
  - When disabling snooping: send only `rlIpDhcpSnoopEnable=2`; the other radios are disabled in the UI.

### UDP Relay (brief)
- **Menu:** Network Administration > Route Settings > IPv4 Route Settings > UDP Relay (`udp_relay_table`). In L2 mode the menu entry is replaced by a "change system mode" link (systemModeLink).
- **Read:** `GET API/udp_relay_table.htm`. The add dialog reads `API/udp_relay_table_a.htm?[ipAddrTableVT]Filter:rsIpAdEntOwner=1` (the switch's static IP interfaces).
- **Table VT** `Udp_relay_tab` / `rsUdpRelayTable`, columns:
  - `rsUdpRelaySrcIpInf$repeat?N`: source IP interface. `255.255.255.255` = All.
  - `rsUdpRelayDstPort$repeat?N`: 1–65535.
  - `rsUdpRelayDstIpAddr$repeat?N`
  - `rsUdpRelayStatus$repeat?N`
  - `Udp_relay_tab$endRepeat?N`
  
  Add-form only: `rsUdpRelayUserInfo`.
- **Add** (POST to `API/udp_relay_table_a.htm`): `rsUdpRelaySrcIpInf$add`, `rsUdpRelayDstPort$add`, `rsUdpRelayDstIpAddr$add`, `rsUdpRelayStatus$add=4`, `rsUdpRelayUserInfo$add=0`, `Udp_relay_tab$endAdd=OK`.
  - "Default Services" (the default choice) clones the `$add` group 6 times in one POST, with ports 37, 42, 49, 53, 137, 138. **The field names are repeated** in the body.
- **Delete:** per selected row i, write slot `i+1` with the 3 key fields + `rsUdpRelayStatus$repeat?{i+1}=6` + `Udp_relay_tab$endRepeat?{i+1}=OK`.

---

## Part B — Time synchronization, file management, save/reboot

### B.0 Form (API/*.htm, "Tags" pages) protocol, as used by these pages

- Read: `GET API/<page>.htm[?<query>]` → RomPager HTML whose hidden `<input>`s carry the values. The classic UI serializes every input (name → value).
  - Edit-page query (views.js `tagsBasicTableEditDF`): `?Query:<pkeyField>=<value>[@<pkey2>=<v2>]`. The field name is the Pkey with its `$...` suffix removed, e.g. `show_authen_table_e.htm?Query:rlSntpAuthenticationKeyID=5`. If there are several key sections, each is prefixed with `[<section>]`.
- Write: `POST API/<page>.htm`, `application/x-www-form-urlencoded`, built from `$("form").serialize()` with `+`→`%2B`. **Only enabled inputs get sent.** The page JS removes `disabled` from just the inputs it sets, and `restoreUrl` and `errorCollector` are always sent. The literal POST URL is the page's Get/GetEdit/GetAdd URI, including any unsubstituted `?Query:(&query)` suffix (the server presumably ignores it; inferred).
  - Response: the same form is returned. If it holds a hidden `mibError` input with a value, the write failed. The text is after `Diag=`, with HTML stripped.
- Row conventions (RowStatus values follow SNMP; their meaning is inferred):
  - Add: set the `<col>$add` (or `$Add`) inputs, set `<RowStatus>$add=4` (createAndGo), then set `<vt>$endAdd=OK`.
  - Edit: set the `<col>$query` inputs, then set `<vt>$endQuery=OK`.
  - Delete: for each selected row i (1-based, numbered within the selection rather than by row position), set `<pkey>$repeat?i=<key>`, `<RowStatus>$repeat?i=6` (destroy) and `<vt>$endRepeat?i=OK`.
  - Scalars: `<mib>$scalar=<v>`.
- "Apply to: Running and Startup Configuration" select (`slctSave`, 0 = Running only (default), 1 = Running+Startup; stored in the `SaveMode` cookie). When it is 1, every successful save is followed by the Save-Config POST in B.9.
- The wcd writes in this part go through `ServerManager.wcdPost`. It uses a hard-coded **3000 ms ajax timeout**, and an error triggers `logoff()` unless the page defines `OnPostError`.

---

### B.1 Clock Source
- Menu: Switch Management > Time Synchronization > Clock Source (`time_synch_global`)
- Read: `GET API/time_synch_global.htm` (form action `/Forms/config/time_synch_global.htm`)
- Write: POST the same URL with `rlTimeSyncMethod$scalar=<v>`.
- Fields:
  - `rlTimeSyncMethod$scalar` (section AutoUpdateScalar): 1 = Local, 2 = SNTP. Default Local (docs: "the default is manual (local)").

### B.2 Local Time Settings (date/time, time zone, DST)
- Menu: Switch Management > Time Synchronization > Local Time Settings (`general_sntp_settings`)
- Read: `GET API/general_sntp_settings.htm` (action `/Forms/config/general_sntp_settings.htm`). It contains:
  - the scalar `rndTimeSyncManagedDateTime$scalar`
  - the time-zone VT `rlTimeZoneVT`, with query-row inputs `rlTimeZoneIndex$query`, `rlTimeZoneTimeZoneOffset$query`, `rlTimeZoneTimeZoneCode$query`, `rlTimeZoneDaylightSavingTimeMode$query`, `rlTimeZoneDaylightSavingTimeStart$query`, `rlTimeZoneDaylightSavingTimeEnd$query`, `rlTimeZoneDaylightSavingTimeCode$query`, `rlTimeZoneDaylightSavingTimeOffset$query` and `rlTimeZoneVT$endQuery`.
  - The page key is `rlTimeZoneIndex$query`. In the template, `rlTimeZoneIndex$query`, `rlTimeZoneTimeZoneCode$query`, `rlTimeZoneDaylightSavingTimeCode$query`, `rlTimeZoneVT$query` and `$endQuery` are **not** disabled, so they are always posted.
- Write: one POST of the same form. Which inputs Save enables and sets:
  - `rndTimeSyncManagedDateTime$scalar` = `DDMMYYhhmmss`. The read side parses day = [0,2), month = [2,4), yy = [4,6), then hhmmss. Save builds it from the datepicker text split on "/" as part0+part1+yy plus hh mm ss.
  - `rlTimeZoneTimeZoneOffset$query` = one of `-12:00 -11:00 -10:00 -9:00 -8:00 -7:00 -6:00 -5:00 -4:00 -3:30 -3:00 -2:00 -1:00 00:00 01:00 02:00 03:00 03:30 04:00 04:30 05:00 05:30 05:45 06:00 06:30 07:00 08:00 09:00 09:30 10:00 11:00 12:00 13:00`. Labels are "UTC -12:00" … "UTC" … "UTC +13:00".
  - `rlTimeZoneTimeZoneCode$query` = "UTC" when the offset ≠ 00:00, otherwise set to `undefined` (it stays enabled). This is an odd quirk of the classic UI.
  - `rlTimeZoneDaylightSavingTimeMode$query`: **1 = recurring**, **2 = non-recurring (specific dates)**, **3 = none**.
  - When the mode is not None, these are also enabled:
    - `rlTimeZoneDaylightSavingTimeOffset$query`: minutes, integer 1–1440 (UI text box `slcTimeSetOffset`, maxLength 4).
    - `rlTimeZoneDaylightSavingTimeStart$query` and `rlTimeZoneDaylightSavingTimeEnd$query`: **hex-encoded ASCII** strings. Each char becomes 2 hex digits (`myStr2Octet`); the read side decodes with `Octet2StrReturn`.
      - Recurring (mode 1): ASCII `"WW DD MM hh:mm"`.
        - WW: 00 = First, 02, 03, 04, 06 = Last. The UI offers First/2/3/4/Last; values 01 and 05 are read as First and Last.
        - DD: day of week, 01 = Sun … 07 = Sat.
        - MM: 01–12.
      - Non-recurring (mode 2): ASCII `"MM DD YY hh:mm"`.
        - The read side takes month = [0,2), day = [3,5), yy = [6,8), time = [9,14).
        - Save builds `arr[1]+" "+arr[0]+" "+yy` from the date-picker text (its order is inferred).
- UI DST choices: None / USA / Europe / Other. Other has a sub-choice "Daylight Saving Recurrence Pattern": Enabled (1) → mode 1, Disabled (2) → mode 2.
  - USA = mode 1, start `02 01 03 02:00`, end `01 01 11 02:00` (2nd Sun Mar 02:00 → 1st Sun Nov 02:00).
  - Europe = mode 1, start `06 01 03 01:00`, end `06 01 10 01:00` (last Sun Mar 01:00 → last Sun Oct 01:00).
  - On read, USA is recognised when start ∈ {`02 01 03 02:00`, `01 01 03 02:00`} and end ∈ {`01 01 11 02:00`, `00 01 11 02:00`}. Europe is recognised when start ∈ {`06 01 03 01:00`, `05 01 03 01:00`} and end ∈ {`06 01 10 01:00`, `05 01 10 01:00`}. Mode 3 means None; anything else means Other.
- Validation:
  - Year 2000–2097.
  - Times are H:i (DST) or H:i:s (local time).
  - Non-recurring: From < To.
- Docs: the manual clock is **not persistent across reboots**. The manual time is used when SNTP is unavailable.
- Gotcha: date, time zone and DST all go out in one POST. DST start and end are always sent as hex.

### B.3 SNTP Global Settings
- Menu: Switch Management > Time Synchronization > SNTP Global Settings (`general_sntp_set`)
- Read: `GET API/general_sntp_set.htm` (action `/Forms/config/general_sntp_set.htm`)
- Write: POST with all five scalars enabled.
- Fields (section AutoUpdateScalar):
  - `rlSntpNtpConfigPollInterval$scalar`: poll interval in seconds, integer **60–86400** (maxLength 5 in the UI, although 86400 needs 5 digits, which is fine).
  - `rlSntpBroadcastAdminState$scalar`: receive broadcast server updates. 1 = Enabled, 2 = Disabled.
  - `rlSntpAnycastAdminState$scalar`: receive anycast server updates. 1/2.
  - `rlSntpUnicastAdminState$scalar`: receive unicast server updates. 1/2.
  - `rlSntpUnicastPollState$scalar`: poll unicast requests. 1/2.
- Defaults are not stated in the docs or the JS (not found).

### B.4 SNTP Authentication (key table + global enable)
- Menu: Switch Management > Time Synchronization > SNTP Authentication (`show_authen_table`)
- Read table: `GET API/show_authen_table.htm`.
  - VT `sntp_authentication_Table` / `rlSntpConfigAuthenticationTable`.
  - Repeat rows: `rlSntpAuthenticationKeyID$repeat?N`, `rlSntpAuthenticationKeyValue$repeat?N`, `rlSntpAuthenticationKeyState$repeat?N`, `rlSntpAuthenticationRowStatus$repeat?N`, `sntp_authentication_Table$endRepeat?N`.
  - Scalar `rlSntpAuthenticationState$scalar`.
- Settings (global enable): the POST goes to `API/show_authen_table.htm` with `rlSntpAuthenticationState$scalar` = 1 (Enabled) or 2 (Disabled).
  - **Bug**: classic `SaveSettings` reads `$("input[name='rdoSNTPAuthenStatus']").val()` without `:checked`, so it always sends the first radio's value (1). A new UI must send the selected value.
- Add: `GET/POST API/show_authen_table_a.htm` with:
  - `rlSntpAuthenticationKeyID$add`: integer **1–4294967295**.
  - `rlSntpAuthenticationKeyValue$add`: string **1–8 chars**.
  - `rlSntpAuthenticationKeyState$add`: Trusted Key, 1 = Enabled, 2 = Disabled (default Disabled).
  - `rlSntpAuthenticationRowStatus$add=4`.
  - `sntp_authentication_table$endAdd=OK`.
- Edit: `GET API/show_authen_table_e.htm?Query:rlSntpAuthenticationKeyID=<id>`, then POST setting `rlSntpAuthenticationKeyValue$query` and `rlSntpAuthenticationKeyState$query`.
  - The key ID is read-only.
  - The `$query` key inputs are not disabled in the template.
  - The classic code also sets `rlSntpAuthenticationRowStatus$add=1` (that input doesn't exist on the _e form, so it is ignored) and `sntp_authentication_table$endQuery=OK`.
- Delete: POST `API/show_authen_table.htm` with `rlSntpAuthenticationKeyID$repeat?i=<id>`, `rlSntpAuthenticationRowStatus$repeat?i=6` and `sntp_authentication_table$endRepeat?i=OK`.
  - **Gotcha**: the JS uses a lowercase-t `sntp_authentication_table$endRepeat?i`, but the template's repeat end field is `sntp_authentication_Table$endRepeat`. Use the template's casing (inferred).
- Columns: Encryption Key ID, Authentication Key (shown in clear), Trusted Key (1 = Enabled, 2 = Disabled).

### B.5 SNTP Servers
- Menu: Switch Management > Time Synchronization > SNTP Servers (`sntp_servers`)
- Read: `GET API/sntp_servers.htm` (action `/Forms/API/sntp_servers.htm`). It contains:
  - Scalars: `rlSntpNtpConfigSyncSrvAddr` (the server time was last accepted from, i.e. "Primary"), `rlTimeZone` ("hh:mm", used to shift the last-response display), `rlDaylightSavingTimeOffset`, `rlDaylightSavingTimeStart`, `rlDaylightSavingTimeEnd`.
  - VT `sntp_servers_table`, repeat N:
    - `rlSntpServerInetAddress$repeat?N`: server address (key).
    - `rlSntpServerInetPolled$repeat?N`: 1 = Enabled, 2 = Disabled.
    - `rlSntpAuthenticationKeyID$scalar?N`
    - `rlSntpServerInetKeyIdentifier$repeat?N`: encryption key ID, 0 = none.
    - `rlSntpServerInetStatus$repeat?N`: 1 = Unknown, 2 = In Process, 3 = Up, 4 = Down.
    - `rlSntpServerInetLastResp$repeat?N`: 16 hex digits, an NTP timestamp. The first 8 hex digits are seconds since 1900; subtract 2208988800 to get Unix time. When the status is Up, the UI adds `rlTimeZone`.
    - `rlSntpServerInetOffset$repeat?N`: hex signed NTP 32.32. The UI shows ms using 4 octets of seconds.
    - `rlSntpServerInetDelay$repeat?N`: the same, using 2 octets.
    - `rlSntpServerInetRowStatus$repeat?N`
    - `sntp_servers_table$endRepeat?N`
  - Preference column: "Primary" if the address == `rlSntpNtpConfigSyncSrvAddr`, otherwise "Secondary".
- Add: `GET API/sntp_servers_a.htm`. It provides the select `rlSntpAuthenticationKeyID$select` (the defined key IDs) and the IPv6 interface list (`IPv6Interfaces`, `ipv6InterfaceIfIndex$repeat1`) for link-local addresses. POST `API/sntp_servers_a.htm` with:
  - `rlSntpServerInetAddress$add`: IPv4 or IPv6. Link-local IPv6 needs interface scoping via interfaceManager. The UI validates IP format only; whether hostnames are accepted is unknown.
  - `rlSntpServerInetPolled$select`: a `<select>`. The template options are VALUE="Enable" (item 1) and "Disable" (item 2, selected by default). JS sets `.val(1|2)`. The rendered option values are probably 1/2 (inferred), so verify against a live GET.
  - `rlSntpServerInetKeyIdentifier$add`: 0 = None, or a key ID.
  - `rlSntpServerInetRowStatus$add="0"`. **Quirk**: classic sends 0, not 4.
  - `sntp_servers_table$endAdd`: not disabled in the template, so it is always sent.
- Edit: `GET API/sntp_servers_e.htm?Query:rlSntpServerInetAddress=<addr>`. The _e template's RpUrl/action are `/API/sntp_servers.htm` and `/Forms/API/sntp_servers.htm`. POST with:
  - `rlSntpServerInetAddress$query2=<addr>`
  - `rlSntpServerInetPolled$query=1|2`
  - `rlSntpServerInetKeyIdentifier$query=<id|0>`
  - `rlSntpServerInetRowStatus$query=1`
  - `sntp_servers_table$endQuery` (not disabled in the template)
- Delete: POST `API/sntp_servers.htm` with `rlSntpServerInetAddress$repeat?i=<addr>`, `rlSntpServerInetRowStatus$repeat?i=6` and `sntp_servers_table$endRepeat?i=OK`.

### B.6 SNTP Interface Settings (anycast/broadcast receive interfaces)
- Menu: Switch Management > Time Synchronization > SNTP Interface Settings (`general_sntp_m`)
- Read: `GET API/general_sntp_m.htm`. VT `sntp_broadcast_table`, repeat N:
  - `rlSntpBroadcastIfIndex$repeat?N` (ifIndex; shown as an interface name)
  - `rlPhdPortsModuleNumber$repeat?N`
  - `rlPhdPortsIfIndexName$repeat?N`
  - `rlSntpBroadcastIfAdminState$repeat?N` (Receive Servers Updates, 1 = enabled)
  - `rlSntpBroadcastRowStatus$repeat?N`
  - `sntp_broadcast_table$endRepeat?N`
- Add: POST `API/general_sntp_a.htm` (note the **capital `$Add`** suffix) with:
  - `rlSntpBroadcastIfIndex$Add=<ifIndex>`. Interface type is Port, VLAN or LAG.
  - `rlSntpBroadcastIfAdminState$Add=1`
  - `rlSntpBroadcastMode$Add=4`
  - `rlSntpBroadcastPolled$Add=1`
  - `rlSntpBroadcastRowStatus$Add=4`
  - Classic never enables `sntp_broadcast_table$endAdd`. A new UI should probably send `=OK` (inferred).
- Delete: `rlSntpBroadcastIfIndex$repeat?i`, `rlSntpBroadcastRowStatus$repeat?i=6`, `sntp_broadcast_table$endRepeat?i=OK`.
- There is no edit page (buttons: add, remove).

---

### B.7 Update Firmware / Configuration (download to switch)
- Menu: Switch Management > File Update and Backup > Update Firmware / Configuration (`update_firmware`)
- Read:
  - `wcd?{SystemGlobalSetting}` → `firmwareVersion`, `bootVersion` (shown as Current Firmware Version and Current Boot Code Version).
  - `wcd?{LoadStatus}` → progress (see B.12).
- UI fields:
  - File Type `rdoFileType`: 1 = Firmware Download (default), 2 = Configuration Download.
  - Update Method `rdoBackupMethod`: 1 = HTTP (default), 2 = TFTP, 3 = USB, 4 = Flash. Flash forces Configuration.
  - Server IP (TFTP only). IPv4/IPv6 selector; IPv6 can be Link Local or Global.
  - Source File Name: 1–64 chars (TFTP/USB/Flash).
  - Destination File Type (firmware): 1 = Software Image → code **8**, 2 = Boot Code → code **9**.
  - Destination File Name (config): 1 = Running Configuration → code **2**, 2 = Startup Configuration → code **3**, or New File Name (text, 1–64 chars) → code **1** with `destFileName`.
- HTTP method (browser file upload, not wcd):
  - `POST /http_uploadfile?action=<destCode>&filename=<local file path value>`, `multipart/form-data`, file field name **`srcFileName`**.
  - The form lives in an iframe loading `API/HTTP.htm`.
  - destCode is 8 = image, 9 = boot, 2 = running, 3 = startup, 1 = new file.
  - After that, UploadBackupService polls `wcd?{LoadStatus}` every 1 s and gives up after a **60 s** watchdog if no status appears (`http_clearTimeout`).
- TFTP method: `POST wcd?{LoadStatus}` (the page's SetDataURI) with body
  `<DeviceConfiguration><FileCopy action="set"><srcLocation>3</srcLocation><srcFileType>1</srcFileType><srcIPAddr>IP</srcIPAddr><srcFileName>NAME</srcFileName><destLocation>1</destLocation><destFileType>CODE</destFileType>[<destFileName>N</destFileName>]</FileCopy></DeviceConfiguration>`
  - `destFileName` is present only for code 1, since `undefined` is skipped.
- USB method: `FileCopy` with srcLocation 1, srcFileType **13**, srcFileName, destLocation 1, destFileType CODE[, destFileName].
- Flash method: `FileCopy` with srcLocation 1, srcFileType 1, srcFileName, destLocation 1, destFileType 2|3|1[, destFileName].
- Location codes (from usage; meaning inferred): 1 = local flash/device, 3 = TFTP server.
- File-type codes (inferred):
  - 1 = named file
  - 2 = running-config
  - 3 = startup-config
  - 8 = software image
  - 9 = boot code
  - 13 = USB-sourced file (appears only as srcFileType for USB and as destFileType for the USB backup)
- Gotchas:
  - Destination Startup (3) asks: "Downloading configuration erases the Startup Configuration file and reset the device."
  - On completion (`copyStatusType=5`) with update method 1 (TFTP), 3 (HTTP), 5 (USB) or 7 (Flash) and `destinationFileType==3`, the UI posts `<LoadStatus action="delete"><unitID>0</unitID></LoadStatus><Reload action="set"><unitID>0</unitID></Reload>` to `wcd?{LoadStatus}`, i.e. a **reboot**.
  - Otherwise it posts `<LoadStatus action="delete"><unitID>0</unitID></LoadStatus>` to clear the status.
  - Docs: an image overwrites the **non-active** image. Use Active Firmware Image (B.10) and then reboot.

### B.8 Backup Files (upload from switch)
- Menu: Switch Management > File Update and Backup > Backup Files (`backup_files`)
- Read: `wcd?{SystemGlobalSetting}` (firmwareVersion) and `wcd?{LoadStatus}`.
- UI fields:
  - Transfer File Name `rdoTransferFileName`: 1 = Running Configuration (default), 2 = Startup Configuration, 3 = Software Image.
  - Backup Method: 1 = HTTP, 2 = TFTP, 3 = USB, 4 = Flash. USB and Flash force Running.
  - Server IP (TFTP).
  - Destination File Name: 1–64 chars.
- HTTP: `GET /Http_download?action=<rdoTransferFileName+1>` (2 = running, 3 = startup, 4 = image). The iframe navigates there, so the browser download is the file. The UI then polls LoadStatus with the 60 s watchdog.
- TFTP: `POST wcd?{LoadStatus}` with `<FileCopy action="set"><srcLocation>1</srcLocation><srcFileType>2|3|8</srcFileType><destLocation>3</destLocation><destIPAddr>IP</destIPAddr><destFileType>1</destFileType><destFileName>NAME</destFileName></FileCopy>`.
- USB: `<FileCopy action="set"><srcLocation>1</srcLocation><srcFileType>2|3</srcFileType><destLocation>1</destLocation><destFileType>13</destFileType><destFileName>NAME</destFileName></FileCopy>`.
- Flash (copy to a named file on flash): same, but `destFileType` is `1`.
- srcFileType mapping (verified): 1→2 (running), 2→3 (startup), 3→8 (image). The image option exists only for TFTP and HTTP.

### B.9 Save configuration (running → startup) and reboot (masthead)
- Save: masthead menu item "Save to Startup Configuration", `saveSettings()`.
  - `POST wcd?{GlobalActions}` with `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><GlobalActions action="set"><copyCnfRun2Start></copyCnfRun2Start></GlobalActions></DeviceConfiguration>`
  - Success means `ActionStatus/statusCode == 0`.
- Unsaved-changes indicator: `GET API/startup_changes.htm` → hidden input `rlRunningCDBequalToStartupCDB` (1 = running equals startup, i.e. saved). The poller's `device/noStamp.xml` also carries it, next to `rlSyslogAlarmFlag`, `rlEmWebMaxIdleTimeout` and `rlEmWebMaxHttpsIdleTimeout`.
- Reboot: masthead "Reboot Switch", `confirmReboot()`.
  - It first reads `startup_changes.htm`. If the value is not '1', it warns "You haven't saved your changes".
  - Then it posts `POST wcd?{Reload}` with `<DeviceConfiguration><Reload action="set"><dummy></dummy></Reload></DeviceConfiguration>`.
  - Elsewhere the UI uses `<Reload action="set"><unitID>0</unitID></Reload>`, which also works.
  - Expect the POST to time out or fail as the switch goes down.
- Logout: `GET System.xml?action=logout`, then the UI redirects to `config/log_off_page.htm`.
- Session keepalive: `GET device/authenticate_user.xml` every 20 s (`Polling.authInterval`, `AUTH_INTERVAL` default 20000).

### B.10 Active Firmware Image
- Menu: Switch Management > File Update and Backup > Active Firmware Image (`ActiveFirmwareImage`)
- Read: `GET wcd?{ImageUnitList}`. Entry fields:
  - `unitID`
  - `unitIDType`
  - `currentImage`: 1|2
  - `nextBootImage`: 1|2
  - `image1Version`, `image2Version` ("not available" if empty)
  - `image1Description`, `image2Description`
- Write: `POST wcd?{ImageUnitList}` with `<ImageUnitList action="set"><Entry><nextBootImage>1|2</nextBootImage></Entry></ImageUnitList>`. Classic sends no unitID.
- UI: Current Firmware Version (the version of `currentImage`); Apply Version After Reboot (a dropdown of available image versions, value 1|2). The change takes effect only after a reboot (B.9).

### B.11 Auto Update (DHCP option 67 / USB)
- Menu: Switch Management > File Update and Backup > Auto-Update (`file_auto_update`)
- Read: `GET API/file_auto_update.htm`. All 4 inputs are **not disabled**, so they are always posted.
- Write: POST the same URL. All fields are 1 = Enabled, 2 = Disabled:
  - `rlDhcpClOption67Enable$scalar`: Configuration Auto-Configure. Downloads config into running; by default only if startup is empty.
  - `rlDhcpClAutoUpdateEnabled$scalar`: Firmware Auto-Update (image).
  - `rlDhcpClAutoConfigForce$scalar`: Force Configuration Download at Next Startup (even if startup is not empty).
  - `rlDhcpClAutoConfigAutoSave$scalar`: Auto Copy Running→Startup After Download.
- Docs: this requires a DHCP IP interface in startup, plus DHCP and TFTP servers prepared.

### B.12 LoadStatus (copy progress) — shared by B.7 and B.8
- `GET wcd?{LoadStatus}` → `LoadStatus` fields:
  - `copyStatusType`:
    - 1, 2: in progress
    - 3, 4: failed (`errorMessage`)
    - 5: success
    - absent: no operation
  - `bytesTransfered` (sic)
  - `destinationFileType`
  - `errorMessage`
  - `unitID` (inferred)
- Polling: classic polls every 1000 ms while in progress.
- Clear when finished: `POST wcd?{LoadStatus}` with `<LoadStatus action="delete"><unitID>0</unitID></LoadStatus>`.
- UploadBackupService's internal DataType codes:
  - 1: TFTP download
  - 2: TFTP upload
  - 3: HTTP download
  - 4: HTTP upload
  - 5: USB download
  - 6: USB backup
  - 7: Flash download
  - 8: Flash backup
- On success with a startup destination after a download type (1/3/5/7), the UI reboots the switch (see B.7).

### B.13 Restore Factory Defaults
- Menu: Switch Management > File Update and Backup > Restore Factory Defaults (`restore_factory_defaults`)
- Read: `GET API/restore_factory_defaults.htm` (large form). Relevant contents:
  - The copy table query row: `rlcopyTableVT$query`, `rlCopyIndex$query`, `rlCopyApplicationId$query`, `rlCopyDestinationLocation$query`, `rlCopyDestinationFileType$query`, `rlCopyOperationState$query`, `rlCopyBytesTransferred$query`, `rlCopyHistoryIndex$query`. JS reads `rlCopyIndex$query`; ==1 means "Another file transfer is in process", so the action is refused.
  - `rlCopyOptionsTable`, `rlFileTable` (`rlFileName$repeat`), `rlPhdModuleTable`, `rlCopyTable` `$Add` inputs, `rlCopyHistoryTable`, scalar `rlCopyFreeHistoryIndex`.
  - Scalar **`rndAction`**: template `value=20`, disabled.
- Write: POST `API/restore_factory_defaults.htm` with **`rndAction=27`**. This is the only field the classic UI enables.
  - Effect (docs and UI text): erases startup-config and reapplies factory defaults, which take effect after a reset.
  - The UI warns that IP will become 192.168.2.1/255.255.255.0 and user/password admin/admin.
  - Whether the switch reboots automatically is not stated (inferred: it may require B.9 reboot).
- UI: checkbox "Restore Switch Configuration" (must be checked), then a confirm dialog.
- Gotcha: classic `confirmYes` calls `buttonManger.handleBtnClick(..., system_mode, "save")` (a copy-paste of the wrong node), then posts this page.

---

## Part C — Management Security (+ Login History)

Conventions used below (from serverManager.js / views.js):
- **API form pages** ("Tags" pages): `GET API/<page>.htm[?filter/query]` returns RomPager HTML; every `<input>` is a field. POST = `$("form").serialize()` of the same form (with `+`→`%2B`) to `API/<SetDataURI>`. **Only enabled inputs are sent**: almost all inputs are rendered `disabled`; the page script `removeAttr("disabled")` on exactly the fields it wants to write. `restoreUrl`/`errorCollector` are always sent (unless disabled). Errors come back in hidden `mibError` input(s) (text after `Diag=`).
- Repeat rows: GET field names are `<col>$repeat?N` (N = 1-based row index); write a row by enabling `<col>$repeat?N` + `<Table>$endRepeat?N`=`OK`. Add: `<col>$add` + `<Table>$endAdd`=`OK`. Edit of a queried row: `<col>$query` (+ `<Table>$endQuery`).
- Tags edit/query URL: `<page>.htm?Query:<col>=<val>@<col2>=<val2>` (column names without `$...`; if >1 section: `[Section]Query:...`). Filters: `<page>.htm?Filter:(expr)` or `?[VTName]Filter:expr`.
- RowStatus values seen: `1`=active (modify), `4`=createAndGo, `6`=destroy.
- **wcd** pages: `GET wcd?{Section}{Section&key=val}`; POST `wcd?{...}` body `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><Section action="set|delete">…</Section></DeviceConfiguration>`. `&query` in GetEditDataURI is replaced by `&<pkey>=<encodeURIComponent(val)>`. JS `null` values serialize as an empty element `<f></f>` (json2xml: typeof null=='object' → empty inner) (inferred from code). wcdPost has a 3000 ms ajax timeout.
- Password writes on AAA forms: new cleartext is sent prefixed with `$` (e.g. `$secret`) (device presumably treats `$`-prefix as plaintext-to-hash; unprefixed = already-encrypted value) (inferred).

### Session / exec timeout & service enable — findings for this scope
- **No page in Management Security reads or writes any web/HTTP session idle timeout, telnet/ssh/console exec-timeout, or HTTP/HTTPS/Telnet/SSH service enable/port.** Grepped all API/*.htm, js/**, tpl, device, polling: the only matches are `rlEmWebMaxIdleTimeout` and `rlEmWebMaxHttpsIdleTimeout` (read-only display text in `device/noStamp.xml`, consumed by ApplicationManager.checkLogoutTimeout; covered by parent).
- Management "service" appears only as an **access-profile rule filter** (`rlMngInfListInetService`: 0 All, 1 Telnet, 2 SNMP, 3 HTTP, 4 HTTPS, 5 SSH) and as **authentication line types** (`rlAAALinePortType`/`rlAAAServiceType`), never as enable/disable or port.
- Only "timeouts" in scope: TACACS+/RADIUS `timeoutForReply` (server reply timeout, 1–30 s).

---

### 1. Global Password Management
- Menu: Switch Management > Management Security > Global Password Management (page obj `PasswordManagement`, SystemName `pswrd_mgmt`, Tags/Scalar).
- Read: `GET API/pswrd_mgmt.htm`. Write: `POST API/pswrd_mgmt.htm` (form ACTION `/Forms/api/pswrd_mgmt.htm`).
- Form fields (all scalar, **not** `disabled` in template → all are posted every save):

| field | UI label | values / range | notes |
|---|---|---|---|
| `rlAAAPasswordComplexityEnabled` | Enable Strong Passwords (checkbox) | `1`=enabled, `2`=disabled | |
| `rlAAAPasswordComplexityMinCharClasses` | Number Of Classes | 0–4 (dropdown) | only written when complexity enabled; classes = upper/lower/numeric/special (doc: numeric, alphabetic, special) |
| `rlAAAPasswordComplexityCharRepeat` | Repeated Characters (checkbox+dropdown) | 1–16; `0` = disabled/unchecked | |
| `rlAAAMinPasswordLength` | Password Minimum Length (checkbox+text) | 8–64; `0` = unchecked | |
| `rlAAAMaxNumLogAttmpts$hidden` | Enable Login Attempts (checkbox+dropdown) | 1–5; `0` = disabled | lockout after N failures |
| `rlAAAPasswordGlobalAgingTime$input` | Global Password Aging (days) | 1–365; `0` = disabled | doc: only effective when clock source is SNTP; warning 10 days before expiry |
| `rlAAAPasswordHistSize` | Consecutive Passwords Before Reuse | 1–10; `0` = disabled | |
| `rlAAAPasswordHistHoldTime$input` | Password History Hold-Time (days) | 1–365; `0` = disabled | |

- Save logic: each optional control → value if its checkbox is checked, else `0`. Complexity: checkbox writes 1/2; MinCharClasses only enabled when complexity on.
- Defaults: not stated in doc (doc: "feature is optional"); (inferred) all 0/disabled, complexity disabled.

### 2. Line Password for CLI
- Menu: Switch Management > Management Security > Line Password for CLI (`line_password`, Tags MultiScalar).
- Read: `GET API/sec_line_password_TIC.htm`. Write: `POST API/sec_line_password_TIC.htm` (template ACTION `/Forms/API/sec_line_password.htm`).
- Table `LineTable` (lead `rlAAALineTable`) repeat cols: `rlAAALinePortType`, `rlAAAIfIndex`, `rlAAAServiceType`, `rlAAALinePassword`, `rlAAALineLockedState` (0=Locked, 1=Usable/"UnLocked"), `rlAAALinePasswordExpieryDate` (blank → "Permanent"), `rlAAALockedLineStatus` (reactivate flag); each `$repeat?N` (+ `$default`). Scalar `rlAAAMinPasswordLength$Scalar` (disabled, read-only).
- Rows (fixed indices assumed by script): **?1 = Telnet** (PortType 1, ServiceType 1), **?3 = SSH/Secure Telnet** (PortType 1, ServiceType 3), **?5 = Console** (PortType 2, ServiceType 0). IfIndex always 0. (Rows 2/4 presumably HTTP=svc 2 / HTTPS=svc 4 lines — inferred from select_Authentication's port/service map.)
- Write per changed line N: enable+set `rlAAALinePassword$repeat?N`=`$<pw>`, `rlAAAIfIndex$repeat?N`=0, `rlAAALinePortType$repeat?N`, `rlAAAServiceType$repeat?N`, `rlAAALockedLineStatus$repeat?N`=`1` (reactivate checked) / `0`, `LineTable$endRepeat?N`=`OK`. A line is written only if its password text differs from the GET value.
- UI fields per line: Password (0–80 chars), Confirm (must match), Expiry Date (ro), Lockout Status (ro), "Reactivate Locked Line" checkbox (disabled+checked when already reactivated).
- Gotchas:
  - Script also sets `LockedLineTable$endRepeat?N` and reads `tmpl.rlAAALockedLineTable[...]` — **no such table in the form** (`rlAAALockedLineStatus` lives inside `LineTable`); those selectors are no-ops / the reactivate value is read from a non-existent section (bug).
  - **Expiry-date index bug**: Information uses rows [4]/[0]/[2] (console/telnet/ssh) for passwords, but expiry uses rows [0]/[1]/[2] → console shows Telnet row's expiry, telnet shows row 2's, etc.
  - Reactivate alone (no password change) is never sent, since the block is gated on password change.
  - Empty password → confirm dialog: "Not defining a password blocks access to <method> … next method in the Authentication Profile".

### 3. Enable Password for CLI
- Menu: Switch Management > Management Security > Enable Password for CLI (`Enable_Password`, SystemName `sec_password`).
- Read: `GET API/sec_password.htm`. Write: `POST API/sec_password.htm` (ACTION `/Forms/api/sec_password.htm`).
- Fields: scalars `rlAAASystemPasswordlevel1$scalar`, `rlAAASystemPasswordlevel15$scalar` (current encrypted pw), `rlAAASystemPasswordlevel1$bnd`, `rlAAAMinPasswordLength$Scalar` (ro), `rlAAAUnlockSystemPassword$scalar`; table `rlAAASysPassStatTable`: `rlAAASysPassStatLevel$repeat?N` (1/15), `rlAAASysPassStatPasswordExpieryDate$repeat?N`, `rlAAASysPassStatLockedState$repeat?N` (0=Locked, 1=Useable).
- UI: Enable Access Level radio `1` "1 (Read-Only)" (default selected) / `15` "15 (Read-Write)"; Password (maxlen 159, hint `(min-159)`, min = `rlAAAMinPasswordLength$Scalar`); Confirm; Expiry Date; Lockout Status; "Reactivate Lockout Status" checkbox (enabled only when locked).
- Write: enable+set `rlAAASystemPasswordlevel<L>$scalar` = `$<pw>`; enable+set `rlAAAUnlockSystemPassword$scalar` = `<L>`.
- Gotchas: script compares against `tmpl.rlAAASysPassStatTable[0]["rlAAASystemPasswordlevelX$scalar"]` (wrong section → undefined) so password is effectively **always** re-sent with `$` prefix; unlock scalar always set to level regardless of checkbox (`lockedStatus` computed but unused). Validation reads `rlAAAPasswordComplexityEnabled$Scalar` which isn't in this form (so min length check never applies). Doc: CLI "only available in unmanaged mode".

### 4. Active Users
- Menu: Switch Management > Management Security > Active Users (`activeUsers_table`, read-only, NotEditable).
- Read: `GET API/active_users.htm` (VT `ActiveUsersVT`, lead `rlAAAUserTable`). No write.
- Cols: `rlAAAUserName$repeat?N` (Name), `rlAAAUserServiceType$repeat?N` (Protocol: 1 Telnet, 2 HTTP, 3 SSH, 4 HTTPS, 5 SNMP, other → "Serial"), `rlAAAUserRemoteIpAddress$repeat?N` (User Location). `rlAAAUserIndex` exists in VT but not repeated.
- No idle time / login time / kill-session fields.

### 5. Local User Database
- Menu: Switch Management > Management Security > Local User Database (`auth_table_TIC`).
- Read list: `GET API/auth_table_TIC.htm` (VT `LocalUserTable`, lead `rlAAALocalUserTable`). Add form: `GET API/auth_table_TIC_a.htm`. Edit: `GET API/auth_table_TIC_e.htm?Query:rlAAALocalUserName=<name>` (name escaped: `#`→%23 `%`→%25 `?`→%3F `;`→%3B `&`→%26 `+`→%2B; `^ [ " ' \ @` backslash-escaped). Write: POST to `API/auth_table_TIC.htm` (SetDataURI; templates' ACTIONs `/Forms/api/auth_table_TIC.htm`, `/Forms/API/auth_table_TIC_e.htm`).
- Cols: `rlAAALocalUserName` (1–20 chars, required), `rlAAALocalUserPrivilage` (1 "1 (Read-Only)" default, 15 "15 (Read-Write)"), `rlAAALocalUserPassword` (0–64; min = `rlAAAMinPasswordLength$Scalar` when `rlAAAPasswordComplexityEnabled$Scalar`=1, then blank also rejected), `rlAAALocalPasswordExpieryDate` (0 → "Never"), `rlAAALocalLockedState` (0 Locked, 1 Usable), `rlAAALocalHostStatus` (RowStatus), `rlAAALocalPasswordValidTime` (VT only); `rlAAAUnlockUserName$scalar`/`$repeat`.
- Add: enable `rlAAALocalUserName$add`, `rlAAALocalUserPrivilage$add`, `rlAAALocalUserPassword$add`=`$<pw>`, `rlAAALocalHostStatus$add`=`4`, `LocalUserTable$endAdd`=`OK`.
- Edit (on _e form): `rlAAALocalUserName$query`=name, `rlAAALocalUserPrivilage$query`, `rlAAALocalHostStatus$query`=`1`, `rlAAALocalUserPassword$query`=`$<pw>`; if "Reactivate Suspended User" checked: `rlAAAUnlockUserName$scalar`=name. (No `$endQuery` set by script.)
- Delete (list form): per selected i: `rlAAALocalUserName$repeat?i`=name, `rlAAALocalHostStatus$repeat?i`=`6`, `LocalUserTable$endRepeat?i`=`OK` (i = 1..k positional, not the original row index).
- Gotcha: edit always sends password with `$` prefix, even if user didn't change the field (field prefilled with stored value) (inferred risk: re-hashes stored hash). Delete uses positional indices 1..k overwriting whatever rows those indices were.

### 6. Access Profiles and Rules
- Menu: Switch Management > Management Security > Access Profiles and Rules (`security_mng`, SystemName `AccessProfiles`).
- Read: `GET API/security_mng.htm`; filter by profile: `security_mng.htm?Filter:(rlMngInfListInetName='<name>')`; edit: `security_mng.htm?Query:rlMngInfListInetName=<n>@rlMngInfListInetPriority=<p>`. Write: `POST API/security_mng.htm` (ACTION `/Forms/API/security_mng.htm`).
- Scalars: `rlMngInfEnable$scalar` (1 = enabled, 2 = disabled), `rlMngInfActiveListName$scalar` (active profile name; "" = None; `console-only` shown as "Console Only").
- Table `MngInfListInetTable` (lead `rlMngInfListInetTable`), Pkey Name+Priority; cols (`$repeat?N`/`$default`/`$add`/`$query`): `rlMngInfListInetName` (profile name; add: text or select existing via `rlMngInfListInetName$select`), `rlMngInfListInetPriority` (1–65535), `rlMngInfListInetService` (0 All, 1 Telnet, 2 SNMP, 3 HTTP, 4 Secure HTTP (HTTPS), 5 Secure Telnet (SSH)), `rlMngInfListInetIfIndex` (0 = Any; else port/VLAN/LAG ifIndex), `rlMngInfListInetIpAddr` (`0.0.0.0` = source IP disabled; IPv4 or IPv6), `rlMngInfListInetIpNetMask` (IPv4 mask), `rlMngInfListInetIPv6PrefixLength` (IPv4 prefix 1–32 / IPv6 0–128), `rlMngInfListInetAction` (0 Permit, 1 Deny), `rlMngInfListInetRowStatus`.
- UI-only controls: Source IP Address radio (1 Enabled / 2 Disabled), Supported IP Format (0 IPv4 / 1 IPv6), Address Class (0 Subnet Mask / 1 Prefix Length).
- Add rule: enable+set `$add` cols: Name, Priority, Service, IfIndex, IpAddr, (NetMask if IPv4 else IPv6PrefixLength, only if IP≠0.0.0.0), Action, RowStatus=`4` if new profile else `1`; `MngInfListInetTable$endAdd`=`OK`.
- Edit rule: same cols with `$query` suffix (Name only re-enabled), RowStatus `1`.
- Delete: for i=1..k: Pkey cols `rlMngInfListInetName$repeat?i`, `rlMngInfListInetPriority$repeat?i`, `rlMngInfListInetRowStatus$repeat?i`=`6`, `MngInfListInetTable$endRepeat?i`=`OK`.
- Activate (Settings): select profile → `rlMngInfEnable$scalar`=`1` + `rlMngInfActiveListName$scalar`=name; None → `rlMngInfActiveListName$scalar`="" + `rlMngInfEnable$scalar`=`2`. Confirm dialogs: console-only "will disconnect your session…"; others "may disconnect your HTTP session".
- Constraints/gotchas: rules of the **active** profile cannot be added/modified (client-side check); duplicate Name+Priority rejected client-side; max 256 rules total (doc); `console-only` profile hidden from add list and cannot be removed (doc); default: no active profile (None) (doc: "If None, access is available to all").

### 7. Authentication Profiles
- Menu: Switch Management > Management Security > Authentication Profiles (`authen_profiles_method`, numOfMethodsInUse=6).
- Read: `GET API/authen_profiles_method.htm`; add form `API/authen_profiles_method_a.htm`; edit `API/authen_profiles_method_e.htm?Query:rlAAAMethodListName=<full name>`. Write: `POST API/authen_profiles_method.htm` (SetDataURI).
- Table `methodListTable` (lead `rlAAAMethodListTable`), Pkey `rlAAAMethodListName`. Cols: `rlAAAMethodListName`, `rlAAAMethodType1`..`rlAAAMethodType6` (ordered method list), `rlAAAMethodListStatus` (RowStatus), `rlAAAAuthorizeEnable`.
- Method enum (`globalParameters.authenticationMethod`): 0 = Deny/end-of-list, 1 Line, 2 Enable, 3 Local, 4 RADIUS, 5 TACACS+, 6 None.
- Name convention: login profiles stored as `login_<name>`; defaults `login_n_default` ("Network Default"), `login_c_default` ("Console Default"); also `enable_*` (authorization), `http`, `https` lists exist in the same table (page shows only `login_` ones). Name 1–12 chars, no spaces.
- Add: `rlAAAMethodListName$add`=`login_<name>`, `rlAAAMethodType1..6$add` = chosen method values in order then `0`, `rlAAAMethodListStatus$add`=`4`, `rlAAAAuthorizeEnable$add`=`1`, (endAdd not explicitly set — inputs not disabled on _a form so `methodListTable$endAdd` is sent as-is).
- Edit: `rlAAAMethodListName$query` (enabled), `rlAAAMethodType1..6$query`, `rlAAAAuthorizeEnable$query`=`1`.
- Delete: non-default → `rlAAAMethodListName$repeat?i`, `rlAAAMethodListStatus$repeat?i`=`6`, `methodListTable$endRepeat?i`=`OK`. Default profiles are "restored" instead: `rlAAAMethodType1$repeat?i` = 3 (Local) for n_default / 6 (None) for c_default, Types 2..6 = 0.
- Gotchas: **Edit Save sorts the selected methods numerically** (`.slice(0).sort()`), destroying user-chosen order (Add preserves order). `_e` template's RpUrl/ACTION point to `arp_vlan_settings_e.htm` (copy-paste in firmware). Defaults (from Remove logic): Network Default = Local; Console Default = None (inferred).

### 8. Select Authentication
- Menu: Switch Management > Management Security > Select Authentication (`select_Authentication`, Tags MultiScalar).
- Read: `GET API/select_Authentication.htm`. Write: `POST API/select_Authentication.htm` (ACTION `/Forms/API/select_Authentication.htm`).
- Sections: `methodListTable` (same cols as §7; `$repeat?N`, plus `$addHTTP` / `$addHTTPS` variants + `methodListTable$endAddHTTP[S]`), `lineTable` (lead `rlAAALineTable`): `rlAAALinePortType`, `rlAAAIfIndex`, `rlAAAServiceType`, `rlAAALineMethodListNameLevel1` (assigned login list name), `rlAAALineStatus` (RowStatus); `$repeat?N` and `$add0..$add4` + `lineTable$endAdd0..4`.
- Line identity (PortType,ServiceType): Console (2,0), Telnet (1,1), HTTP (1,2), SSH (1,3), HTTPS (1,4); IfIndex 0. Internal index CONSOLE 0, TELNET 1, SECURETELNET 2, HTTP 3, SECUREHTTP 4 → `$addN`.
- UI: Console / Telnet / Secure Telnet (SSH) dropdowns = list of `login_*` profiles (Console hides Network Default; Telnet/SSH hide Console Default); Secure HTTP & HTTP = transferbox of methods Local(3), RADIUS(4), TACACS+(5), None(6) (Line/Enable not allowed).
- Write Console/Telnet/SSH (only if changed): existing line row N → enable `rlAAALinePortType$repeat?N`, `rlAAAIfIndex$repeat?N`, `rlAAAServiceType$repeat?N`, `rlAAALineStatus$repeat?N`=`1`, `rlAAALineMethodListNameLevel1$repeat?N`=`login_<name>`|`login_n_default`|`login_c_default`, `lineTable$endRepeat?N`. If row missing → `$addX` fields with status 4.
- Write HTTP/HTTPS: on the methodListTable row whose name starts with `http` / `https` (row R): enable `rlAAAMethodListName$repeat?R`, `rlAAAAuthorizeEnable$repeat?R`=`1`, `rlAAAMethodType1..k$repeat?R` = method values (None forced to last), remaining Types = `0`, and `methodListTable$endRepeat` (**no `?R` suffix** — likely bug).
- Gotchas: `addLineMethodList` calls unqualified `getPortAndServiceTypes` (undefined) → add path throws (only hit if a line row is missing); `rlAAALineStatus$addN` isn't in the form; `lineTable$endAddN` enabled but not set to OK. HTTP "Deny" = 0.

### 9. TACACS+
- Menu: Switch Management > Management Security > TACACS+ (`tacacs`, SystemName `TACACS`, jQuery/wcd).
- Read: `GET wcd?{SourceAddressSelectionList&applicationType=6}{TACACSDefaultParam}{TACACSServerList}`; edit: `wcd?{SourceAddressSelectionList&applicationType=6}{TACACSDefaultParam}{TACACSServerList&IPAddress=<ip>}`.
- Write: `POST wcd?{TACACSDefaultParam}{TACACSServerList}`.
- Global (Settings) write:
  ```xml
  <TACACSDefaultParam action="set"><timeoutForReply>T</timeoutForReply><keyString>K</keyString></TACACSDefaultParam>
  <SourceAddressSelectionList action="set"><Entry><applicationType>6</applicationType><IPv4InterfaceName>…</IPv4InterfaceName><IPv6InterfaceName>…</IPv6InterfaceName></Entry></SourceAddressSelectionList>
  ```
  `timeoutForReply` 1–30 s; `keyString` 0–128 chars; Source IPv4/IPv6 Interface dropdowns include "Auto" (interfaceManager.fillSouceInterfaces).
- Server add/edit:
  ```xml
  <TACACSServerList action="set"><TACACSServer><IPAddress/><portNo/><serverPriority/><timeoutForReply/><keyString/><globalDefaultKeyEnable/><connectionType/></TACACSServer></TACACSServerList>
  ```
  - `IPAddress` (pkey; IPv4/IPv6 incl. link-local via interfaceManager; not editable), `serverPriority` 0–65535, `portNo` 0–65535 (no default in JS or doc; standard TACACS+ port 49 — inferred), `timeoutForReply` 1–30 or `0` = "Use Default" (edit) / DefaultTimeout4Replay (=0) on add, `keyString` 1–128 or empty element when "Use Default", `globalDefaultKeyEnable` `1`=use global key / `2`=own key, `connectionType` (Single Connection) `0`=Enabled / `1`=Disabled.
  - Read-only: `connectionStatus` `0`=Connected, else Not Connected.
- Delete: `<TACACSServerList action="delete"><TACACSServer><IPAddress>ip</IPAddress></TACACSServer>…</TACACSServerList>`.

### 10. RADIUS
- Menu: Switch Management > Management Security > RADIUS (`radius`, SystemName `RADIUS`).
- Read: `GET wcd?{SourceAddressSelectionList&applicationType=1}{RadiusDefaultParam}{RadiusServerList}`; edit adds `{RadiusServerList&IPAddress=<ip>}`. Write: `POST wcd?{RadiusDefaultParam}{RadiusServerList}`.
- Global write:
  ```xml
  <RadiusDefaultParam action="set"><timeoutForReply/><keyString/><numberOfRetries/><deadTime/></RadiusDefaultParam>
  <SourceAddressSelectionList action="set"><Entry><applicationType>1</applicationType><IPv4InterfaceName/><IPv6InterfaceName/></Entry></SourceAddressSelectionList>
  ```
  ranges: timeoutForReply 1–30 s, numberOfRetries 1–10, deadTime 0–2000 (min per doc), keyString 1–128.
- Server add/edit:
  ```xml
  <RadiusServerList action="set"><RadiusServer><IPAddress/><authPortNo/><accountPortNo/><serverPriority/><timeoutForReply/><numberOfRetries/><deadTime/><keyString/><globalDefaultKeyEnable/><usageType/></RadiusServer></RadiusServerList>
  ```
  - `authPortNo` 0–65535 (UI default 1812; 0 = not used for auth), `accountPortNo` 0–65535 (UI default 1813; 0 = not used for accounting), `serverPriority` 0–65535 (0 highest), `timeoutForReply` 1–30 or `0`=Use Default, `numberOfRetries` 1–10 or `0`=Use Default, `deadTime` 0–2000 or **`2001`=Use Default**, `keyString` or empty when default, `globalDefaultKeyEnable` 1/2, `usageType` 1 Login / 2 802.1x / 3 All (add default All).
  - **Add also posts** `<AAAGlobalSetting action="set"><loginAccountingType>2</loginAccountingType><dot1xAccountingType>2</dot1xAccountingType></AAAGlobalSetting>` (side effect on accounting settings; SetDataURI doesn't list AAAGlobalSetting).
- Delete: `<RadiusServerList action="delete"><RadiusServer><IPAddress>ip</IPAddress></RadiusServer>…</RadiusServerList>`. Max 8 servers (doc).

### 11. Login History
- Menu: Logs and Alerts > Login History (`LoginHistory`).
- Read: `GET API/login_history.htm`; filter by user: `login_history.htm?[LoginHistoryVT]Filter:rlAAALocalLoginHistName='<name>'`.
- Table `rlAAALocalLoginHistTable` (VT `LoginHistoryVT`): `rlAAALocalLoginHistIndex`, `rlAAALocalLoginHistName` (User Name), `rlAAALocalLoginDateTime` (Login Time), `rlAAALocalLoginHistServiceType` (0 Console, 1 Telnet, 2 HTTP, 3 SSH, 4 HTTPS, 5 SNMP, else Unknown), `rlAAALocalLoginHistRemoteIpAddress` (Location). Second VT `HistoryNameVTable` → `rlAAALocalLoginHistName$repeat1?N` for the user filter dropdown (deduped client-side).
- Settings write: `POST API/login_history.htm` with `rlAAASuccLoginWriteToFile` = `1` Enabled / `2` Disabled ("Login History To File"). Input not disabled in template → always posted. Template has no ACTION (posts to RpUrl).

### 12. Brief (out of mgmt-security scope; 802.1x pages)
- Port Authentication Users (`users_table`, Network Administration > Security > Dot1x): read-only `GET API/users_table.htm`, `users_table_d.htm?Query:…` details; cols `rldot1xAuthMultiSessionUserName/StatsPortNumber/Time/StatsSourceMac/RadiusAttrVlan/RadiusAttrFilterId`, `dot1xPaePortNumber$repeat0`, `rlDot1xAuthSessionAuthenticMethod$repeat0` (Remote/Local/None). `rldot1xAuthMultiSessionTime` = 802.1x session duration (not mgmt session timeout).
- Host Authentication (`advanced_authen_table`): `API/advanced_authen_table.htm` / `_e.htm`; `swIfHostMode` (1 Single, 2 Multiple Host, 3 Multiple-Session), `swIfSingleHostViolationAdminAction` (1 Discard, 2 Forward, 3 Shutdown), `dot1xAuthAuthControlledPortStatus/Control`, `rldot1xRadiusAttrVlanIdEnabled`, `swIfSingleHostViolationOperTrapCount`. Belongs to the Security/Dot1x catalogue.

---

## D. Logging and SNMP

How the two request styles behave, as they apply to the pages below:
- **Form ("Tags") pages** (`API/x.htm`): a GET returns a RomPager form. Most `$scalar`/`$repeat`/`$add`/`$query` inputs come back `disabled`. To write, the classic UI POSTs the serialized form back to `./API/x.htm`, after it has set values and removed `disabled` only on the fields it means to change. Disabled inputs are not serialized, so **only the changed fields plus `restoreUrl`/`errorCollector` are sent**. The page escapes `+` as `%2B`. Errors come back in hidden `mibError` input(s) (text after `Diag=`). The form's `ACTION` attribute is `/Forms/config/x.htm`, but the JS posts to `./API/x.htm`.
- **Tags edit query**: `x.htm?Query:col=val@col2=val2`, built from the `$repeat?` pkey names with the `$...` suffix stripped. With several sections it becomes `[section]Query:...`.
- **wcd pages**: the edit query appends `&pkey=urlencoded(val)` per Pkey inside `{Section&query}`.
- **wcd POST XML**: `json2xml` emits `<Section action="A">` once per action, in object-insertion order. **Several actions in one Section are allowed** (for example `delete` then `set`, as an edit). Arrays repeat the entry wrapper. A field set to `undefined` is omitted. A field set to `null` (or an empty object) is emitted as an empty element `<f></f>`. An action whose content is empty is skipped. A wcd POST uses a 3 s ajax timeout. Success means `ActionStatus/statusCode == 0`. On failure, `statusString` and `localMsg/msgId/arg` are returned.
- **Actions seen in this scope**: `set`, `add`, `edit`, `delete`. `edit` is used by SNMPRemoteEngineIDList and SNMPUserISList.
- **"Apply to:" select** (tpl/logsSettings.htm): `slctSave` 0 = Running Configuration, 1 = Running and Startup Configuration. It appears on the Logs settings dialog. How it is posted is handled globally (outside this scope).

---

### Logs (Logs and Alerts > Logs) — `logs_settings` (Tags)

**Read RAM log (default view):**
`GET API/logs_settings_ram.htm?[Counter]Query:rlMibTableInstancesInfoTableName=rlSyslogLogCacheTable[LogCacheVT]partialKey:-Counter-25`
- Rows are in `rlSyslogLogCacheTable`. Each row has these fields (as `name$repeat?N`):
  - `rlSyslogLogCacheCounter`: sequence key.
  - `rlSyslogLogCacheDateTime`
  - `rlSyslogLogCacheSeverity`: 0..7.
  - `rlSyslogLogCacheText1..4`: the message is the concatenation of all four.
- Total count: `rlMibTableInstancesInfoNumOfInstances$query` (unfiltered) or `LogCacheVT$entryCount` (filtered). Also `numOfEntries$52`.
- **Paging:**
  - Each fetch asks for 25 rows and the page shows 20. "Next" uses row #20's counter (`tmpl.rlSyslogLogCacheTable[19]`):
    `logs_settings_ram.htm?[Counter]Query:rlMibTableInstancesInfoTableName=rlSyslogLogCacheTable[LogCacheVT]partialKey:From-rlSyslogLogCacheCounter=<lastKey>-Counter-25`
  - With a filter active: `logs_settings_ram.htm?<filter part>^partialKey:From-rlSyslogLogCacheCounter=<lastKey>-Counter-25`.
  - "Back" re-uses cached URLs per page. Pages shown = ceil(N/20).

**Read flash log:**
`GET API/logs_settings_log.htm?[Counter]Query:rlMibTableInstancesInfoTableName=rlSyslogLogTable[LogFileVT]partialKey:-Counter-25`
- Table `rlSyslogLogTable` with `rlSyslogLogCounter`, `rlSyslogLogDateTime`, `rlSyslogLogSeverity`, `rlSyslogLogText1..4`. Count is in `LogFileVT$entryCount`.
- The JS paging (Next) is hard-coded to the RAM URL. It looks broken for flash (inferred).

**Filter dialog:**
- Log Type `rdoLogType`: 1 = RAM, 2 = Log File (flash).
- Severity `slcInstanceID`: 0 = All, 1 = Urgent, 2 = Major, 3 = Informational, 4 = Debug.
- RAM filter URL:
  `logs_settings_ram.htm?[LogCacheVT]Filter:(rlSyslogLogCacheSeverity==0||rlSyslogLogCacheSeverity==1||rlSyslogLogCacheSeverity==2)^getNumberOfEntries^partialKey:-Counter-25`
  - Urgent = 0|1|2, Major = 3|4, Informational = 5|6, Debug = 7.
  - Filter All = the default URL.
- Flash filter: same pattern with `[LogFileVT]` and `rlSyslogLogSeverity`.
- **Bug:** the flash filter code only appends the conditions for index 1, and ignores 2..4. A reimplementation should build it properly.

**Display mapping:**
- Severity group: 0–2 Urgent, 3–4 Major, 5–6 Informational, 7 Debug.
- Level text: 0 Emergency, 1 Alert, 2 Critical, 3 Error, 4 Warning, 5 Notice, 6 Informational, 7 Debug.

**Clear logs** (button `clearLogs`):
- POST to the form currently loaded.
- RAM view: enable `rlSyslogClearCache$scalar=1` (in logs_settings_ram.htm).
- Flash view: enable `rlSyslogClearLogfile$scalar=1` (in logs_settings_log.htm).
- **Gotcha:** you must GET the matching htm first, so that its form is the one POSTed.

**Settings read/write:** `GET`/`POST API/logs_settings_s.htm`. All inputs are hidden `$scalar` (disabled until changed). The JS calls this section `AutoUpdateScalar`.

| Field | UI | Values |
|---|---|---|
| `rlSyslogGlobalEnable$scalar` | Logging | 1 enable, 2 disable (inferred: UI checks =="1") |
| `rlAAAAuditingEnable$scalar` | Log Authentication Events | 1/2 (inferred) |
| `rlCopyAuditingEnable$scalar` | Log Copy Files Events | 1/2 (inferred) |
| `rlMngInfAuditingEnable$scalar` | Log Management Access Events | 1/2 (inferred) |
| `rlSyslogMinLogToConsoleSeverity$scalar` | Console min severity | 2 = Urgent, 4 = +Major, 6 = +Informational, 7 = +Debug, 8 = off (none checked) |
| `rlSyslogMinLogToCacheSeverity$scalar` | RAM log min severity | same as Console |
| `rlSyslogMinLogToFileSeverity$scalar` | Flash log min severity | same as Console |
| `rlSyslogCacheSizeAfterReset$scalar` | Maximum Logs (RAM buffer, applies after reset) | integer 20–400 |

Notes on the settings dialog:
- The severity checkboxes are cumulative: checking a level checks all levels above it.
- The parent checkbox defaults: ticking "Console" or "RAM" sets level 6; ticking "Log File" sets level 4.
- When Logging is disabled, the RAM/flash and auditing controls are disabled, but the console control is not.
- The Save handler enables and sends all 8 scalars together.
- `dot1qMaxSupportedVlans` is also present (read-only, unused).

---

### Remote Log Servers (Logs and Alerts > Remote Log Servers) — `log_servers_table` (wcd)

- **Read:** `GET wcd?{SyslogServerList}`. Edit view: `wcd?{SyslogServerList&index=..&addrType=..&IPAddr=..}`.
- **Fields:**
  - `index`
  - `addrType`: 1 IPv4; 2/3 IPv6 (3 is probably link-local, inferred)
  - `IPAddr`
  - `descr`: 0–64 chars
  - `portNo`: 1–65535. Default 514 (inferred: not set in JS)
  - `facility`: 16..23 = Local 0..Local 7; 24 = "No Map" (display only)
  - `severity`: minimum severity
  - `dropped`: read-only counter (inferred)
- **Pkey:** `index`, `addrType`, `IPAddr`.
- **Severity UI:** four cumulative checkboxes map to the posted value: Urgent → 2, Major → 4, Informational → 6, Debug → 7. If nothing is checked, 0 is posted. Add defaults to Urgent+Major checked (= 4).
  - Displayed as: 0–2 Urgent, 3–4 Major, 5–6 Informational, 7 Debug.
- **Add:**
  ```xml
  <SyslogServerList action="set"><SyslogServer><addrType/><IPAddr/><descr/><portNo/><facility/><severity/></SyslogServer></SyslogServerList>
  ```
  There is no index on add. `addrType` comes from the IP format selector. The IPv6 link-local/global choice is made through interfaceManager.
- **Edit:** the same `set`, with `index`, `addrType` and `IPAddr` taken from the record. The address cannot be changed.
- **Delete:**
  ```xml
  <SyslogServerList action="delete"><SyslogServer><index/><addrType/><IPAddr/></SyslogServer>...</SyslogServerList>
  ```
  This is multi-select: one `SyslogServer` element per row.

---

### RMON Threshold and Events / Events Log (Statistics and Diagnostics > Monitoring (RMON)) — brief, Tags pages

**Events (`events_table`)**
- **Read:** `GET API/events_table.htm`. Also returns `sysUpTime`, `rndManagedTime` and `rndManagedDate`, used to compute last-sent times.
- **Table `eventTable`:** `eventIndex`, `eventCommunity`, `eventDescription`, `eventType`, `eventLastTimeSent`, `eventOwner`, `eventStatus` (all `$repeat?`).
- `eventType`: 1 None, 2 Log, 3 Trap, 4 Log and Trap.
- **Add:** `GET API/events_table_a.htm`, then POST it with these fields enabled:
  - `eventIndex$add`: next free index
  - `eventCommunity$add`, `eventType$add`, `eventOwner$add`, `eventDescription$add`
  - `eventStatus$add=2`: createRequest-like, inferred
  - `String$communityadd=OK`, `Default$communityadd=OK`, `String$owneradd=OK`, `Default$owneradd=OK`
  - `eventsTable$endAdd=OK`
- **Edit:** `GET events_table_e.htm?Query:eventIndex=N`, then POST. Changed `*$query` fields, plus `String$/Default$ {community,description,owner}query=OK`, `eventStatus$query=1`, `eventTable$endQuery=OK`.
- **Delete:** on the main form, for row i (1-based): `eventIndex$repeat?i=<key>`, `eventStatus$repeat?i=4` (destroy), `eventTable$endRepeat?i=OK`.

**Alarms (`alarms_table`)**
- **Read:** `GET API/alarms_table.htm`. Add: `alarms_table_a.htm` (it includes an event list via `eventIndex$repeat1`/`eventDescription$repeat1`). Edit: `alarms_table_e.htm?Query:alarmIndex=N`.
- **Fields:**
  - `alarmIndex`
  - `alarmVariable`: OID = `<counter OID>.<ifIndex>`. Counter chosen from a list; Interface Type is Port or LAG.
  - `alarmSampleType`: 1 Absolute, 2 Delta
  - `alarmRisingThreshold`: 0–2147483647, default 100
  - `alarmRisingEventIndex`
  - `alarmFallingThreshold`: 0–2147483647, default 20
  - `alarmFallingEventIndex`
  - `alarmStartupAlarm`: 1 Rising, 2 Falling, 3 Rising and Falling
  - `alarmInterval`: 0–2147483647 s in the UI, default 100
  - `alarmOwner`
  - `alarmStatus`
- **Add:** all `*$add` fields, plus `String$add=OK`, `Default$add=OK`, `alarmStatus$add=2`, `alarmsTable$endAdd=OK`.
- **Edit:** `alarmVariable$query`, `alarmRisingThreshold$query`, `alarmRisingEventIndex$query`, `alarmFallingEventIndex$query`, other changed `$query` fields, `String$query=OK`, `Default$query=OK`, `alarmStatus$query=1`, `alarmsTable$endQuery=OK`.
- **Delete:** `alarmIndex$repeat?i`, `alarmStatus$repeat?i=4`, `alarmsTable$endRepeat?i=OK`.

**Events Log (`rmon_logs`)**
- `GET API/rmon_logs.htm`. Read-only table: `logEventIndex`, `logIndex`, `logTime`, `logDescription` (`$repeat`), plus `sysUpTime`, `rndManagedTime`, `rndManagedDate`.

---

### SNMP Global Parameters (Network Administration > SNMP Monitoring > Global Parameters) — `snmp_global_params` (wcd)

- **Read:** `GET wcd?{SNMPGlobalSetting}{SNMPRemoteEngineIDList}`. Edit view: `{SNMPRemoteEngineIDList&IPAddress=..}`.
- **SNMPGlobalSetting** (settings dialog):
  - `localEngineIDType`: 0 None, 1 Default, 2 User-defined. Default = enterprise 674 + MAC.
  - `localEngineID`: hex pairs, 10–64 hex chars. Editable only when type = 2.
  - `SNMPEnbl`: 1 Enabled / 2 Disabled. UI label is "SNMP Notifications"; it may actually be the SNMP agent enable (inferred).
  - `trapsEnbl`: 1/2, label "Traps".
  - `authTrapsEnbl`: 1/2, label "Authentication Notifications".
- **Write settings:**
  ```xml
  <SNMPGlobalSetting action="set"><SNMPEnbl/><trapsEnbl/><authTrapsEnbl/><localEngineIDType/>[<localEngineID/> only if type=2]</SNMPGlobalSetting>
  ```
  Per the docs, the engine ID must be defined before SNMPv3 is used.
- **Remote Engine IDs** (`SNMPRemoteEngineIDList`):
  - Fields: `IPAddress`, `addrType`, `remoteEngineID` (hex 10–64). Pkey is `IPAddress`.
  - Add: `<SNMPRemoteEngineIDList action="add"><Entry><IPAddress/><remoteEngineID/></Entry></...>`
  - Edit: `action="edit"`, same `Entry`. The IP cannot be changed.
  - Delete: `action="delete"`, one `Entry` per row with `IPAddress` + `remoteEngineID` (the engine ID is looked up from the cached table).

---

### View Settings (SNMP Monitoring > View Settings) — `view_settings` (wcd)

- **Read:** `GET wcd?{ViewList}{ViewOIDList}`. The "View By" select re-reads with `wcd?{ViewList}{ViewOIDList&viewName=<name>}`.
- **Response:** `ViewList[]` contains `viewName`. `ViewOIDList[0]` contains `{viewName, OIDSubtreeList[] of {OIDSubtree, OIDSubtreeString, viewAction}}`.
  - The page uses only `ViewOIDList[0]`.
  - `viewAction`: 1 Included, 2 Excluded.
- **Add view** (settings dialog; View Name 1–30 chars):
  ```xml
  <ViewOIDList action="set"><ViewEntry><viewName>N</viewName></ViewEntry></ViewOIDList>
  ```
- **Add OID subtree** (sends the full list):
  ```xml
  <ViewOIDList action="set"><ViewEntry><viewName/><OIDSubtreeList><OIDEntry>…existing fields…</OIDEntry>…<OIDEntry><OIDSubtree/><viewAction/></OIDEntry></OIDSubtreeList></ViewEntry></ViewOIDList>
  ```
  - The OID comes from the MIB tree picker (`js/mibTreeTable.js`: `rlMibTreeSon` / `rlMibTreeSonObjectId`, 2 levels) or is typed in.
- **Delete subtrees:**
  ```xml
  <ViewOIDList action="delete"><ViewEntry><viewName/><OIDSubtreeList><OIDEntry><OIDSubtree/></OIDEntry>…</OIDSubtreeList></ViewEntry></ViewOIDList>
  ```
- **Reserved views:** `Default` and `DefaultSuper` are read-only (enforced by the UI).
- **No "delete view" action exists in the JS.** It may happen implicitly when the last subtree is removed (inferred).

---

### Access Control / SNMP groups (SNMP Monitoring > Access Control) — `access_control` (wcd)

- **Read:** `GET wcd?{SNMPGroupList}{ViewList}`. Edit view: `wcd?{SNMPGroupList&SNMPGroupName=..&securityModel=..&securityType=..}{ViewList}`. Write: `wcd?{SNMPGroupList}`.
- **Fields:**
  - `SNMPGroupName`: 1–30 chars
  - `securityModel`: 1 SNMPv1, 2 SNMPv2, 3 SNMPv3
  - `securityType`: 1 No Authentication, 2 Authentication ("No Priv" on the add form), 3 Privacy ("AuthPriv"). Only for v3; otherwise forced to 1.
  - `readView`, `writeView`, `notifyView`: view names, or empty for none. Notify is only enabled for v3 (inferred from UI).
  - Pkey: (`SNMPGroupName`, `securityModel`, `securityType`).
- **Add:**
  ```xml
  <SNMPGroupList action="set"><SNMPGroup><SNMPGroupName/><securityModel/><securityType/>[<readView/>][<writeView/>][<notifyView/>]</SNMPGroup></SNMPGroupList>
  ```
  Each view element is included only when that operation is checked.
- **Edit = two actions in one POST:**
  ```xml
  <SNMPGroupList action="delete"><SNMPGroup><SNMPGroupName/><securityModel/><securityType/></SNMPGroup></SNMPGroupList>
  <SNMPGroupList action="set"><SNMPGroup>…all 6 fields…</SNMPGroup></SNMPGroupList>
  ```
  An unchecked view is sent as an empty element.
- **Delete:** `action="delete"`, one `SNMPGroup` (3 key fields) per row.
- **Legacy form `API/snmp_access_table.htm`** (page `snmp_access_table`, not in the menu tree): the vacmAccessTable.
  - Fields (`$repeat`): `vacmGroupName`, `vacmAccessSecurityModel`, `vacmAccessSecurityLevel`, `vacmAccessContextPrefix`, `vacmAccessReadViewName`, `vacmAccessWriteViewName`, `vacmAccessNotifyViewName`, `vacmAccessStatus`, plus `String$select1` / `Default$select1`.
  - Not needed if the wcd path is used.

---

### User Security Model / SNMPv3 users (SNMP Monitoring > User Security Model) — `user_sec_model` (wcd)

- **Read:** `GET wcd?{SNMPUserISList}{SNMPGroupList&filter=(securityModel=3)}{SNMPGlobalSetting}{SNMPRemoteEngineIDList}`.
  - Edit view: `{SNMPUserISList&userName=..&engineID=..&engineIDType=..&IPAddress=..}` plus the same 3 sections.
- **Write URL** in metadata: `wcd?{SNMPUserList}`. **But the XML body section is `SNMPUserISList`.** The URL section name and the body section name differ.
- **Fields:**
  - `userName`: 1–30
  - `engineIDType`: 1 Local, 2 Remote
  - `engineID`: on Local, the page copies `SNMPGlobalSetting.localEngineID`; on Remote, the selected remote engine ID
  - `IPAddress`: remote engine IP, omitted for Local
  - `groupName`: v3 groups only
  - `authenticationMethod`: 0 None, 1 MD5 Key, 2 SHA Key
  - `authenticationPassword`: 1–32
  - `privacyMethod`: 1 None, 2 DES
  - `privacyPassword`: 1–32
  - Pkey: `userName`, `engineID`, `engineIDType`, `IPAddress`.
- **Add:**
  ```xml
  <SNMPUserISList action="add"><Entry><userName/><groupName/>[<IPAddress/>]<engineIDType/><engineID/><authenticationMethod/><privacyMethod/><authenticationPassword/><privacyPassword/></Entry></SNMPUserISList>
  ```
- **Edit:** `action="edit"`, the same `Entry`. Name, engine and IP come from the record.
- **Delete:** `action="delete"`, one `<Entry><engineID/><userName/><engineIDType/><IPAddress/></Entry>` per row.
- **Constraints enforced by the UI:**
  - At least one v3 group must exist before adding a user.
  - If `localEngineIDType == 0` and there are no remote engines, the add form is fully disabled.
- **Persistence:** per the docs, SNMP users and communities are not saved in a configuration file copied to another device.

---

### Communities (SNMP Monitoring > Communities) — `snmp_communities` (wcd)

- **Read:** `GET wcd?{CommunityList}`.
  - Add form: `wcd?{SNMPGroupList}{ViewList}`.
  - Edit: `wcd?{SNMPGroupList}{ViewList}{CommunityList&communityString=..&managementStationIPAddress=..}`. The page re-filters the entry client-side.
- **CommunityList entries:**
  - `communityString`: 1–20
  - `managementStationType`: 1 specific IP, 2 All
  - `managementStationIPAddress`: "All" is sent as `0.0.0.0`, even for IPv6
  - Then either `Basic{accessMode, viewName}` or `Advance{SNMPGroupName}`.
  - Pkey: (`communityString`, `managementStationIPAddress`).
  - The UI renders a "Basic Table" and an "Advanced Table".
- **accessMode:** 1 Read Only, 2 Read Write, 3 SNMP Admin. With SNMP Admin, `viewName` is null and is emitted as an empty element.
- **Advanced mode:** the group must be a non-v3 group (the UI lists groups with `securityModel != 3`).
- **Add / Edit** (both use `set`):
  ```xml
  <CommunityList action="set"><CommunityEntry><communityString/><managementStationType/><managementStationIPAddress/><Basic><accessMode/><viewName/></Basic></CommunityEntry></CommunityList>
  ```
  or the same with `<Advance><SNMPGroupName/></Advance>`.
  - On edit, `viewName` is null unless the "View Name" checkbox is ticked.
- **Delete:** `action="delete"`, one `<CommunityEntry><communityString/><managementStationIPAddress/></CommunityEntry>` per row.

---

### Notification Filter (SNMP Monitoring > Notification Filter) — `notification_filter` (wcd)

- **Read:** `GET wcd?{NotificationFilterList}`. The response holds all filters: `filterName`, `OIDSubtreeList[] of {OIDSubtree, filterAction}`. `filterAction`: 1 Included, 2 Excluded. The "View By" select filters client-side.
- **New filter** (settings dialog: Filter Name 1–30, first OID, type). The UI rejects duplicate names.
  ```xml
  <NotificationFilterList action="set"><Filter><filterName/><OIDSubtreeList><OIDEntry><OIDSubtree/><filterAction/></OIDEntry></OIDSubtreeList></Filter></NotificationFilterList>
  ```
- **Add OID to an existing filter:** the same `set`, with the full existing `OIDEntry` list plus the new one.
- **Delete OIDs:**
  ```xml
  <NotificationFilterList action="delete"><Filter><filterName/><OIDSubtreeList><OIDEntry><OIDSubtree/></OIDEntry>…</OIDSubtreeList></Filter></NotificationFilterList>
  ```
  Deleting all of a filter's OIDs removes the filter (the UI resets its selection; inferred).
- The OID picker is the same MIB tree as in View Settings.

---

### Notification Recipients (SNMP Monitoring > Notification Recipients) — `SNTPnotification` (wcd; the page name is a misnomer, it is SNMP not SNTP)

- **Read / Add view / Edit view:** `GET wcd?{NotificationFilterList}{NotificationReceiverList}{SNMPTrap}`. There is no per-key query: the edit view searches client-side.
- **Two tables:**

**SNMPv1,2 recipients** (`SNMPTrap.SNMPTrapReceiverList[]`, section `SNMPTrap` also has `enabled`):
- Fields:
  - `receiverIPAddress`
  - `notificationType`: 1 Traps, 2 Informs
  - `communityString`: 1–32
  - `SNMPVersion`: 1 SNMPv1, 2 SNMPv2
  - `UDPPortNo`: 1–65535, default 162
  - `filterEnabled`: 1 yes, 2 no
  - `filterName`
  - `timeout`: 1–300 s, default 15, Informs only
  - `retries`: 1–255, default 3, Informs only
- Pkey: (`notificationType`, `receiverIPAddress`).
- Informs force SNMPv2.
- Add / Edit:
  ```xml
  <SNMPTrap action="set"><SNMPTrapReceiverList><SNMPTrapReceiverEntry><receiverIPAddress/><notificationType/><communityString/><SNMPVersion/><UDPPortNo/><filterEnabled/>[<filterName/>]<timeout/><retries/></SNMPTrapReceiverEntry></SNMPTrapReceiverList></SNMPTrap>
  ```
  - `filterName` is sent only when `filterEnabled=1`. "None" is sent as "".
  - On edit, the empty `delete` array is skipped, so an edit is a single `set` (overwrite).
  - For Traps, timeout and retries are disabled inputs and are sent as "" (inferred).
- Delete:
  ```xml
  <SNMPTrap action="delete"><SNMPTrapReceiverList><SNMPTrapReceiverEntry><notificationType/><receiverIPAddress/></SNMPTrapReceiverEntry>…</SNMPTrapReceiverList></SNMPTrap>
  ```
  This is a single list wrapper that contains several entries.

**SNMPv3 recipients** (`NotificationReceiverList[]`):
- Fields:
  - `receiverIPAddress`, `notificationType`
  - `userName`: 1–32
  - `securityType`: 1 No Authentication, 2 Authentication, 3 Privacy
  - `UDPPortNo`, `filterEnabled`, `filterName`, `timeout`, `retries`
- Pkey: (`notificationType`, `userName`, `receiverIPAddress`).
- Add:
  ```xml
  <NotificationReceiverList action="set"><Receiver><receiverIPAddress/><notificationType/><userName/><securityType/><UDPPortNo/><filterEnabled/>[<filterName/>]<timeout/><retries/></Receiver></NotificationReceiverList>
  ```
- **Edit = two actions in one POST:** `action="delete"` `<Receiver>` with the 3 keys, then `action="set"` with the full `<Receiver>`.
- Delete: `action="delete"`, one `<Receiver><notificationType/><receiverIPAddress/><userName/></Receiver>` per row.

**Gotchas:**
- On add, "SNMP Version" (`rdoSNMPVersion` 1 = v1,2 / 2 = v3) chooses the target section (`SNMPTrap` or `NotificationReceiverList`).
- On add, the IP format selector decides IPv4 or IPv6.
- The filter dropdown's option values are indices. The code sends the text field `#drpFilterName_Text`, not the value.
