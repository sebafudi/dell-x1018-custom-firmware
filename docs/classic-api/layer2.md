# X1018 classic web UI (fw 3.0.1.9): layer-2 feature and API catalogue

Source: decompressed classic UI (js/Pages, js/metadata.js, API/*.htm, tpl/*.htm, documentation/*.html). I only read files and made no requests to the switch, so nothing here is verified live. Anything marked "(inferred)" is a guess.

## 0. Transport conventions (all sections)
- **Page-to-request map:** js/metadata.js holds `GetDataURI` (table read), `GetEditDataURI` (one-row read; each `&query` is replaced by `&<Pkey>=<urlencoded>` for every Pkey of the row, e.g. `&interfaceName=gi1%2F0%2F3`), `GetAddDataURI` and `SetDataURI`. Writes POST to the same URL used for the read. The URL's `{sections}` don't matter; the body does.
- **wcd read:** `GET wcd?{Sec}{Sec&param=v&filter=<expr>}` returns `ResponseData/DeviceConfiguration/<Sec type="section">`.
  - `*List` and `*Table` sections contain repeated entry elements; scalar sections contain fields directly.
  - **Gotcha:** `VLANInterfaceISLiteList` answers with a `<VLANInterfaceISList>` element.
  - Filters look like `&filter=actorAdminKey>0`, `&filter=(IPAddr>=1.0.0.0)`, `&filter=MACAddress='..'&&VLANID=5`.
- **wcd write:**
  - Body format: `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><Sec action="set|add|delete|restore|deleteAll|restoreAll"><EntryElem><f>v</f>..</EntryElem>..</Sec>[more Sec blocks]</DeviceConfiguration>`.
  - Entry element names vary by section: `Entry`, `VLAN` (VLANList), `IfEntry` (ProtectedPortList), `InterfaceEntry` (VoiceVLANInterfaceList), `LAGEntry`/`PortEntry` (LAGList), `VLANEntry` (IGMPMLDSnoopVLANList), and so on. Each section below gives its own.
  - Scalar sections have no wrapper element.
  - **Values must be strings** (a JS number serializes to an empty element). `null` or `""` gives an empty element, which is what `restore` uses (it resets the named fields to their defaults). `undefined` leaves the field out.
  - Several blocks, including the same section with different actions, can go in one POST. `post._order` fixes their order; when it is present, only the listed pairs are sent.
  - The response has `ActionStatus/statusCode` (0 = OK) and `statusString`; error details are in `localMsg/msgId` plus `arg` elements.
  - The classic UI then offers "save to startup config". Writes only change the running config.
- **RomPager form pages** (`API/<page>.htm`):
  - Read with `GET API/<page>[_e|_a|_m].htm[?[VT]Filter:(expr)][^][[VT]]Query:k=v@k2=v2`. The HTML has hidden inputs `field$repeat?N` (table rows), `field$query` (the queried row), `field$add`, `field$select`, `restoreUrl`, `errorCollector` and `mibError`.
  - Write with `POST API/<same page>.htm`, serializing only *enabled* inputs:
    - always `restoreUrl` and `errorCollector`;
    - edit: the changed `field$query` values plus `<VT>$endQuery=OK`;
    - add: `field$add` values (RowStatus `...$add=4` = createAndGo) plus `<VT>$endAdd=OK`;
    - multi-row (delete many, or bulk edit): for each row N, `field$repeat?N` values (RowStatus `=6` = destroy) plus `<VT>$endRepeat?N=OK`.
  - Errors come back in the `mibError` input.
- **ifIndex:** port gi1/0/N = N. LAG n = trunkFirstIndex + n - 1. VLAN v = 99999 + v. Interface names are `gi1/0/N`; LAGs are written `LAG<n>` by the classic wizards (inferred: `po<n>` may also be accepted).
- **Remote CLI channel** (the only true free-form bulk channel), used by Port Profile and the Dashboard:
  - POST `<RemoteCLITable action="set"><Entry><commandText>exit</commandText></Entry><Entry><commandText>exit</commandText></Entry><Entry><commandText>config</commandText></Entry><Entry><commandText>interface range gi1/0/1-4</commandText></Entry><Entry><commandText>...</commandText></Entry></RemoteCLITable>`.
  - Then poll `wcd?{ConfigInfoStatus}` until `state=6`, and read the output from `wcd?{RemoteCLIOutputTable}` (rows `id, text`).
  - Details are in the VLAN section ("Generic CLI channel").

## Contents
1. Ports: Port Configuration, wizards, Port Profile, Jumbo, Protected Ports, Mirroring, Green Ethernet/EEE, Storm Control, Port Security, Proprietary Protocol Filtering, TCP Congestion, UDLD
2. VLAN: VLAN list/membership, VLAN Port/LAG Settings (membership writes, bulk), Private VLAN, Protocol Group/Port, GVRP, GARP, GVRP stats, wizards, CLI channel
3. LLDP and Voice VLAN: LLDP Properties/Port Settings, MED Network Policy, MED Port Settings, Neighbors, Voice VLAN Properties/Port Setting/OUI
4. LAG/LACP and STP: LAG Membership/Configuration, LACP, LAG wizard, STP global/port/LAG, RSTP, MSTP
5. MAC tables and Multicast: Dynamic/Static address tables, Multicast global, IGMP/MLD snooping, Multicast Group, Forward All, Unregistered, TV VLAN

## How VLAN membership can be written (summary)
- **Per port (the only 802.1Q path in the classic UI):**
  - `VLANInterfaceISList` takes `<Entry>` elements keyed by `interfaceName`.
  - Its list fields (`trunkMemberVLANs`, `generalTaggedVLANs`, `generalUntaggedVLANs`, `generalForbiddenVLANs`) are **incremental**: `set` adds the given range string and `delete` removes it. The `accessPVID`, `trunkNativeVID` and `generalPVID` scalars are replaced.
- **Many ports in one request:**
  - Put N `<Entry>`s in one `set` block, and optionally N `<Entry>`s in a `delete` block first; the classic VLAN and LAG wizards do exactly this.
  - To replace a trunk list: `delete trunkMemberVLANs=1-4094`, then `set`.
  - To reset a port: `restore` with the fields as empty elements.
- **Per VLAN (matrix):**
  - There is no 802.1Q per-VLAN membership write. The classic VLAN Membership page is read-only (its Save only edits name and auth), and `VLANMembershipList` (per-VLAN read, `&VLANID=`) is never written.
  - Emulate it: one POST that sets or deletes `<vid>` in the right list field on every affected port.
  - The only bitmap/per-VLAN writes are Private VLAN membership (`API/switch_private_vlan_m.htm`, hex port bitmaps) and multicast port lists (section 5).
- **Anything else** (e.g. `switchport general allowed vlan add 10-20 tagged` on an interface range): Remote CLI channel (inferred to work, since Port Profile uses it for `macro apply`).
- **Bulk reads:**
  - `VLANInterfaceISLiteList&interfaceType=1`: mode, PVID, frame type and ingress filter for all ports (probably fast).
  - `VLANMembershipInterfaceList&interfaceType=1`: current tagged/untagged VLANs per port.
  - `VLANInterfaceActiveModeISList&interfaceType=1`: admin lists of the active mode for all ports (speed unknown).
  - The full `VLANInterfaceISList` without `interfaceName` takes about 24 s.



## Ports, Green Ethernet, Storm Control, Port Security, Protocol Filtering, TCP Congestion, UDLD

Conventions: see section 0 at the top of this file. For form pages, the edit read is `?Query:<pkey without $suffix>=<v>[@k2=v2]`, and only *enabled* inputs are POSTed. For wcd pages, send every value as a **string**: json2xml turns a JS number into an empty element. Port ifIndex for gi1/0/N on X1018 = N (inferred). LAG ifIndex = `trunkFirstIndex` (hostparam `l2_first_trunk_ifIndex`) + n-1. VLAN ifIndex >= 100000.

---

### Port Configuration (classic: Network Administration > Port Settings > Ports > Port Configuration; page PortConfiguration)
- Read (list, bulk, all ports): `GET wcd?{Standard802_3List&interfaceType=1}{EEEInterfaceList}{EEELLDPInterfaceList}{GreenEthSavingTypeList}{LACPPortList}`. Five sections for every port. This is a heavy request.
- Read (edit, one port): `GET wcd?{Standard802_3List&interfaceType=1&interfaceName=gi1%2F0%2F3}{EEEInterfaceList&interfaceName=gi1%2F0%2F3}{EEELLDPInterfaceList&interfaceName=gi1%2F0%2F3}{GreenEthSavingTypeList&savingType=2&interfaceName=gi1%2F0%2F3}{LACPPortList&interfaceName=gi1%2F0%2F3}`. The UI fills every `&query` with the selected row's Pkeys. Sending the GreenEthSavingTypeList Pkeys (interfaceName, savingType) a second time is harmless (inferred).
- Write (edit): `POST wcd?{Standard802_3List&interfaceType=1}{EEEInterfaceList}{EEELLDPInterfaceList}{GreenEthSavingTypeList}{LACPPortList}`. All four sections go in one body:
  ```xml
  <DeviceConfiguration>
   <Standard802_3List action="set"><Entry><interfaceName>gi1/0/3</interfaceName>
     <interfaceDescription>..</interfaceDescription><adminState>1</adminState><speedAdmin>1000</speedAdmin>
     <reActivate>1</reActivate><duplexAdminMode>3</duplexAdminMode><autoNegotiationAdminEnabled>1</autoNegotiationAdminEnabled>
     <adminAdvertisementList>1000000000000000</adminAdvertisementList><backPressureAdminEnabled>2</backPressureAdminEnabled>
     <flowControlAdminType>1</flowControlAdminType><MDIAdminMode>3</MDIAdminMode></Entry></Standard802_3List>
   <EEEInterfaceList action="set"><Entry><interfaceName>gi1/0/3</interfaceName><EEEAdminStatus>1</EEEAdminStatus></Entry></EEEInterfaceList>
   <EEELLDPInterfaceList action="set"><Entry><interfaceName>gi1/0/3</interfaceName><EEELLDPAdminStatus>1</EEELLDPAdminStatus></Entry></EEELLDPInterfaceList>
   <GreenEthSavingTypeList action="set"><Entry><interfaceName>gi1/0/3</interfaceName><savingType>2</savingType><adminState>1</adminState></Entry></GreenEthSavingTypeList>
  </DeviceConfiguration>
  ```
  The UI drops a field (leaves it undefined) when it equals the value read (`returnChangedFields`) or when its control is disabled. interfaceName is always sent, so a section can go out with nothing but interfaceName. LACPPortList is read-only. There is no bulk/multi-port write: one port per POST.
- Fields (Standard802_3List unless noted):

| field | meaning | values | range/validation | default |
|---|---|---|---|---|
| interfaceName | port name (Pkey) | gi1/0/N, te1/0/N | | |
| interfaceID | ifIndex | int | read-only | |
| interfaceDescription | Description | string | 0-64 chars | "" |
| adminState | Admin Status | 1=Up, 2=Down | | Up |
| linkState | Current Port Status (read-only) | 1=Up, 2=Down, 8=Suspended (Operational Status: 8 -> "Suspended", anything else -> "Active") | | |
| reActivate (written) / reActive (read by the edit JS) | Re-Activate Suspended Port | 1=reactivate, 2=no | checkbox enabled only when linkState==8 | |
| mediaType | 1=copper, 2=fiber, 3=ComboC, 4=ComboF | read-only. Physical Port Type = speed class from `swIfTypeArr[ifIndex]` (1=10M, 2=100M, 3=1000M, 4=10G, 5=Unknown) + "-copper"/"-Fiber"/"-ComboC"/"-ComboF" | | |
| speedAdmin | Admin Speed | 10, 100, 1000, 10000; 0 = not forced (UI treats 0 as 1000 on 1G ports and 10000 on 10G ports) | radios offered: 1G port (swIfType 3) 10/100/1000; 10G port (4) 1000/10000; other 10/100 | port max |
| speedOper | Current Port Speed | Mb/s; 4294967295 or 10000 -> 10G | shown only if linkState!=2 | |
| duplexAdminMode | Admin Duplex | 2=Half, 3=Full (MIB 1=none is shown as Full) | | Full |
| duplexOperMode | Current Duplex | 1=Half, 2=Full (3 Hybrid, 4 Unknown) | | |
| autoNegotiationAdminEnabled | Auto Negotiation | 1=Enabled, 2=Disabled | | Enabled |
| autoNegotiationOperEnabled | current | 1/2 | | |
| adminAdvertisementList | Admin Advertisement, 16-char bit string | char0 Max Capability, 1 unknown, 2 10H, 3 10F, 4 100H, 5 100F, 6 (1000H, unused), 7 1000F, chars 8-15 = 0 | the UI builds 8 bits + "00000000". If no box is checked it sends "10000000"+"00000000". Max Capability clears and disables the other boxes. | Max Capability |
| operAdvertisementList / remoteLinkCapabilities | Current / Neighbor Advertisement | same bit format. char0 -> "Max Capability", char1 -> "Unknown" | shown only when linkState==1 | |
| backPressureAdminEnabled / backPressureOperEnabled | Back Pressure | 1=Enabled, 2=Disabled | | Disabled |
| flowControlAdminType | Flow Control | 1=Enabled, 2=Disabled, 3=Auto-Negotiation | | Enabled (doc) |
| flowControlOperType | current | 1 Enabled, 2 Disabled, 3 Rx Only, 4 Tx Only | | |
| MDIAdminMode | MDI/MDIX | 1=MDIX, 2=MDI, 3=Auto | disabled for fiber (mediaType 2) | Auto |
| MDIOprerMode (sic) | current MDI | 1 MDIX, 2 MDI, 3 Auto | | |
| LAGID | LAG column. The UI ignores it and shows `LACPPortList.actorAdminKey - trunkFirstIndex + 1`, or blank when 0 | | | |
| EEEInterfaceList.EEEAdminStatus | Energy Efficient Ethernet (per port) | 1/2 | | |
| EEELLDPInterfaceList.EEELLDPAdminStatus | EEE LLDP advertisement | 1/2 | | |
| GreenEthSavingTypeList.adminState (savingType=2) | Short-Reach Energy Saving (per port) | 1/2 | savingType 1 = Energy Detect, 2 = Short Reach | |
| LACPPortList.actorAdminKey | LAG membership | int | read-only | |

- Gotchas (enable/disable rules from the JS; reimplement them as validation):
  - Auto-neg Enabled: speed and duplex are disabled and **not sent**. The UI sends speedAdmin and duplexAdminMode only when it sends autoNegotiationAdminEnabled=2. With auto-neg Disabled, the advertisement boxes are disabled.
  - Admin speed 1000: duplex is forced and disabled. The JS forces radio value 2, the "Half" label, which looks like a bug; the value is not sent anyway. 10G ports: duplex is always disabled. The auto-neg radio is disabled on a 10G port when speedAdmin is 10 or 100.
  - Flow control is enabled only when Max Capability, 10 Full or 100 Full is advertised (auto-neg on). Back pressure needs half duplex (Max, 10H or 100H advertised) **and** EEE off. The classic duplex->BP/FC logic is buggy because it tests duplex==1. Implement it as: Half -> BP allowed, FC n/a; Full -> FC allowed, BP off.
  - EEE Enabled -> back pressure forced to 2 and disabled. Back pressure Enabled -> EEE forced to 2 and disabled, and EEE-LLDP disabled. EEE-LLDP is editable only while EEE is Enabled; otherwise it is forced to 2.
  - Fiber (mediaType 2): the advertisement boxes and MDI are disabled.
  - reActivate goes out only when the port is Suspended (linkState 8). This is the manual recovery for ports shut down by port-security, UDLD and similar.
  - Port changes made while the port is a LAG member take effect only after it leaves the LAG (doc).
  - GreenEth short-reach compare bug: it is diffed against the wrong section, so it is always sent while enabled. Harmless.
  - EEE, EEE-LLDP and short-reach are disabled when `curInterfaceID == queryNA` (no data).

### Dashboard wizard "Configure Ports" (Wiz_Configure_Ports)
- Read/write: same URIs, sections and XML as PortConfiguration (the code is a near copy).
- Differences: (1) no `returnChangedFields`, so every enabled field is sent even when unchanged. (2) `changeAdminAdvertisement()` is **not** called on edit-open, so `adminAdvertisementList` stays at its initial `""`, or a stale value from an earlier edit, until the user clicks an advertisement box. It is then POSTed as an empty element (risk: the device may reject it or reset it; inferred). (3) Adds a Close button (modal level 2). (4) The LAG column uses `top.trunkFirstIndex || globalParameters.trunkFirstIndex`. The new UI can drop this page and reuse Port Configuration.

### Dashboard wizard "Configure Port Profile" (Wiz_CPP + tpl/Wiz_CPP_*.htm)
- `Wiz_CPP` (js/Pages/Wiz_CPP.js) is only the read-only "Current port profile configuration" popup. `GET wcd?{PortAppliedMacroList&interfaceType=1}` -> table of interfaceName / appliedMacro. The first row 'Global' is dropped. Close button. It writes nothing.
- The wizard (tpl Wiz_CPP_PortSelection/ProfileConfiguration/Summary) selects **several ports** and posts `wcd?{VLANList}` (the URL is irrelevant) with RemoteCLITable commands, the same mechanism as Port Profile below, but with `interface range <range>`. The range string is built as `<firstPortName>-<lastPortNumber>, ...`, e.g. `gi1/0/1-4, gi1/0/7`.
  - Mode **Assign**: `exit`,`exit`,`config`,[`macro global apply profile-global-<numOfQueue>` if the Global row's appliedMacro is empty],`interface range R`,`macro apply profile-default`,`macro apply profile-<desktop|phone|switch|router|wireless> <params>`
  - Mode **Clear** (remove profile): `exit`,`exit`,`config`,[global as above],`interface range R`,`macro apply profile-default`. Clearing a profile means re-applying profile-default. The UI never sends `no macro`.
  - The wizard checks the global macro correctly via `GET wcd?{PortAppliedMacroList&interfaceName=Global}`. Validation: VLAN ids 1-4094, numeric only. An empty Native VLAN becomes `None`.

### Port Profile (classic: Network Administration > Port Settings > Ports > Port Profile; page port_profile_table)
- Read (list): `GET wcd?{PortAppliedMacroList&interfaceType=1}{CLIMacroList}{CLIMacroContentList}{ConfigInfoStatus}{RemoteCLIOutputTable}`. The UI hides the first row (`interfaceName`=='Global').
- Read (edit): `GET wcd?{PortAppliedMacroList&interfaceName=gi1%2F0%2F3}{Standard802_3List&interfaceName=gi1%2F0%2F3}{CLIMacroList}{CLIMacroContentList}{ConfigInfoStatus}{RemoteCLIOutputTable}`. Standard802_3List is read only to display autoNegotiationOperEnabled.
- Write (apply profile to one port): `POST wcd?{PortAppliedMacroList}{CLIMacroList}{CLIMacroContentList}{ConfigInfoStatus}{RemoteCLIOutputTable}` with remote-CLI commands executed in order:
  ```xml
  <DeviceConfiguration><RemoteCLITable action="set">
    <Entry><commandText>exit</commandText></Entry>
    <Entry><commandText>exit</commandText></Entry>
    <Entry><commandText>config</commandText></Entry>
    <Entry><commandText>macro global apply profile-global-4</commandText></Entry>   <!-- only if no macro applied yet -->
    <Entry><commandText>interface gi1/0/3</commandText></Entry>
    <Entry><commandText>macro apply profile-default</commandText></Entry>
    <Entry><commandText>macro apply profile-phone $access_vlan 10 $voice_vlan 20</commandText></Entry>
  </RemoteCLITable></DeviceConfiguration>
  ```
  - Macro and argument per profile (also listed in metadata `profileArguments`):

| UI profile | macro | params | UI fields used |
|---|---|---|---|
| Desktop | profile-desktop | `$access_vlan <untagged>` | VLAN ID-Untagged |
| Phone | profile-phone | `$access_vlan <untagged> $voice_vlan <tagged>` | Untagged + Tagged |
| Switch | profile-switch | `$native_vlan <id or None>` | Native VLAN checkbox + text |
| Router | profile-router | `$native_vlan <id or None>` | " |
| Wireless | profile-wireless | `$native_vlan <id or None>` | " |

  - `profile-global-<N>`: N = `globalParameters.numOfQueue` (hostparam `bridge_numOfTCPerPort`, default 4). The global macro is applied once, before the first port profile.
  - Remove/clear: the page has no remove action. Use the wizard method (`macro apply profile-default` on the interface).
- Fields:

| field | meaning | values |
|---|---|---|
| PortAppliedMacroList.interfaceName / interfaceType / appliedMacro | port, type, applied macro name ("" = none, e.g. "profile-desktop") | |
| CLIMacroList.macroName / macroType / ParamList | macro catalogue (built-in profile-* macros and their $params). Read but unused by the page | |
| CLIMacroContentList.macroName / ContentList | macro body text. Read, unused | |
| ConfigInfoStatus.state | remote-CLI execution state. "6" = done (Dashboard polls for it) | |
| RemoteCLIOutputTable.id / text | CLI output lines (inferred) | |
| untaggedVID / taggedVID / nativeVID | VLAN args | 1-4094. Native: checkbox unchecked -> `None` |

  - Display-only profile summary, hard-coded in JS (what the macros configure): Desktop = Access mode, port-security Limited Dynamic Lock, max 1, Discard, Fast Link on, BPDU guard on. Phone = General mode, LDL max 2, Discard, Fast Link on, BPDU guard on, policy voice-map. Switch = Trunk, tagged All, native VLAN, P2P, policy switch-map. Router = Trunk, tagged All, native, Fast Link on, BPDU guard on, router-map. Wireless = Trunk, tagged All, native, BPDU guard on, router-map, auto-neg Disabled.
- Gotchas: the page sets `globalMacroApplied` true when *any* row (port rows included) has a macro, so the first apply on a clean switch includes the global macro and later ones skip it. The wizard checks only the Global row, which is the better check. Applying a profile overwrites VLAN, port-security, STP and QoS config on the port. The device returns no structured error. Check RemoteCLIOutputTable / ConfigInfoStatus afterwards (inferred).

### Jumbo Frames (classic: Network Administration > Port Settings > Ports > Jumbo Frames; page switch_jumbo_fr; form page)
- Read: `GET API/switch_jumbo_fr.htm`. Inputs `rlJumboFramesCurrentStatus` and `rlJumboFramesStatusAfterReset` (both rendered disabled). Also `dot1qMaxSupportedVlans` and a dynamic-display tag `(rlJumboFramesCurrentStatus EXISTS)`.
- Write: `POST API/switch_jumbo_fr.htm` body `restoreUrl=..&errorCollector=..&rlJumboFramesStatusAfterReset=1|2`.
- Fields: rlJumboFramesCurrentStatus (read-only, 1=Enabled, else Disabled). rlJumboFramesStatusAfterReset (1=Enabled, 2=Disabled). Jumbo = frames up to 10 KB; otherwise up to 2 KB (doc).
- Gotchas: takes effect only after save config + reboot. Show both "current" and "after reset".

### Protected Ports (classic: Network Administration > Port Settings > Ports > Protected Ports; page protected_ports)
- Read: `GET wcd?{ProtectedPortList&interfaceType=1}` (Ports) or `&interfaceType=2` (LAGs, the "View By" filter). Edit read: `GET wcd?{ProtectedPortList&interfaceName=gi1%2F0%2F3}`.
- Write: `POST wcd?{ProtectedPortList}`
  `<ProtectedPortList action="set"><IfEntry><interfaceName>gi1/0/3</interfaceName><interfaceID>3</interfaceID><interfaceType>1</interfaceType><type>2</type><community>0</community></IfEntry></ProtectedPortList>`. Note the entry element is **IfEntry**. All five fields are always sent.
- Fields: interfaceName, interfaceID (ifIndex), interfaceType (1 port / 2 LAG), type (1=Unprotected, 2=Protected), community (0=Isolated, 1..`protectedPortsCommunities` (hostparam `protected_ports_pp_max_number_of_communities`; doc says 1-30)).
- Gotchas: protected ports cannot talk to each other except within the same community. Unprotected = uplink. A port in a LAG takes the LAG's protection attribute. Mirrored and routed traffic is not subject to it. The community dropdown is always shown and sent, even for Unprotected.

### Port and VLAN Mirroring (classic: Network Administration > Port Settings > Ports > Port and VLAN Mirrorings; page port_mirror; form page)
- Read (list): `GET API/port_mirror.htm`. Rows `portCopySource$repeat?N`, `portCopyDest$repeat?N`, `portCopyDirection$repeat?N`, `portCopyStatus$repeat?N`, plus `ifOperStatus` in the VT. Template RpUrl is `/Data/port_mirror.htm` and its form ACTION is `/Forms/Data/port_mirror.htm`, but the UI fetches and posts `API/port_mirror.htm`.
- Read (add form): `GET API/port_mirror_a.htm`. Read (edit): `GET API/port_mirror_e.htm?Query:portCopySource=<srcIfIndex>@portCopyDest=<dstIfIndex>`.
- Write:
  - Add: `POST API/port_mirror_a.htm` with `portCopySource$add=<src ifIndex>`, `portCopyDest$add=<dest ifIndex>`, `portCopyDirection$add=1|2|3` (VLAN source forced to 1), `portCopyStatus$add=4`, and the template's end marker `PortMirror$end1`. That marker is not disabled, so it is sent with its server value. The JS sets `[name$=endAdd]`=OK, which matches nothing.
  - Edit: `POST API/port_mirror_e.htm` with `portCopySource$query`, `portCopyDest$query`, `portCopyDirection$query` (1 if source is a VLAN). The JS does not enable `PortMirror$endQuery`, but other edit pages send `<VT>$endQuery=OK`, so send `PortMirror$endQuery=OK` (inferred).
  - Delete: `POST API/port_mirror.htm` per selected row i (1-based within the selection) with `portCopySource$repeat?i`, `portCopyDest$repeat?i`, `portCopyStatus$repeat?i=6`. The JS sets `PortMirror$endRepeat?i=OK` but enables a misspelled name (`PortMirrorT$...`), so the marker is never sent. Send `PortMirror$endRepeat?i=OK` (inferred).
- Fields: portCopySource (ifIndex of a port, or a VLAN ifIndex >= 100000), portCopyDest (destination port ifIndex; one destination for all sessions), portCopyDirection (1=Rx Only, 2=Tx Only, 3=Tx and Rx; default 3 for ports; VLAN sources are Rx only, though the list column labels them "Tx and Rx"), portCopyStatus (1 active, 2 notInService, 3 notReady, 4 createAndGo, 5 createAndWait, 6 destroy).
- Gotchas: the destination is chosen in a "Destination Port" filter dropdown before the first add. Once sessions exist it is fixed: it is shown as text and taken from row 0. Source != destination (validated). Destination: not a LAG member, no IP interface, no GVRP, not a VLAN member, only one destination; egress QoS suspended; output is untagged. Sources: up to 8, not LAG members. The destination port stops normal operation (STP, LACP). Primary key = (source, dest).

### Green Ethernet Global Settings (classic: Network Administration > Power Management > Green Ethernet > Global Settings; page GreenEthernetConfiguration)
- Read: `GET wcd?{GreenEthGlobalSetting}{EEEGlobalSetting}` (scalar).
- Write (save): `POST wcd?{GreenEthGlobalSetting}{EEEGlobalSetting}`
  `<EEEGlobalSetting action="set"><EEEEnable>1</EEEEnable></EEEGlobalSetting><GreenEthGlobalSetting action="set"><shrtReachEnbl>1</shrtReachEnbl><nrgDetectEnbl>1</nrgDetectEnbl></GreenEthGlobalSetting>`. nrgDetectEnbl is omitted when `energyDetectSupported` (hostparam `GreenEthernet_ED_is_supported`) is false; the row is hidden too.
- Write (Reset cumulative energy counter, "Reset" button): `POST` same URL, `<GreenEthGlobalSetting action="restore"><cumulativeNrg></cumulativeNrg></GreenEthGlobalSetting>`. The classic confirm text wrongly talks about Energy Detect.
- Fields: EEEEnable (1/2, global EEE), shrtReachEnbl (Link Short-Reach Energy Saving Mode 1/2), nrgDetectEnbl (Energy Detect Mode 1/2), currPwrConsumption (display = round(v/10)/100 W, i.e. v is in mW, inferred), maxPwrConsumption, cumulativeNrg (shown as "<v> (W * H)"), shrtReachThreshold, maskLedState (read, unused). "Power Saving" % = 100 - cur/max*100, shown only when nrgDetectEnbl==1, else 0%.

### Green Ethernet Interface Settings (classic: ... > Green Ethernet > Interface Settings; page GrnEth_InterfaceSettings; read-only)
- Read: `GET wcd?{GreenEthSavingTypeList}{EEEInterfaceList}{CableTestPortList}` (bulk, NotEditable).
- Fields: EEEInterfaceList: interfaceName, interfaceType, interfaceID, EEESupported, EEEAdminStatus, EEEOperStatus (1/2), EEERemoteStatus (Remote Peer 1/2). GreenEthSavingTypeList: **two rows per port**: savingType 1=Energy Detect, 2=Short-Reach. Each row has adminState, operState (1/2) and reason (Fault Reason: 1 Not Present, 2 Link Type, 3 Link Up, 4 Link Speed, 5 Link Length, 6 Errors Detected, 7 Link Down, 8 ""). CableTestPortList: interfaceName, testType, status, resultVal, resultUnits, alarmLevel, testDate. Cable length is taken from the row with testType==4 && resultUnits==13; resultVal 0 Not Detected, 1 <50m, 2 50-80, 3 80-110, 4 110-140, 5 >140.
- Gotchas: rows are joined by interfaceName; the JS walks EEEInterfaceList by index in step with the de-duplicated GreenEth names. Per-port EEE and short-reach admin are edited in Port Configuration.

### Green Ethernet LLDP Ethernet Details (classic: ... > Green Ethernet > LLDP Ethernet Details; page GrnEth_InterfaceDetails; read-only)
- Read: `GET wcd?{EEELLDPLocalInterfaceList}{EEELLDPRemoteInterfaceList}{EEEInterfaceList}`.
- Fields (µs): EEELocaResolvedTx (sic), EEELocalTx, EEELocaResolvedRx (sic), EEELocalRx (local list), EEERemoteTx, EEERemoteRx (remote list), EEEOperStatus (2 -> Disabled and all timers "N/A", else Enabled). Lists are joined by index.

### Storm Control (classic: Network Administration > Security > Storm Control; page port_parameters_table; form page)
- Read (list): `GET API/port_parameters_table.htm?[stormCtrlTable]Filter:(ifOperStatus!=6)` (skips not-present ports). Row fields `dot1dBasePort$repeat?N`, `rlStormCtrlBroadcastEnable$repeat?N`, `rlStormCtrlMulticastEnable$repeat?N`, `rlStormCtrlBroadcastRate$repeat?N`, plus SetDefault*/UnknownUnicast* columns.
- Read (edit): `GET API/port_parameters_table_e.htm?Query:dot1dBasePort=<n>`.
- Write: `POST API/port_parameters_table_e.htm` (the edit URI). Body: the changed fields among `rlStormCtrlBroadcastEnable$query`, `rlStormCtrlMulticastEnable$query`, `rlStormCtrlBroadcastRate$query`, plus pkey `dot1dBasePort$query=<n>` and `stormCtrlTable$endQuery=OK`. All `$query` inputs are rendered disabled; the Save enables only these.
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| dot1dBasePort | port (bridge port no.) | | | |
| rlStormCtrlBroadcastEnable | Broadcast Control | 1=Enabled, 2=Disabled | | Disabled (inferred) |
| rlStormCtrlMulticastEnable | Broadcast Mode | 1=Multicast & Broadcast, 2=Broadcast Only | | |
| rlStormCtrlBroadcastRate | Broadcast Rate Threshold, Kbit/s | int | by `swIfTypeArr[port]`: 100M (2): 70-100000; 1G (3): 3500-1000000; 10G (4): 8500-10000000 | |
| rlStormCtrlUnknownUnicastEnable, rlStormCtrlSetDefault{Broadcast,Multicast,UnknownUnicast}Enable, rlPhdPortsModuleNumber, rlPhdPortsIfIndexName, ifOperStatus | read, not shown or written | | | |

### Port Security (classic: Network Administration > Security > Port Security; page port_security_table; form page)
- Read (list): `GET API/port_security_table.htm?[swIfVT]Filter:((swIfIndex>=S)&&(swIfIndex<E))`. Ports: S = first port ifIndex, E = S + port count. LAGs ("View By"): S = trunkFirstIndex, E = S + NumberOfTrunks. Rows: `swIfIndex$repeat?N`, `swIfLockOperStatus`, `ifOperStatus`, `swIfLockLimitationMode`, `swIfLockAdminStatus`, `swIfLockMaxMacAddresses`, `swIfAdminLockAction`, `swIfAdminLockTrapEnable`, `swIfLockAdminTrapFrequency`, `swIfStatus`, `swIfHostMode` (`$repeat?N`). The template also holds swIfPortLock range VTs, which are unused.
- Read (edit): `GET API/port_security_table_e.htm?Query:swIfIndex=<ifIndex>`.
- Write: `POST API/port_security_table_e.htm`. The template leaves `swIfVT`, `swIfVT$query`, `swIfIndex$query`, `swIfLockAdminStatus$query`, `swIfAdminLockTrapEnable$query` and `swIfVT$endQuery` **enabled**, so they always go out with their (edited) values. The JS also enables:
  - Set Port = Unlocked (2): `swIfLockAdminStatus$query=2`, `swIfAdminLockAction$query=<sel>`, `swIfAdminLockTrapEnable$query=2`, `swIfLockAdminTrapFrequency$query=10`, `swIfLockLimitationMode$query=1|2`, and `swIfLockMaxMacAddresses$query` only if mode=2.
  - Set Port = Locked (1): `swIfLockAdminStatus$query=1`, `swIfAdminLockTrapEnable$query`, `swIfAdminLockAction$query`, and `swIfLockAdminTrapFrequency$query` only if trap=1.
  - Always `swIfIndex$query=<ifIndex>`.
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| swIfLockOperStatus | Current Port Status | 1=Locked, 2=Unlocked | ro | |
| swIfLockAdminStatus | Set Port | 1=Locked, 2=Unlocked | | Unlocked |
| swIfLockLimitationMode | Learning Mode | 1=Classic Lock, 2=Limited Dynamic Lock (list: other -> "None") | editable only when Unlocked | Classic (inferred) |
| swIfLockMaxMacAddresses | Max Entries | int | 0-256; only with Limited Dynamic Lock + Unlocked | |
| swIfAdminLockAction | Action on Violation | 1=Discard, 2=Forward, 3=Shut Down | editable only when Locked | Discard |
| swIfAdminLockTrapEnable | Trap | 1=Enabled, 2=Disabled | editable only when Locked | Disabled |
| swIfLockAdminTrapFrequency | Trap Frequency, seconds | int | 1-1000000; only when trap=1 | 10 |
| swIfHostMode | 802.1X host mode (1 single host) | | ro | |

- Gotchas: two-step workflow. Configure the learning mode and max while Unlocked and save, then edit again and Lock with action and trap (doc). If the port is a Port (not a LAG) and swIfHostMode==1 (802.1X single-host), the UI refuses to change action, trap or lock status ("These parameters cannot be set in single host mode."). Shut Down suspends the port; reactivate it from Port Configuration. The page's Remove handler is copy-pasted ARP-inspection code and is unused (no remove button).

### Proprietary Protocol Filtering (classic: Network Administration > Security > ACL and ACE > Proprietary Protocol Filtering; page proprietary_protocol_filterring; form page)
- Read (list): `GET API/proprietary_protocol_filterring.htm?[protocolFilterVTable]Filter:((ifIndex>=S)&&(ifIndex<E))`, with the same Ports/LAGs ranges as Port Security. Rows `ifIndex$repeat?N`, `rlProtocolFilteringList$repeat?N`, `rlProtocolFilteringRowStatus$repeat?N`, `rlPhdPortsModuleNumber`, `rlPhdPortsIfIndexName`, `ifOperStatus`.
- Read (edit): `GET API/proprietary_protocol_filterring_e.htm?[protocolFilterVT]Query:ifIndex=<ifIndex>`. If no filter row exists, `ifIndex$query` comes back blank ("" or " ") and the port counts as "not installed".
- Write: `POST API/proprietary_protocol_filterring_e.htm`. The `_e` template has `protocolFilterVTable`, `protocolFilterVTable$query`, `ifIndex$query`, `rlProtocolFilteringList$query`, `rlProtocolFilteringRowStatus$query` and `protocolFilterVTable$endQuery` enabled. The `$add` group (`ifIndex$add`, `rlProtocolFilteringList$add`, `rlProtocolFilteringRowStatus$add`, `protocolFilterVTable$endAdd`) starts disabled.
  - No row yet, bits != 0 (create): the JS disables `ifIndex$query`, `rlProtocolFilteringList$query` and `rlProtocolFilteringRowStatus$query`, then sends `ifIndex$add=<ifIndex>`, `rlProtocolFilteringList$add=<bits>`, `rlProtocolFilteringRowStatus$add=4`. The JS disables `protocolFilterVT$query` and `$endQuery`, wrong names, so the `protocolFilterVTable$query` and `$endQuery` inputs still go out. It never enables `protocolFilterVTable$endAdd`; probably send `=OK` (inferred).
  - Row exists, bits == 0 (remove): `ifIndex$query=<ifIndex>`, `rlProtocolFilteringRowStatus$query=6`, `protocolFilterVTable$endQuery`.
  - Row exists, bits != 0 (change): one POST that destroys and recreates: `ifIndex$query`, `rlProtocolFilteringRowStatus$query=6`, plus `ifIndex$add`, `rlProtocolFilteringList$add=<bits>`, `rlProtocolFilteringRowStatus$add=4`.
- Fields: rlProtocolFilteringList = 8-char bit string. char0 All, 1 CDP (0100.0ccc.cccc/0x2000), 2 VTP (0x2003), 3 DTP (0x2004), 4 UDLD (0x0111), 5 PaGP (0x0104), 6 SSTP (0100.0ccc.cccd), 7 unused. UI "Blocked Protocol": None (no row) / Block All ("10000000") / Select Protocols (transfer box). Default: no filtering.
- Gotchas: the transfer box offers only CDP, VTP, DTP, UDLD and PaGP. **SSTP cannot be selected** (loop bound bug), though the list column can display it. You cannot enable a QoS ACL on a port that has a protocol filter (doc).

### TCP Congestion Avoidance (classic: Network Administration > Quality of Service > Global Settings > TCP Congestion Avoidance; page tcp_congestion; form page)
- Read: `GET API/tcp_congestion.htm`. Inputs: `rlWeightedRandomTailDropCurrentStatus` (disabled) and `rlWeightedRandomTailDropStatusAfterReset` (enabled). The ScalarData dataID says `TCPSetting.` but the value is the form input.
- Write: `POST API/tcp_congestion.htm` body `restoreUrl=..&errorCollector=..&rlWeightedRandomTailDropStatusAfterReset=0|1`. The template's own form ACTION is `/Forms/API/QoS_TCP_Congestion_Avoidance.htm`; the UI ignores it.
- Fields: rlWeightedRandomTailDropStatusAfterReset. **Inverted: 0=Enabled, 1=Disabled** (any value other than 1 displays as Enabled). The current status is not displayed.
- Gotchas: needs save config + reboot. The UI shows a confirm warning that it increases network traffic.

### UDLD Global Settings (classic: Network Administration > Port Settings > UDLD > UDLD Global Settings; page udldGlobalSettings)
- Read: `GET wcd?{UDLDGlobalSetting}` (scalar).
- Write (generic save): `POST wcd?{UDLDGlobalSetting}` `<UDLDGlobalSetting action="set"><messageTime>15</messageTime><UDLDState>3</UDLDState></UDLDGlobalSetting>`.
- Fields: messageTime (Message Interval, s; 1-90; default 15; also used by copper ports; expiration = 3x). UDLDState (Fiber Port UDLD Default State: 1=Normal, 2=Aggressive, 3=Disabled; default Disabled; applies to fiber ports only). Normal shuts the port on a unidirectional link and notifies on undetermined. Aggressive also shuts on undetermined.

### UDLD Interface Settings (classic: ... > UDLD > UDLD Interface Settings; page udldInterfaceSettings)
- Read: `GET wcd?{UDLDInterfaceSettingList}` (bulk). Edit read: `GET wcd?{UDLDInterfaceSettingList&interfaceName=gi1%2F0%2F3}`.
- Write (generic save): `POST wcd?{UDLDInterfaceSettingList}` `<UDLDInterfaceSettingList action="set"><Entry><interfaceName>gi1/0/3</interfaceName><UDLDState>4</UDLDState></Entry></UDLDInterfaceSettingList>`.
- Legacy copy (API/udld_intefrace_settings_m_jq.htm; tpl/UdldInterfaceSettings.htm is just a generic Handlebars div-table): "Copy Parameters from" posts the same section with several `<Entry>`s, each carrying the source port's UDLDState. This proves that a **multi-port set in one POST works**.
- Fields: UDLDState (1=Normal, 2=Aggressive, 3=Disabled, 4=Default = follow global for fiber; copper ports default to disabled). UDLDOperState (not in dataSource but read; for Default on fiber ports (transceiver type 2/4) it is shown as "<oper> (Default)"). bidirectionalState (1 Shutdown, 2 Idle, 3 Detection, 4 Undetermined, 5 Bidirectional). numberOfNeighbors.
- Gotchas: a port shut down by UDLD is reactivated via Port Configuration > Re-Activate Suspended Port (or auto-recovery). UDLD runs independently of STP and LACP. When the port goes down UDLD clears its neighbors.

### UDLD Neighbors (classic: ... > UDLD > UDLD Neighbors; page UDLDNeighbors; read-only)
- Read: `GET wcd?{UDLDNeighborList}`. NotEditable: the metadata buttons list add/remove/edit, but they are inactive.
- Fields: interfaceName (local port), deviceID, deviceMAC, deviceName, portName (remote Port ID), neighborCurrentState (1 Disabled, 2 Enabled, 3 Undefined, 4 Bidirectional; the doc's state names differ), expirationTime (s, 3x message time), messageTime (s).


## VLAN (Standard VLAN, LAG VLAN pages, VLAN wizards)

Conventions used by all VLAN pages:
- Interface ifIndex: port gi1/0/N = N; LAG n = trunkFirstIndex + n - 1 (globalParameters; typically 1000-based, inferred); VLAN interface = 99999 + VID (interface.js).
- VLAN lists are range strings `1,5,10-20` (VIDs 1-4094). Classic code parses/produces them with splitStrToArr / arrToRangeStr.
- Every value in a wcd POST must be a **string**: json2xml writes a JS number as an empty element (it iterates `for (f in 10)` and gets nothing).
- `null` / `""` values become empty elements `<field></field>` (used for `restore`); `undefined` drops the element.
- Several `set`/`delete`/`restore` blocks for the same section can go in one POST; `post._order` sets their order (the wizard sends delete, then set, then restore). When `_order` is present, only the section/action pairs it lists are serialized.
- Write responses are XML with `ActionStatus/statusCode` (0 = OK) and `statusString`. Error details are in `localMsg/msgId` plus `arg` elements. Form pages return errors in the hidden input `mibError`.

### VLAN list / create / rename / delete (classic: Network Administration > VLAN > Standard VLAN > VLAN Membership, buttons Add / Edit / Remove)
- Read VLAN IDs: `wcd?{VLANCurrentStatus}`. Returns `currentVLANs` (range string) and `currentVLANsNumber`. `wcd?{VLANStaticStatus}` returns `staticVLANs` (range string of static, user-created VLANs).
- Read names: `wcd?{VLANList}`. Each entry has `VLANID, VLANName, authorizationType, VLANType`. The classic UI only fetches names when there are fewer than 20 VLANs, so this read is probably slow (inferred).
- Read one VLAN with members: `wcd?{LACPPortList&filter=actorAdminKey>0}{VLANCurrentStatus}{VLANMembershipList&VLANID=<vid>}`.
  - Entry fields: `VLANID, VLANName, authorizationType, VLANType, MembershipList`.
  - Each `MembershipList` item has `interfaceType` (1=port, 2=LAG), `interfaceID` (port number or LAG number) and `taggingMode` (`1`=untagged, anything else=tagged).
  - This is the only per-VLAN membership read. It returns one VLAN per request.
- Add (Add button): `VLANList` action `set` (not `add`): `<VLANList action="set"><VLAN><VLANID>10</VLANID><VLANName>x</VLANName><authorizationType>1</authorizationType></VLAN></VLANList>`
- Edit: `VLANList` action `set`, sending `VLANID, VLANName, VLANType, authorizationType`.
- Delete: `<VLANList action="delete"><VLAN><VLANID>10</VLANID></VLAN></VLANList>`
- Bulk: the VLAN wizard (tpl/Wiz_VLAN_Summary.htm) sends many `<VLAN>` entries in one `VLANList` set, plus one `VLANList` delete, in a single POST, with `_order` = delete then set. It sends `authorizationType="1"` for every entry.

| field | meaning | values | range | default |
|---|---|---|---|---|
| VLANID | VID | | 2-4094 when adding (1 is the default VLAN and can't be deleted; 4095 is the discard VLAN) | |
| VLANName | name | | 0-32 chars | "" |
| VLANType | Status | 1=Other (default VLAN), 2=Static, 3=Dynamic (GVRP) | the classic UI disables the radio when the type is 1 or 2; effectively read-only | |
| authorizationType | "Authentication Not Required" (802.1X unauthenticated VLAN) | VLANMembership.js: 2=Enabled, 1=Disabled. VLANLagMembership.js has the labels swapped (1=Enabled). Trust the port page; the wizard sends 1 (= Disabled) | | 1 (Disabled) |

Gotchas:
- **The classic VLAN Membership page never writes membership.**
  - Its port grid is read-only. Clicked ports only collect into localStorage `WizLocalJson`, and nothing posts them.
  - Classic help says: "Ports are assigned to a VLAN in the VLAN Port Settings page."
  - There is no per-VLAN or matrix write for 802.1Q membership anywhere in this firmware's UI. The only bitmap-style write is Private VLAN membership (see below).
- `VLANMembershipList` action `set` is never used by the classic UI. Whether it accepts a `MembershipList` is untested (inferred: probably not).

### VLAN LAG Membership (classic: Network Administration > Spanning Tree and LAG > Link Aggregation (LAG) > VLAN LAG Membership)
- This is the same page as VLAN Membership, but it shows only the LAG sockets (MembershipList items with `interfaceType=2`).
- It only has Add and Edit (no Remove). Edit shows Status as read-only text, and Save maps it back to 2/3/1.
- Read and write are the same as above (`VLANList` set).

### VLAN Port Settings: per-port 802.1Q config (classic: Network Administration > VLAN > Standard VLAN > VLAN Port Settings; LAG twin: ... > Link Aggregation (LAG) > VLAN LAG Settings = vlan_lag_table)
- Read table (bulk, light): `wcd?{VLANInterfaceISLiteList&interfaceType=1}{VLANStaticStatus}` (`interfaceType=2` for LAGs).
  - **The response element is `<VLANInterfaceISList>`, not `...LiteList`** (Wiz_LAG_Summary.htm reads `tmpl.VLANInterfaceISList` from the Lite query).
  - Table columns read from it: `interfaceName, switchportModeAdmin, generalPVID, generalFrameType, generalIngressFiltering, internalVIDOper, internalVIDAdmin, interfaceID`. The LAG page also reads hidden `generalUntaggedVLANs/generalTaggedVLANs/generalForbiddenVLANs`.
  - Lite is probably the fast alternative to the 24 s full bulk read (inferred). Whether it returns the trunk lists is unknown.
- Read one: `wcd?{VLANInterfaceISList&interfaceType=1&interfaceName=gi1%2F0%2FN}{VLANStaticStatus}`
- Read all with full lists:
  - `wcd?{VLANInterfaceActiveModeISList&interfaceType=1}{VLANMembershipInterfaceList&interfaceType=1}`, used by the Wiz_VLAN_Configuration table.
  - Its fields: `interfaceName, switchportModeAdmin, generalPVID, accessPVID, trunkNativeVID, trunkNativeVIDStatus, accessMulticastTVVID, generalFrameType, generalIngressFiltering, generalTaggedVLANs, generalUntaggedVLANs, generalForbiddenVLANs, trunkActiveMemberVLANs, trunkInactiveMemberVLANs` (fields of the active mode only; inferred).
  - It is a candidate bulk read for all modes and lists. Speed is untested.
- `VLANMembershipInterfaceList&interfaceType=1|2`: `interfaceName, currentTaggedVLANs, currentUntaggedVLANs, portVLANMode (10/11/12/...), staticTaggedVLANs, staticUntaggedVLANs` (static* are used by VLANPortSetting.js).
- Write: one `VLANInterfaceISList` POST whose entries are `<Entry>` elements. The classic Save builds up to 3 blocks, in this key order:
  1. `<VLANInterfaceISList action="delete"><Entry><interfaceName>gi1/0/N</interfaceName><generalTaggedVLANs>removed</generalTaggedVLANs><generalUntaggedVLANs>..</generalUntaggedVLANs><generalForbiddenVLANs>..</generalForbiddenVLANs><trunkMemberVLANs>..</trunkMemberVLANs></Entry></VLANInterfaceISList>`. It lists only the VLANs the user removed from the list.
  2. `<VLANInterfaceISList action="restore"><Entry><interfaceName>..</interfaceName><internalVIDAdmin></internalVIDAdmin>...</Entry></VLANInterfaceISList>`. This resets the named fields to their defaults (Reserve VLAN set to None, Multicast TV VID None, customerVID None). The LAG page sends the fields to restore as empty elements. The port page sends only interfaceName (classic bug: it would restore... unclear) — **send the field names as the LAG page does**.
  3. `<VLANInterfaceISList action="set"><Entry>interfaceName, switchport, switchportModeAdmin, + mode fields + ADDED list items + every other non-empty field copied from the read</Entry></VLANInterfaceISList>`.
  - The port page has no `_order`, so blocks are serialized in insertion order: delete, restore, set.
- List fields are incremental: `set` adds the given VIDs and `delete` removes them. To replace a list, send `delete` with `trunkMemberVLANs=1-4094` before `set`, as the wizard does in Trunk mode.
- Bulk write (classic VLAN wizard, tpl/Wiz_VLAN_Summary.htm `wizVlanConfpPost`):
  - It sends **one `<Entry>` per port in a single POST**: N `<Entry>`s in one `set` block, plus (Trunk) N `<Entry>`s in one `delete` block. `_order` is VLANList delete, VLANList set, VLANInterfaceISList delete, set, restore.
  - Access entry: `{switchportModeAdmin:"11", accessPVID:vid}`.
  - General entry: `{switchportModeAdmin:"10", generalPVID, generalFrameType, generalIngressFiltering, generalTaggedVLANs, generalUntaggedVLANs}`. It does not clear the old general lists (they keep accumulating).
  - Trunk entry: `{switchportModeAdmin:"12", trunkNativeVID, trunkMemberVLANs}` plus a `delete` `{trunkMemberVLANs:"1-4094"}` first.
  - "Clear" sends `restore` entries with all of these as empty elements: `switchport, switchportModeAdmin, generalPVID, generalFrameType, generalIngressFiltering, generalTaggedVLANs, generalUntaggedVLANs, generalForbiddenVLANs, accessPVID, accessMulticastTVVID, trunkNativeVID, trunkMemberVLANs, customerVID`. That resets the port to its default VLAN config.
  - POST URL: `wcd?{VLANList}`.
  - The LAG wizard (Wiz_LAG_Summary.htm) does the same for LAGs, with `interfaceName = "LAG"+id` (so "LAG1" form is accepted, inferred), together with LAGList set.
- **Fastest way to set a VLAN on many ports:** one POST containing a `VLANInterfaceISList` set with an `<Entry>` per port, plus, when replacing lists, a preceding delete with an `<Entry>` per port.
- To give a VLAN to many ports at once (the per-VLAN view): send `set` with `trunkMemberVLANs=<vid>` (or `generalTaggedVLANs` / `generalUntaggedVLANs`) on every port that should have it, and `delete` with the same field on every port that should lose it. Both go in one POST. Port mode must allow it (Trunk lists / General lists; Access takes accessPVID only).

| field | meaning | values | range | default |
|---|---|---|---|---|
| interfaceName | key | gi1/0/N, or po<n>/"LAG<n>" for LAGs (inferred) | | |
| interfaceType / interfaceID | 1=port, 2=LAG / number | read-only (the classic UI sends them back in `set`) | | |
| switchport | Switchport mode (shown only if globalParameters.displayRouter) | 1=Layer 2, 2=Layer 3 (then switchportModeAdmin="0") | | 1 |
| switchportModeAdmin | Port VLAN Mode | 10=General, 11=Access, 12=Trunk, 15=Customer, 13=Private VLAN Promiscuous, 14=Private VLAN Host | | 11 Access (inferred from "default VLAN PVID") |
| internalVIDAdmin | Reserve VLAN for Internal Use | VID, or "" for None (restore) | 1-4094 | None |
| internalVIDOper / internalVLANReservedOper / internalVLANActiveOper | Current Reserved VLAN; ReservedOper=="2" means none is shown | read-only | | |
| generalPVID | PVID (General mode) | | 1-4095 (4095 = discard) | 1 |
| generalFrameType | Frame Type | 1=Admit All, 2=Admit Tagged Only, 3=Admit Untagged Only | | 1 |
| generalIngressFiltering | Ingress Filtering | 1=Enabled, 2=Disabled | | 1 |
| generalTaggedVLANs / generalUntaggedVLANs / generalForbiddenVLANs | General-mode membership (T/U/F) | range string; incremental | each VID must already exist ("cannot be added to non-existing VLANs in General mode") | "" |
| accessPVID | Access VLAN | VID; "0" = none (the classic UI sends "0" when the list is empty) | 1-4094 | 1 |
| accessPVIDStatus | 2 = inactive (shown as "(I)") | read-only | | |
| accessMulticastTVVID / ...Status | Multicast TV VLAN on an access port; restore → None | "0"=None | 1-4094 | None |
| trunkNativeVID / trunkNativeVIDStatus | Native VLAN (untagged on trunk); "0"=None; Status 2=inactive | | 1-4094 | 1 (inferred) |
| trunkMemberVLANs | trunk allowed (tagged) list; incremental | range string | | |
| trunkInactiveMemberVLANs / trunkActiveMemberVLANs | read-only; members whose VLAN doesn't exist get "(I)" | | | |
| customerVID / customerVIDStatus | Customer (Q-in-Q) VLAN; "0"=None | | 1-4094 | None |
| customerMemberMulticastTVVLANs / customerActive... / customerInactive... | read-only | | | |
| VLANStaticStatus.staticVLANs | static VLANs (used to validate General adds) | range | | |

Gotchas:
- Mode-specific UI rules: Access allows exactly 1 VLAN. Trunk enables Native VID. Customer enables Customer VID. Private VLAN modes disable everything except Reserve VLAN. Layer 3 disables every field.
- Classic UI checks: Multicast TV VID must not equal the access VLAN ("already a member in static VLAN"), and the VLAN list must parse to 1-4094.
- The classic Save sends `set` with every field copied from the read: `interfaceType`, `interfaceID`, `internalVIDOper` and the rest. Sending just `interfaceName` plus the changed fields works (the wizard does exactly that).
- The classic Port Settings page never resets `restoreArr`/`addArr` between saves (bug). Don't copy that.
- Help: "In Access mode, a port can only be a member in a single VLAN — remove the current VLAN before adding." The new UI can just `set` a new accessPVID (the wizard does), presumably OK (inferred).
- VLANPortSetting (Voice VLAN > Port Setting, see voice section) also touches VLANInterfaceISList: it sends set or delete with `generalTaggedVLANs=<voiceVID>`, or delete with `trunkMemberVLANs=<voiceVID>`.

### Private VLAN (classic: Network Administration > VLAN > Standard VLAN > Private VLAN). FORM page
- Read list:
  - `GET API/switch_private_vlan.htm` → rows `vlanPrivateVid$repeat?N, vlanPrivateType$repeat?N, vlanPrivatePrimaryVid$repeat?N, vlanPrivateStatus$repeat?N` (VT name `vlanPrivateVT`).
  - Filter by primary: `API/switch_private_vlan.htm?[vlanPrivateVT]Filter:(vlanPrivatePrimaryVid=<vid>)`.
- Assign (add):
  - `GET API/switch_private_vlan_a.htm`, then `POST API/switch_private_vlan_a.htm` with `vlanPrivateVid$add=<vid>`, `vlanPrivateType$add=1|2`, `vlanPrivateStatus$add=4`, `vlanPrivateVT$endAdd=OK`.
  - If Associate is checked (isolated → primary), also send `vlanPrivateMapPrimaryVid$add=<primary>`, `vlanPrivateMapSecondaryVid$add=<vid>`, `vlanPrivateMapStatus$add=4`, `privateMapVT$endAdd=OK`.
- Edit:
  - `GET API/switch_private_vlan_e.htm?Query:vlanPrivateVid=<vid>`, then POST `API/switch_private_vlan_e.htm`.
  - Change type: `vlanPrivateVid$repeat?1, vlanPrivateType$repeat?1, vlanPrivateVT$endRepeat?1=OK`. Add association via the `$add` map fields as above.
  - Remove an association: `vlanPrivateMapPrimaryVid$repeat?1=<old primary>, vlanPrivateMapSecondaryVid$repeat?1=<vid>, vlanPrivateMapStatus$repeat?1=6, privateMapVT$endRepeat?1=OK`.
- Remove (several at once):
  - POST `API/switch_private_vlan.htm`. For each selected row i (1-based): `vlanPrivateVid$repeat?i=<vid>, vlanPrivateStatus$repeat?i=6, vlanPrivateVT$endRepeat<i>=OK`.
  - Note the classic UI writes `endRepeat<i>` without the `?`; the form inputs are named `vlanPrivateVT$endRepeat` (+?i inferred).
- Membership (a per-VLAN bitmap write):
  - `GET API/switch_private_vlan_m.htm?Query:...` (GetMembershipDataURI `switch_private_vlan_m.htm?Query:(&query)`) → `vlanPrivateMapTable` rows (`vlanPrivateMapPrimaryVid$repeat?, vlanPrivateMapSecondaryVid$repeat?, vlanPrivateMapPrimaryPorts$repeat?, vlanPrivateMapSecondaryPorts$repeat?`) plus `vlanPortModeTable` rows (`ifIndex$repeat?, vlanPortModeState$repeat?`). It also reads `wcd?{LACPPortList...}` for LAGs.
  - POST `API/switch_private_vlan_m.htm` with `vlanPrivateMapPrimaryVid$repeat?1=<primary>, vlanPrivateMapSecondaryVid$repeat?1=<isolated>, vlanPrivateMapPrimaryPorts$repeat?1=<hex>, vlanPrivateMapSecondaryPorts$repeat?1=<hex>, vlanPrivateMapVT$endRepeat?1=OK`.
  - Port bitmaps: a hex string, MSB first, where bit (ifIndex-1) is the port and LAGs follow the ports (`bitsAsCharsToOctet`/`octetToBitsAsChars` in globalFunctions.js). The whole bitmap is written each time.
  - Port type comes from the 2 bits: primary=1,secondary=0 → P Promiscuous; 0,1 → H Host (Isolated); 1,1 → C Conditional (operational state follows Port VLAN Mode); 0,0 → None.

| field | meaning | values |
|---|---|---|
| vlanPrivateVid | Private VLAN ID (existing VLAN) | VID |
| vlanPrivateType | Private VLAN Type | 1=Primary, 2=Isolated |
| vlanPrivatePrimaryVid | associated primary (Isolated only) | VID; 0=none |
| vlanPrivateStatus / vlanPrivateMapStatus | RowStatus | 4=createAndGo, 6=destroy |
| Multicast Forwarding Mode (membership page) | per-port option | 1=Host, 2=Promiscuous, 3=Conditional, 0=None |

Gotchas:
- Associate Primary is only allowed when the type is Isolated, and only if some primary VLAN exists.
- Port Membership requires the port to be in Private VLAN Host/Promiscuous mode (VLAN Port Settings 13/14; inferred from "Conditional ... depends on Port VLAN Mode").

### Protocol Group (classic: ... > Standard VLAN > Protocol Group). FORM page
- Read: `GET API/protocol_group_table.htm` → rows `dot1vProtocolTemplateFrameType$repeat?N, dot1vProtocolTemplateProtocolValue$repeat?N, dot1vProtocolGroupId$repeat?N` (VT `Proto_Group`).
- Add: `GET/POST API/protocol_group_add.htm` with `dot1vProtocolTemplateFrameType$add, dot1vProtocolTemplateProtocolValue$add, dot1vProtocolGroupId$add, dot1vProtocolGroupRowStatus$add=4, Proto_Group$endAdd=OK`.
- Edit (group ID only):
  - `GET API/protocol_group_table_e.htm?Query:dot1vProtocolTemplateFrameType=<ft>@dot1vProtocolTemplateProtocolValue=<pv>`.
  - Then POST with `dot1vProtocolGroupId$query=<id>, dot1vProtocolGroupRowStatus$query=1, Proto_Group$endQuery=OK`.
- Remove (several): POST `API/protocol_group_table.htm` with, for each row i: `dot1vProtocolTemplateFrameType$repeat?i, dot1vProtocolTemplateProtocolValue$repeat?i, dot1vProtocolGroupRowStatus$repeat?i=6, Proto_Group$endRepeat?i=OK`.

| field | values | range |
|---|---|---|
| FrameType | 1=Ethernet, 2=RFC1042, 5=LLC Other (for RFC1042 and LLC Other only the custom hex value is allowed) | |
| ProtocolValue | presets 0800 IP, 8137 IPX, 86dd IPv6, 0806 ARP, or custom 4-hex | 0600-FFFF (4 hex digits; default text 0800) |
| GroupId | | 1-2147483647 |

The firmware may imply ARP when IP is chosen, and vice versa (help).

### Protocol Port: protocol-based VLAN classification (classic: ... > Standard VLAN > Protocol Port). FORM page
- Read: `GET API/protocol_port.htm`.
  - `dot1vProtocolPortTable` rows: `dot1dBasePort$repeat? (ifIndex), rlPhdPortsIfIndexName$repeat?, dot1vProtocolPortGroupId$repeat?, dot1vProtocolPortGroupVid$repeat?, vlanPortModeState$repeat?, dot1vProtocolPortRowStatus$repeat?` (VT `Proto_Port`).
  - Plus `VlanNameVT` (dot1qVlanStaticTable: `dot1qVlanIndex$repeat?, dot1qVlanStaticName$repeat?`).
- Add: `GET/POST API/protocol_port_a.htm` (the GET also lists groups and VLANs) with `dot1dBasePort$add=<ifIndex>, dot1vProtocolPortGroupId$add=<group>, dot1vProtocolPortGroupVid$add=<vid>, dot1vProtocolPortRowStatus$add=4, Proto_Port$endAdd=OK`.
- Edit VID: `API/protocol_port_e.htm`. POST `dot1dBasePort$query, dot1vProtocolPortGroupId$query, dot1vProtocolPortGroupVid$query=<vid>, Proto_Port$endQuery=OK`.
- Remove (several): POST `API/protocol_port.htm` with, for each row i: `dot1dBasePort$repeat?i, dot1vProtocolPortGroupId$repeat?i, vlanPortModeState$repeat?i=1, dot1vProtocolPortRowStatus$repeat?i=6, Proto_Port$endRepeat?i=OK`.
- Fields: Interface (port or LAG ifIndex), Group ID (an existing group), VLAN ID 1-4094 (or picked by VLAN name).
- Only General-mode ports qualify (help). The VLAN must already exist.

### GVRP Parameters (classic: ... > Standard VLAN > GVRP Parameters)
- Read: `wcd?{VLANGlobalSetting}{GVRPInterfaceTable&interfaceType=1}` (2=LAGs). Edit read: `wcd?{VLANGlobalSetting}{GVRPInterfaceTable&interfaceName=..}`.
- Write global: `<VLANGlobalSetting action="set"><GVRPEnable>1|2</GVRPEnable></VLANGlobalSetting>` (scalar section, no entry wrapper).
- Write port: `<GVRPInterfaceTable action="set"><Entry><interfaceName/><GVRPEnable/><VLANCreationEnable/><VLANRegistrationEnable/></Entry></GVRPInterfaceTable>`. All 3 fields are sent together.
- Values: 1=Enabled, 2=Disabled for all four. Defaults: global Disabled; per port GVRP Disabled, creation Enabled, registration Enabled (inferred from usual Dell defaults).
- Only applies to General or Trunk interfaces (page header).

### GARP Timers (classic: ... > Standard VLAN > GARP Timers). FORM page
- Read: `GET API/garp_timers_table.htm?Filter:(ifOperStatus!=6)` for ports. For LAGs: `?Filter:((dot1dBasePort>=<trunkFirst>)&&(dot1dBasePort<<trunkFirst+NumTrunks>))`.
  - Rows: `dot1dBasePort$repeat?, rlPhdPortsIfIndexName$repeat?, dot1dPortGarpJoinTime$repeat?, dot1dPortGarpLeaveTime$repeat?, dot1dPortGarpLeaveAllTime$repeat?` (VT `garpTimersTable`).
- Edit:
  - `GET API/garp_timers_table_e.htm?Query:dot1dBasePort=<ifIndex>`.
  - POST `API/garp_timers_table_e.htm` with `dot1dBasePort$query, dot1dPortGarpJoinTime$query, dot1dPortGarpLeaveTime$query, dot1dPortGarpLeaveAllTime$query, garpTimers$endQuery=OK`.
- **Units:** the MIB stores centiseconds. The UI shows ms (value × 10) and writes ms ÷ 10.
- UI range: 10-2147483640 ms, in steps of 10. The classic UI requires Leave ≥ 3×Join and LeaveAll > Leave. Defaults (inferred, 802.1D): Join 200, Leave 600, LeaveAll 10000 ms.
- The list form also has `$repeat?N`/`garpTimersTable$endRepeat?N` inputs, so a multi-row bulk write via `API/garp_timers_table.htm` is plausible (inferred, unused by the classic UI).

### GVRP Statistics (classic: Statistics and Diagnostics > Statistics > GVRP Statistics)
- Read: `wcd?{GVRPOperationStatisticsList&interfaceType=1}{GVRPErrorStatisticsList&interfaceType=1}` (2=LAGs).
  - Operation fields: `receive|transmit` × `JoinEmpty, JoinIn, Empty, LeaveIn, LeaveEmpty, LeaveAll` + `Count` (e.g. `receiveJoinEmptyCount`).
  - Error fields: `invalidProtocolIDCount, invalidAttributeTypeCount, invalidAttributeValueCount, invalidAttributeLengthCount, invalidEventCount`. Keyed by interfaceName.
- Clear: `<GlobalStatisticsSetting action="set"><clearGVRPStatistics>1</clearGVRPStatistics></GlobalStatisticsSetting>`.

### VLAN wizard / LAG wizard tables (Dashboard > Configure VLAN / Configure LAG)
- Read: `wcd?{VLANInterfaceActiveModeISList&interfaceType=1|2}{VLANMembershipInterfaceList&interfaceType=1|2}`.
  - Shows Admin VLANs (General: forbidden+tagged+untagged; Access: multicast/inactive/untagged; Trunk: `trunkActiveMemberVLANs` + inactive + native) and Oper VLANs (`currentTaggedVLANs` + `currentUntaggedVLANs`).
- Writes: see "Bulk write" under VLAN Port Settings (tpl/Wiz_VLAN_Summary.htm, tpl/Wiz_LAG_Summary.htm).

### Generic CLI channel (used by Port Profile and the Dashboard; usable for anything)
- Write: POST any `wcd?...` with `<RemoteCLITable action="set"><Entry><commandText>exit</commandText></Entry><Entry><commandText>exit</commandText></Entry><Entry><commandText>config</commandText></Entry><Entry><commandText>interface range gi1/0/1-8</commandText></Entry><Entry><commandText>switchport trunk allowed vlan add 10</commandText></Entry>...</RemoteCLITable>`.
  - port_profile_table.js and tpl/Wiz_CPP_Summary.htm use it to run `macro apply ...` on `interface range`.
- Then poll `wcd?{ConfigInfoStatus}` until `state == "6"`, and read output from `wcd?{RemoteCLIOutputTable}` (rows `id, text`; ServerManager treats any line except "% Unrecognized command" as an error).
- Dashboard variant: `RemoteCLITable` set followed by `<ConfigInfoExecute action="set"><type>1</type><interfaceName>gi1/0/1</interfaceName></ConfigInfoExecute>` (`_order`: RemoteCLITable then ConfigInfoExecute), poll `ConfigInfoStatus.state==6`, read `wcd?{ConfigInfoOutputList}` (rows with `text`).
  - type 1 = show interface config (inferred); type 4 = list configured ports (the Dashboard counts lines).
- This is the only true "matrix" bulk channel: any VLAN membership change for many ports/VLANs as CLI (`interface range ...` / `switchport general allowed vlan add 10-20 tagged`), in one POST (inferred; untested here).
- Gotchas: the session starts in an unknown mode, hence the two `exit` lines first. Output is async, so poll.


## LLDP and Voice VLAN

All pages below are wcd (JSON->XML) pages; none uses API/*.htm forms.
Common serializer note (serverManager.json2xml): only **string** values serialize. A JS number becomes an empty element, so send every value as a string. A section/action whose inner XML is empty is dropped. Without `_order`, sections and actions are emitted in object-key insertion order.

---

### LLDP Properties (classic: Network Administration > LLDP > LLDP Properties; page LLDP_Properties)
- Read: `GET wcd?{LLDPGlobalSetting}` (scalar section, cheap). Edit uses the same read.
- Write: `POST wcd?{LLDPGlobalSetting}`. The body can carry two actions on the same section, restore first and then set:
  ```xml
  <DeviceConfiguration>
    <LLDPGlobalSetting action="restore"><updateInterval></updateInterval>...</LLDPGlobalSetting>
    <LLDPGlobalSetting action="set"><LLDPEnabled>1</LLDPEnabled><holdMultiplier>4</holdMultiplier>...</LLDPGlobalSetting>
  </DeviceConfiguration>
  ```
  This is a scalar section, so the fields sit directly under the section with no entry element. A field with "Use Default" checked goes into `restore` as an empty element. Otherwise it goes into `set` with its value. `LLDPEnabled` is sent only if it changed. An empty restore or set section is dropped.
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| LLDPEnabled | LLDP status on device | 1=Enabled, 2=Disabled | | (Enabled, inferred) |
| updateInterval | Updates Interval, LLDP advertisement tx rate (s) | int | 5-32768 | 30 |
| holdMultiplier | Hold Multiplier (TTL = interval x multiplier; UI wrongly labels it "(Sec)") | int | 2-10 | 4 |
| reinitializingDelay | min wait before re-init of LLDP tx on a port (s) | int | 1-10 | 2 |
| transmitDelay | min time between successive LLDP frames due to local MIB changes (s) | int | 1-8192 | 2 |
| LLDPDUMode, fastStartCount, notificationInterval, chassisIdSource | read in dataSource but never shown or written | ? | | |

- Gotchas: when LLDP is Disabled, every text box and Use-Default checkbox is disabled, but the values are still posted. The "Use Default" checkboxes never start checked from data, because the UI cannot tell whether a value is the default; checking one fills in the default value. Valid edge: in RFC, transmitDelay must be <= 0.25 x updateInterval. The classic UI does not enforce this, so the device may reject the value through mibError (inferred).

---

### LLDP Port Settings (classic: Network Administration > LLDP > LLDP Port Settings; page lldp_port_settings)
- Read (list): `GET wcd?{LLDPInterfaceList}`. This is a bulk read of all ports.
- Read (edit): `GET wcd?{LLDPInterfaceList&interfaceName=gi1%2F0%2F3&interfaceID=N&interfaceType=1}{IPv4InterfaceList}`. Pkeys are interfaceName, interfaceID, interfaceType. IPv4InterfaceList supplies the management-address dropdown, using `IPAddr` of each entry.
- Write (edit, per port): `POST wcd?{LLDPInterfaceList}`
  ```xml
  <LLDPInterfaceList action="set"><InterfaceEntry>
    <interfaceName>gi1/0/3</interfaceName><portState>3</portState>
    <mngAddrState>0</mngAddrState><managementAddress>192.168.1.2</managementAddress>
    <optionalTLVs>11110000</optionalTLVs>
  </InterfaceEntry></LLDPInterfaceList>
  ```
  The entry carries only interfaceName (not interfaceID or interfaceType).
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| interfaceName / interfaceID / interfaceType | port key | gi1/0/N | | |
| portState | LLDP admin state | 1=Tx Only, 2=Rx Only, 3=Tx & Rx, 4=Disabled | | (Tx & Rx, inferred) |
| optionalTLVs | 8-char bit string, char index: 0 Port Description, 1 System Name, 2 System Description, 3 System Capabilities, 4 802.3 MAC-PHY, 5 802.3 LAG, 6 (unused, always 0), 7 802.3 Max Frame Size | "0"/"1" each | | "00000000" = mandatory TLVs only (Chassis ID, Port ID, TTL) |
| mngAddrState | 1 = "Use Default" (default management address and default TLVs), 0 = explicit | 0/1 | | 1 |
| managementAddress | advertised management IP; "" = Not Advertised (dropdown "None") | IPv4 from IPv4InterfaceList | | "" |
| autoMngAddrInterface, notifEnbl, dot1PVIDEnbl | read only (in dataSource), never written | | | |

- Gotchas:
  - The list column shows "Default" when no TLV bit is set, and "Not Advertised" when managementAddress is empty.
  - With "Use Default" checked, the request sends mngAddrState=1, managementAddress="" and optionalTLVs="00000000", and both the TLV picker and the IP dropdown are disabled. The edit page shows "Use Default" as checked only when mngAddrState==1 **and** optionalTLVs=="00000000".
  - The TLV transferbox offers only bits 0-4. Saving always writes bits 5 and 7 (LAG, Max Frame Size) as 0, so a classic edit silently clears them. A new UI can expose them.
  - Per-port only: there is no bulk write in the classic UI, but the entry is a list, so several InterfaceEntry elements in one set are probably accepted (inferred).

---

### MED Network Policy (classic: Network Administration > LLDP > MED Network Policy; page med_network_policy)
- Read (list): `GET wcd?{LLDPMEDNetworkPolicyList}`
- Read (edit): `GET wcd?{LLDPMEDNetworkPolicyList&policyID=N}`
- Write (add): `POST wcd?{LLDPMEDNetworkPolicyList}`. Note that the action is `set`, not `add`:
  ```xml
  <LLDPMEDNetworkPolicyList action="set"><NetworkPolicyEntry>
    <policyID>1</policyID><application>1</application><VLANID>10</VLANID>
    <VLANType>1</VLANType><userPriority>5</userPriority><DSCP>46</DSCP>
  </NetworkPolicyEntry></LLDPMEDNetworkPolicyList>
  ```
- Write (edit): one POST with a delete followed by a full set of the same policyID:
  ```xml
  <LLDPMEDNetworkPolicyList action="delete"><NetworkPolicyEntry><policyID>1</policyID></NetworkPolicyEntry></LLDPMEDNetworkPolicyList>
  <LLDPMEDNetworkPolicyList action="set"><NetworkPolicyEntry>...all 6 fields...</NetworkPolicyEntry></LLDPMEDNetworkPolicyList>
  ```
- Write (delete, multi-select): `<LLDPMEDNetworkPolicyList action="delete"><NetworkPolicyEntry><policyID>N</policyID></NetworkPolicyEntry>...</LLDPMEDNetworkPolicyList>`
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| policyID | Network Policy Number (Pkey) | dropdown 1..32 on add, read-only on edit | 1-32 | |
| application | traffic type | 0=None (rejected by UI: "Please select an application"), 1=Voice, 2=Voice Signaling, 3=Guest Voice, 4=Guest Voice Signaling, 5=Softphone Voice, 6=Video Conferencing, 7=Streaming Video, 8=Video Signaling | 1-8 | |
| VLANID | VLAN the endpoint should use | int | 1-4094 (VLAN should already exist, per docs) | |
| VLANType | | 1=Tagged, 2=Untagged | | Tagged on add |
| userPriority | 802.1p | 0-7 dropdown | 0-7 | 0 |
| DSCP | | 0-63 dropdown | 0-63 | 0 |
| ports | read only (ports using the policy) | | | |

- Gotchas:
  - On add, the UI rejects a policyID that already exists in the list ("...is already exists.").
  - The delete-then-set edit may fail if the policy is attached to ports through LLDPMEDInterfaceList NetworkPolicyList (untested, inferred). A plain `set` probably works as an update.
  - The Save code's duplicate check is a no-op on edit.

---

### MED Port Settings (classic: Network Administration > LLDP > MED Port Settings; page LLDPMEDPortSettings)
- Read (list): `GET wcd?{LLDPMEDInterfaceList}{LLDPMEDAdvertisementInterfaceList}{LLDPGlobalAdvertisementStatus}`. This is a bulk read of all ports and is likely the slowest of these pages. The list needs only LLDPMEDInterfaceList.
- Read (edit/details): `GET wcd?{LLDPMEDInterfaceList&interfaceName=gi1%2F0%2F3}{LLDPMEDAdvertisementInterfaceList&interfaceName=gi1%2F0%2F3}{LLDPGlobalAdvertisementStatus}`. The row Pkey is overridden to interfaceName only.
- Write (edit, per port): `POST wcd?{LLDPMEDInterfaceList}...`
  ```xml
  <LLDPMEDInterfaceList action="set"><InterfaceEntry>
    <interfaceName>gi1/0/3</interfaceName><interfaceID>3</interfaceID><interfaceType>1</interfaceType>
    <MEDOptionalTLVs>110000</MEDOptionalTLVs>
    <Locations><coordinate>..hex..</coordinate><civicAddress>..hex..</civicAddress><ECSELIN>..hex..</ECSELIN></Locations>
    <NetworkPolicyList>
      <NetworkPolicyEntry><policyID>1</policyID><policyEnbl>1</policyEnbl></NetworkPolicyEntry>
      <NetworkPolicyEntry><policyID>2</policyID><policyEnbl>2</policyEnbl></NetworkPolicyEntry>
    </NetworkPolicyList>
  </InterfaceEntry></LLDPMEDInterfaceList>
  ```
  NetworkPolicyList is a delta. It contains only policies whose state changes or that are not currently enabled: policyEnbl 1 = attach, 2 = detach. A policy that is already attached and still selected is omitted. The element is left out entirely when there are no entries.
- Fields (LLDPMEDInterfaceList entry):

| field | meaning | values | range | default |
|---|---|---|---|---|
| interfaceName/interfaceID/interfaceType | port key | | | |
| MEDSupportedTLVs | read only | bit string | | |
| MEDOptionalTLVs | 6-char bit string, char index: 0 = LLDP-MED enabled on port, 1 Network Policy, 2 Location, 3 PoE-PSE (offered only if globalParameters.poeSupported; X1018 has no PoE), 4/5 always 0 when written | | | (MED enabled + network policy, inferred) |
| Locations.coordinate | Location Coordinate | hex octet string | exactly 16 bytes (UI maxLength 47, so separators are allowed), optional | "" |
| Locations.civicAddress | Location Civic Address | hex | 6-160 bytes, optional | "" |
| Locations.ECSELIN | Location ECS ELIN | hex | 10-25 bytes, optional | "" |
| NetworkPolicyList[].policyID / policyEnbl | MED policies (from med_network_policy) attached to the port | policyEnbl 1=attached, 2=not | | none |

- List columns: Port; LLDP MED Status (bit0: Enabled/Disabled); Network Policy (bit1: Yes/No); Location (bit2: Yes/No).
- Details (read only) come from LLDPMEDAdvertisementInterfaceList[0] and LLDPGlobalAdvertisementStatus:
  - Auto-Negotiation Status (`MACPHYAutoNegtnEnbl` 1=Enabled).
  - Advertised Capabilities (`MACPHYAutoNegtnCapblt`, a hex octet string decoded MSB-first with getBitFromOctet). Bit 0 is Other and short-circuits the rest. Bits 1-15 are 10BASE-T, 10BASE-TFD, 100BASE-T4, 100baseTX, 100baseTXFD, 100baseT2, 100baseT2FD, FdxPause, FdxAPause, FdxSPause, FdxBPause, 1000baseX, 1000baseXFD, 1000baseT, 1000baseTFD. No bits set shows "Unknown".
  - MAU Type (`MACPHYOperMAUType` is an index into the RFC 3636 dot3MauType name list, 0 "no information" ... 40 "W fiber over 850 nm optics"; the full array is in LLDPMEDPortSettings.js displayMAU).
  - System Name, System Description and Device ID (`systemName`, `systemDescription`, `deviceID`).
  - Device Type (`systemCapabilitiesSupported` is a bit-char string, index 0..7 = Other, Repeater, Bridge, Wlan access point, Router, Telephone, Docsis cable device, Station only).
  - LLDP MED Capabilities (MEDOptionalTLVs bits 1-3, shown as "Default" when none are set).
  - LLDP MED Device Type (`MEDDeviceType` 1/2/3 = Endpoint Class1/2/3, 4 = Network Connectivity).
  - Application table: from Adv NetworkPolicyList[]: `application` is a bit-char string whose row index = indexOf('1')-1 (Voice ... Video Signaling), plus VLANType (1 Tagged / else Untagged), VLANID, userPriority, DSCP.
  - Location table: Coordinates / Civic Address / ECS ELIN from LLDPMEDInterfaceList[0].Locations.
- Gotchas:
  - The classic transferbox for policies uses option value = (index+1) but preselects and compares by policyID. It works only when NetworkPolicyList is 1..N in order. A new UI should key strictly on policyID.
  - With LLDP-MED Disabled, the TLV picker is disabled but the selected TLV bits are still written alongside bit0=0.
  - `interfaceID`/`interfaceType` must be sent (unlike lldp_port_settings).
  - The location fields are always sent, even when empty, so empty clears them (inferred).

---

### Neighbors Information (classic: Network Administration > LLDP > Neighbors Information; page neighbors_information)
- Read (list): `GET wcd?{LLDPMEDNeighborList}{LLDPNeighborDot3List}{LLDPNeighborDot1PortProtocolVLANList}{LLDPNeighborDot1ProtocolList}{LLDPNeighborDot1VLANNameList}{EEELLDPRemoteInterfaceList}{LLDPMEDNetworkPolicyList}`. The table only needs `{LLDPMEDNeighborList}`; the other sections are unused in the list.
- Read (details): the same sections, each with `&query` replaced by that section's Pkeys from the row, for example `{LLDPMEDNeighborList&interfaceName=gi1%2F0%2F3&interfaceID=3&interfaceType=1&neighborID=1}{EEELLDPRemoteInterfaceList&interfaceName=gi1%2F0%2F3}...`. The Pkeys per section are:
  - LLDPMEDNeighborList: interfaceName, interfaceID, interfaceType, neighborID
  - Dot3List: interfaceName, neighborID
  - Dot1PortProtocolVLANList: interfaceName, VLANID, neighborID
  - Dot1ProtocolList: interfaceName, protID
  - Dot1VLANNameList: interfaceName, VLANID
  - EEELLDPRemoteInterfaceList: interfaceName (added in onDataFunction)
  - LLDPMEDNetworkPolicyList: no Pkey, so it is probably the switch's **local** policy list rather than the neighbor's (inferred; see gotchas)
- Write (remove selected neighbors): `POST wcd?{LLDPMEDNeighborList}`
  ```xml
  <LLDPMEDNeighborList action="delete"><NeighborEntry>
    <interfaceName>gi1/0/3</interfaceName><interfaceID>3</interfaceID><interfaceType>1</interfaceType><neighborID>1</neighborID>
  </NeighborEntry>...</LLDPMEDNeighborList>
  ```
  The Remove handler strips the EEE and Dot3 key sets. It would also emit delete sections for any Dot1* section that has keys, but those would throw in JS because interfaceID is missing, so in practice only LLDPMEDNeighborList is sent (inferred).
- Write (Clear Neighbors Table): `<LLDPMEDNeighborList action="deleteAll"><NeighborEntry></NeighborEntry></LLDPMEDNeighborList>`
- Fields, LLDPMEDNeighborList entry (list columns are Port, Device ID, System Name, Port ID, Capabilities):

| field | meaning / decoding |
|---|---|
| interfaceName, interfaceID, interfaceType, neighborID | local port + neighbor index (keys) |
| deviceIDSubtype, deviceID | chassis ID (classic shows deviceID as returned) |
| advertisedPortIDSubtype, advertisedPortID | port ID (shown raw). The unused helper getRemPortId: subtype 3 = MAC hex to aa:bb:.., 4 = network addr (octetToIp of substring(2)), 1/5/6/7 = hex to string, 2 = as is |
| TTL | time to live (not displayed) |
| portDescription, systemName, systemDescription | strings |
| systemCapabilitiesSupported / systemCapabilitiesEnabled | bit-char string, index 0 Other, 1 Repeater, 2 Bridge, 3 WLAN AP, 4 Router, 5 Telephone, 6 DOCSIS, 7 Host/Station; none set = "Unknown" (getLldpDeviceCaps) |
| MngAddrList[] {addrSubtype, addr, addrIfSubtype, addrIfID, addrOID} | Management Address = MngAddrList[0].addr. **The classic UI assumes the list exists.** |
| MACPHYAutoNegtnSuprt, MACPHYAutoNegtnEnbl (1=Enabled), MACPHYAutoNegtnCapblt (hex octets, same table as MED port details; empty = "No Information"), MACPHYOperMAUType (MAU index) | MAC/PHY |
| MEDDeviceType | 0/empty No Information, 1-3 Endpoint Class1-3, 4 Network Connectivity |
| MEDSupportedTLVs, MEDOptionalTLVs | bit-char: 0 Capabilities, 1 Network Policy, 2 Location, 3 PoE-PSE, 4 PoE-PD, 5 Inventory; none = "Default" |
| PoEDeviceType | 1 Unknown, 2 pseDevice, 3 pdDevice, 4 None, else No Information |
| PSEPowerAvailable/PSEPowerSource/PSEPowerPriority (used when type=2), otherwise PDPowerRequired/PDPowerSource/PDPowerPriority | Source: 1 Unknown, 2 Primary, 3 Backup, 4 Local and PSE. Priority: 1 Unknown, 2 Critical, 3 High, 4 Low. Power value = int/10 Watt |
| InvntryHWRev, InvntryFWRev, InvntrySWRev, InvntrySerNo, InvntryMfrName, InvntryModelName, InvntryAssetID | MED inventory |
| dot1PVID | neighbor PVID (not displayed) |
| Locations {coordinate, civicAddress, ECSELIN} | neighbor location (hex) |
| NetworkPolicyList-ish fields application, VLANID, userPriority, DSCP, VLANType, unknown; type, value | in dataSource; per-neighbor policy data (inferred nesting) |

- EEELLDPRemoteInterfaceList: `EEERemoteTx`, `EEERemoteRx` (shown as "N µSec").
- Network policy table: rows Voice ... Video Signaling, columns Flags (VLANType 1 Tagged / 2 Untagged), VLAN ID, User Priority, DSCP. Classic matches `application` as an integer 1-8.
- Gotchas:
  - The classic details page has bugs. The policy table reads `LLDPMEDNetworkPolicyList` (the local policies, not the neighbor's). The label typo "Guest tVoice Signaling" means that row never fills. `displayMAU` references the legacy `formele`, so it throws whenever the neighbor's MAU type is non-empty. `PowerTypeL` is a typo, so type 4 shows blank.
  - A new UI should take the neighbor's policies from the neighbor entry itself (check the real XML) and decode MAU with the LLDPMEDPortSettings table.
  - The Dot1 and Dot3 lists are fetched but never shown. They hold VLAN names, protocol IDs and PPVID data, and could be displayed.
  - Entries age out after the neighbor's TTL.

---

### Voice VLAN Properties (classic: Network Administration > VLAN > Voice VLAN > Properties; page voice_properties)
- Read: `GET wcd?{VLANCurrentStatus}{VoiceVLANGlobalSetting}{VoiceVLANList}`. If currentVLANsNumber < 20, it also fetches `GET wcd?{VLANList}` for VLAN names in the dropdown.
  - VLANCurrentStatus.currentVLANs is a list string like "1,10-20". The dropdown lists the existing VLANs, VLAN 1 is labelled "Default", and the label format is "id (name)".
- Write: `POST wcd?{VLANCurrentStatus}{VoiceVLANGlobalSetting}{VoiceVLANList}` with forced `_order`.
  - **Enable** (state=3): VoiceVLANList set comes first, then the global setting:
    ```xml
    <VoiceVLANList action="set"><VLAN><VLANID>100</VLANID><CoS>6</CoS><remarkCoSEnable>1</remarkCoSEnable></VLAN></VoiceVLANList>
    <VoiceVLANGlobalSetting action="set"><voiceVLANStateAdmin>3</voiceVLANStateAdmin><agingTimeout>1440</agingTimeout></VoiceVLANGlobalSetting>
    ```
  - **Disable** (state=0): the global setting is sent first (voiceVLANStateAdmin=0 and agingTimeout). After it, only if the current voice VLAN != 1, comes `<VoiceVLANList action="set"><VLAN><VLANID>1</VLANID></VLAN></VoiceVLANList>`, which resets the voice VLAN to 1.
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| VoiceVLANGlobalSetting.voiceVLANStateAdmin | Voice VLAN State | 3=Enabled (auto/OUI mode), 0=Disabled; any other value displays as Disabled | | 0 (inferred) |
| VoiceVLANGlobalSetting.agingTimeout | aging time in **minutes**. UI uses day/hour/min boxes (days 0-30, hours 0-23, min 0-59) | int | 1-43200 (1 min to 30 days) | 1440 (24 h, inferred; the docs claim "300 sec", which contradicts the minute unit) |
| VoiceVLANGlobalSetting.voiceVLANIDAdmin | admin voice VLAN ID (read; used by Port Setting) | | | |
| VoiceVLANList.VLAN.VLANID | Voice VLAN ID (Pkey) | existing VLAN | 1-4094 | 1 = none |
| VoiceVLANList.CoS | CoS/802.1p assigned to voice traffic | | 0-7 | (6, inferred) |
| VoiceVLANList.remarkCoSEnable | Remark CoS | 1=Enabled, 2=Disabled (a value of " " means unset) | | 2 (inferred) |

- Gotchas:
  - When state is Disabled, VLAN ID, CoS and Remark are disabled in the UI, but aging is still validated (1..43200) and sent.
  - Aging validation runs only on the "edit" path.
  - The voice VLAN must already exist. The device supports a single voice VLAN.
  - There is no separate "mode auto/OUI" field on this firmware. The global state is just 3 or 0, and per-port mode lives in VoiceVLANInterfaceList.

---

### Voice VLAN Port Setting (classic: Network Administration > VLAN > Voice VLAN > Port Setting; page VLANPortSetting)
- Read (list): `GET wcd?{VoiceVLANInterfaceList&interfaceType=1}{VLANMembershipInterfaceList&interfaceType=1}{VoiceVLANGlobalSetting}`. Use `interfaceType=2` for both lists to get the "LAGs" view (the View By filter).
- Read (edit): `GET wcd?{VoiceVLANInterfaceList&interfaceID=N&interfaceName=gi1%2F0%2F3}{VLANInterfaceISList&interfaceID=N&interfaceName=...}{VoiceVLANGlobalSetting}{VLANMembershipInterfaceList&interfaceID=N&interfaceName=...}`. The Pkeys are interfaceID and interfaceName.
- Write, mode **Static** (0): `<VLANInterfaceISList action="set"><Entry><interfaceName>gi1/0/3</interfaceName><generalTaggedVLANs>{voiceVLANIDAdmin}</generalTaggedVLANs></Entry></VLANInterfaceISList>`. This makes the port a tagged general member of the voice VLAN. VoiceVLANInterfaceList is **not** touched.
- Write, mode **None** (2), in order:
  ```xml
  <VLANInterfaceISList action="delete"><Entry><interfaceName>gi1/0/3</interfaceName><generalTaggedVLANs>{voiceVLANIDAdmin}</generalTaggedVLANs></Entry></VLANInterfaceISList>
  <VoiceVLANInterfaceList action="set"><InterfaceEntry><interfaceName>gi1/0/3</interfaceName><interfaceID>3</interfaceID><voiceVLANEnable>2</voiceVLANEnable></InterfaceEntry></VoiceVLANInterfaceList>
  ```
- Write, mode **Auto** (1), in order:
  ```xml
  <VLANInterfaceISList action="delete"><Entry><interfaceName>gi1/0/3</interfaceName><trunkMemberVLANs>{voiceVLANIDAdmin}</trunkMemberVLANs></Entry></VLANInterfaceISList>
  <VoiceVLANInterfaceList action="set"><InterfaceEntry><interfaceName>gi1/0/3</interfaceName><interfaceID>3</interfaceID><voiceVLANEnable>1</voiceVLANEnable><securityEnable>1|2</securityEnable></InterfaceEntry></VoiceVLANInterfaceList>
  ```
- Fields:

| field | meaning | values | default |
|---|---|---|---|
| VoiceVLANInterfaceList.interfaceID/interfaceName/interfaceType | key; interfaceType 1=port, 2=LAG | | |
| voiceVLANEnable | per-port voice VLAN mode | 1=Auto (list shows "Enabled"), 2=None/Disabled. "Static" (0) is a UI-only pseudo value, never stored here | 2 (None) |
| securityEnable | Voice VLAN Security: drop non-OUI traffic on the voice VLAN | 1=Enabled ("Secured"), 2=Disabled ("Unsecured") | 2 |
| VLANID | read only | | |
| membershipType | list column "Membership" | 1=Included, else Excluded; overridden to "Static" when VLANMembershipInterfaceList[i].staticTaggedVLANs == voiceVLANIDAdmin | |
| VLANInterfaceISList.generalTaggedVLANs / trunkMemberVLANs | VLAN membership lists used to add or remove the voice VLAN | VLAN list string | |
| VoiceVLANGlobalSetting.voiceVLANIDAdmin | voice VLAN ID used in all writes | | |

- Gotchas:
  - The edit page preselects "Static" when VLANInterfaceISList[0].generalTaggedVLANs equals voiceVLANIDAdmin exactly (string compare, so it fails if the port has other general tagged VLANs). Otherwise it uses voiceVLANEnable.
  - Security is selectable only in Auto mode. It is disabled and forced to Disabled for None and Static, and also when the stored mode is 2.
  - Static does not clear voiceVLANEnable, so moving from Auto to Static leaves Auto on. A new UI should set voiceVLANEnable=2 too (inferred).
  - The membership comparisons are exact string matches against VLAN lists and are fragile.
  - Per docs, a port with a manually added phone OUI MAC can only use Static.
  - The list read is bulk per interface type. The mockup-mode URI in metadata is irrelevant.

---

### Voice VLAN OUI (classic: Network Administration > VLAN > Voice VLAN > OUI; page voice_OUI)
- Read: `GET wcd?{VoiceVLANOUIList}`
- Write (add): `POST wcd?{VoiceVLANOUIList}`, `<VoiceVLANOUIList action="set"><OUIEntry><OUIPrefix>00E0BB</OUIPrefix><OUIDescription>3Com_phone</OUIDescription></OUIEntry></VoiceVLANOUIList>`. The prefix has its ':' and '-' separators stripped.
- Write (delete, multi-select): `<VoiceVLANOUIList action="delete"><OUIEntry><OUIPrefix>{raw value as read}</OUIPrefix></OUIEntry>...</VoiceVLANOUIList>`
- Write (Restore Default OUIs, after confirming "All user-defined OUIs will be erased"): `<VoiceVLANOUIList action="restoreAll"><OUIEntry></OUIEntry></VoiceVLANOUIList>`
- Fields:

| field | meaning | values | validation | default |
|---|---|---|---|---|
| OUIPrefix | Telephony OUI (Pkey). The device returns it space-separated with a trailing space ("00 E0 BB "); the UI displays it as upper-case with ':' and the last char dropped | 3 octets | `^[0-9A-Fa-f]{2}([:-])[0-9A-Fa-f]{2}\1[0-9A-Fa-f]{2}$` (UI allows : or -), not 00:00:00, not multicast (second hex digit odd), no duplicates (compared after stripping separators and spaces) | 9 defaults: 00:01:81 Nortel, 00:01:e3 Siemens_AG_phone, 00:03:6b Cisco_phone, 00:09:6e Avaya, 00:0f:e2 H3C_Aolynk, 00:10:49 Shoretel, 00:60:b9 Philips_and_NEC_AG_phone, 00:90:7a Polycom/Veritel_phone, 00:e0:bb 3Com_phone |
| OUIDescription | Vendor/description; '_' shown as space | string | 0-32 chars | |

- Gotchas:
  - At most 16 OUIs.
  - Delete sends the prefix exactly as it was read (with spaces). Whether the stripped form also works is untested.
  - There is no edit; to change an entry, delete it and add it again.


## LAG / LACP / STP / RSTP / MSTP (classic UI catalogue)

Common notes for this part
- json2xml (js/components/serverManager.js): string values -> text; `undefined` fields omitted; `null` -> empty element `<f></f>`; **JS numbers become EMPTY elements** (for..in over a number yields nothing) -> always send strings. Without `_order`, sections/actions are emitted in object insertion order. Empty actions are skipped.
- Enumerations common to all STP pages:
  - portState: 1 Disabled, 2 Blocking (Discarding when STPOperationMode/dot1dStpVersion=2), 3 Listening (Discarding in RSTP), 4 Learning, 5 Forwarding, 6 Broken; any other "*". Shown as "N/A" if the port is a LAG member (LACPPortList.actorAdminKey != 0).
  - portRole: 0 Unknown, 1 Disabled, 2 Alternate, 3 Backup, 4 Root, 5 Designated.
  - STPOperationMode / dot1dStpVersion: 0 Classic STP, 2 Rapid STP (default per doc), 3 Multiple STP.
  - Enable-type flags: 1 Enabled, 2 Disabled.
  - Port priority dropdowns (STP port/LAG, MSTP interface): 0..240 step 16 (default 128, inferred/standard).
  - Designated Bridge/Port/Cost/Forward Transitions shown "N/A" when portState=1 or STPEnabled=2.
- Port Pkey values are names like `gi1/0/3` (URL-encode in `&query`). LAG names: wizard posts `LAG<n>` (e.g. LAG1); LAGMembership derives LAG number with `interfaceName.substring(3)` -> names are `LAG<n>` in LAGList/LACPLAGList (inferred). LACPPortList.actorAdminKey = LAG ifIndex; LAG number = actorAdminKey - (globalParameters.trunkFirstIndex - 1); 0 = not in a LAG.
- Limits (doc): up to 12 LAGs per system, 8 ports per LAG (device value comes from globalParameters.NumberOfTrunks; verify on X1018).

---

### LAG Membership (classic: Network Administration > Spanning Tree and LAG > Link Aggregation (LAG) > LAG Membership)
- Read (overview / read-only port map): `GET wcd?{LAGList}{LACPLAGList}{LACPPortList}` (onReady overrides metadata URI `wcd?{LACPLAGList}{LACPPortList&filter=actorAdminKey>0}{LAGList}`).
  - Port -> LAG: LACPPortList entries with actorAdminKey!=0; LACPLAGList maps actorAdminKey -> LAG interfaceID; LAGList maps interfaceID -> LACPType.
- Read (edit, one LAG): `GET wcd?{LACPLAGList}{LACPPortList}{LAGList&interfaceName=<LAGname>}` (LAG dropdown = LACPLAGList[].interfaceName; default first LAGList entry). Members = LAGList[0].PortList[].portName.
- Write (single POST to `wcd?{LACPLAGList}{LACPPortList&filter=actorAdminKey>0}{LAGList}`):
  ```xml
  <DeviceConfiguration>
    <LAGList action="delete"><LAGEntry><interfaceName>LAG1</interfaceName><LACPType>NEW_TYPE</LACPType>
      <PortList><PortEntry><portName>gi1/0/5</portName></PortEntry>...</PortList></LAGEntry></LAGList>
    <LAGList action="set"><LAGEntry><interfaceName>LAG1</interfaceName><LACPType>NEW_TYPE</LACPType>
      <PortList><PortEntry><portName>gi1/0/1</portName></PortEntry>...(ALL selected ports)</PortList></LAGEntry></LAGList>
  </DeviceConfiguration>
  ```
  - delete PortList = old members not still selected; if LACPType changed, ALL old members go to delete (match requires same type). Note delete carries the NEW LACPType, not the old one.
  - set PortList = every currently selected port (existing + new). `set` = add/keep ports; `delete` = remove ports.
  - `_order` [delete, set] only when both non-empty; otherwise only the non-empty action is sent.
- Fields:
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | LAGList.interfaceName | LAG | LAG1..LAGn | Pkey | - |
  | LAGList.LACPType | LAG kind | 1 Standard/static ("LAG ID" legend), 2 LACP | radio rdoStatus | radio default Standard |
  | LAGList.PortList[].portName | member ports | port names | max 8/LAG (doc) | - |
  | LAGList.interfaceID / interfaceType | LAG ifIndex / type | - | read-only | - |
  | LACPLAGList.{interfaceName,interfaceID,actorAdminKey} | LAG index map | - | read-only | - |
  | LACPPortList.{interfaceName,interfaceID,actorAdminKey} | port -> LAG key | 0 = none | read-only | - |
- Gotchas:
  - The Standard/LACP radio is disabled whenever >=1 port is selected: to change type the user must deselect all ports first (or use LAG Configuration LAG Mode).
  - In edit mode only the selected LAG's members are marked; ports in OTHER LAGs look free. Adding such a port presumably fails server-side (inferred) - new UI should show other-LAG membership from LACPPortList.
  - Doc: a port added to a LAG takes LAG properties; if it can't, it's rejected with error (first port may be added with its own settings).

### LAG Configuration (classic: ... > Link Aggregation (LAG) > LAG Configuration; SystemName "LAGConfiguration", js trunk_config_table)
- Read (table): `GET wcd?{Standard802_3List&interfaceType=2}{LAGList}` (bulk, all LAGs).
- Read (edit): `GET wcd?{Standard802_3List&interfaceType=2&interfaceName=<LAG>}{LAGList&interfaceName=<LAG>}`. LAG mode = "2" if any returned LAGList entry has LACPType 2 else "1".
- Write (POST `wcd?{Standard802_3List&interfaceType=2}{LAGList}`), one request, sections in this order:
  1. Only if LAG Mode radio changed: for EACH member port one entry (refused client-side if switching to LACP with 0 ports: "LAG mode can be changed to LACP only in case it has at least one port included"):
     ```xml
     <LAGList action="delete"><LAGEntry><interfaceName/><interfaceType/><interfaceID/><LACPType>OLD</LACPType>
        <PortList><PortEntry><portName>p</portName></PortEntry></PortList></LAGEntry>...</LAGList>
     <LAGList action="set"><LAGEntry>...same...<LACPType>NEW</LACPType>...</LAGEntry>...</LAGList>
     ```
  2. Always:
     ```xml
     <Standard802_3List action="set"><Entry><interfaceName>LAG</interfaceName>
       <interfaceDescription>(only if changed)</interfaceDescription><adminState/><speedAdmin>(only if radio enabled, i.e. autoneg disabled)</speedAdmin>
       <autoNegotiationAdminEnabled/><adminAdvertisementList/><flowControlAdminType/></Entry></Standard802_3List>
     ```
- Fields (Standard802_3List entry, LAG):
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | interfaceName | LAG | - | Pkey | - |
  | (LAG Mode, rdoLAGMode) | static vs LACP -> LAGList.LACPType | 1 Static, 2 LACP | needs >=1 port for LACP | Static |
  | interfaceDescription | description | string | 0-64 chars | "" |
  | adminState | admin status | 1 Up, 2 Down | - | Up (inferred) |
  | linkState | current status | 1 Up, 2 Down, 6 Not present | RO | - |
  | speedAdmin | admin speed | 10, 100, 1000, 10000 | radio disabled when autoneg=1; 10G radio hidden for 1G LAG (swIfType 3), 10M/100M hidden otherwise | - |
  | speedOper | current speed | 10/100/1000; 10000 or 4294967295 = 10G; linkState 1 & 0 = "Hybrid"; blank if down | RO | - |
  | autoNegotiationAdminEnabled | admin autoneg | 1 Enabled, 2 Disabled | - | Enabled (inferred) |
  | autoNegotiationOperEnabled | current autoneg | 1/2 | RO | - |
  | adminAdvertisementList | admin advertisement bitstring | 16 chars: 8 bits + "00000000"; bit0 Max Capability, bit3 10F, bit5 100F, bit7 1000F (bits 2/4 = 10H/100H, checkboxes hidden); all-zero -> "10000000" | checkboxes enabled only when autoneg=1; Max Capability exclusive | Max Capability |
  | operAdvertisementList / remoteLinkCapabilities | current / neighbor advertisement | same bit layout; bit1 = unknown; "unknown" if link not up | RO | - |
  | flowControlAdminType | admin flow control | 1 Enabled, 2 Disabled, 3 Auto-Negotiation | - | Enable (doc) |
  | flowControlOperType | current flow control | 1 On, 2 Off, 3 Rx Only, 4 Tx Only | RO | - |
  | LAG Type (display) | from globalParameters.swIfTypeArr | 1 eth10M, 2 eth100M, 3 eth1000M, 4 eth10G, 5 Unknown | RO | - |
- Gotchas:
  - adminAdvertisementList is a page-global var only updated by clicking a checkbox; initial "" -> classic sends `<adminAdvertisementList></adminAdvertisementList>` if untouched (and can leak a value from a previous LAG edit). New UI should send the read value or omit.
  - Mode change re-adds all ports one entry per port (delete with old type, then set with new type) in the same POST as port settings.
  - globalParameters.TypePerModuleArr == '179' disables all advertisement checkboxes (module-specific).

### LACP Parameters (classic: ... > Link Aggregation (LAG) > LACP Parameters)
- Read (table): `GET wcd?{LACPGlobalSetting}{LACPPortList}` (bulk, all ports).
- Read (port edit): `GET wcd?{LACPGlobalSetting}{LACPPortList&interfaceName=<port>}`.
- Read (settings dialog): `GET wcd?{LACPGlobalSetting}`.
- Write port: POST `wcd?{LACPGlobalSetting}{LACPPortList}`
  `<LACPPortList action="set"><Entry><interfaceName>gi1/0/1</interfaceName><actorPortPriority>1</actorPortPriority><actorPortAdminTimeout>V</actorPortAdminTimeout></Entry></LACPPortList>`
- Write global (Settings icon): `<LACPGlobalSetting action="set"><LACPSystemPriority>N</LACPSystemPriority></LACPGlobalSetting>` (flat, no entry element).
- Fields:
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | LACPGlobalSetting.LACPSystemPriority | system priority (decides which candidate ports join) | int | 1-65535 required | not documented |
  | LACPPortList.interfaceName | port | - | Pkey | - |
  | LACPPortList.actorPortPriority | LACP port priority | int | 1-65535 required | global default (doc) |
  | LACPPortList.actorPortAdminTimeout | LACPDU rate | READ/table: 1 Short (fast), 2 Long (slow). EDIT radio sends Long=0, Short=1 | - | Long (inferred) |
- Gotchas:
  - **Timeout encoding mismatch**: table transform maps 1=Short, 2=Long, but the edit radio values are Long=0 / Short=1, so a stored Long (2) pre-selects nothing and saving Long sends 0. Verify on device which write values are accepted before reimplementing (try 1/2 first).
  - Per-port only (one Entry per save); no bulk.
  - Legacy RomPager forms API/lacp_parameters.htm / _e.htm exist (dot3adAggPortActorSystemPriority, dot3adAggPortActorPortPriority, dot3adAggPortActorAdminState bitmask, dot3adAggActorSystemPriority) but are unused by the JS.

### LAG wizard (classic: Dashboard > Configure Link Aggregation Group wizard; page js Wiz_LAG_Configuration + tpl/Wiz_LAG_Configuration_Path.htm, Wiz_LAG_Configuration.htm, Wiz_LAG_Summary.htm)
- Wiz_LAG_Configuration page itself = read-only "current configuration" table (no writes): `GET wcd?{VLANInterfaceActiveModeISList&interfaceType=2}{VLANMembershipInterfaceList&interfaceType=2}`; columns LAG, admin mode (switchportModeAdmin 10 General, 11 Access, 12 Trunk, 13 Customer, 14 PVLAN Promiscuous, 15 PVLAN Host), PVID (generalPVID), admin VLANs (suffix T/U/F/I/M), oper VLANs (currentTaggedVLANs/currentUntaggedVLANs), frame type (generalFrameType 1 Admit All, 2 Tagged Only, 3 Untagged Only), ingress filtering (generalIngressFiltering 1/2). Opened via the "current configuration" link (modal level 2).
- Wizard mode chosen on Path step: "Configure" (LAG settings) or "Assign" (ports -> LAG + VLAN).
- Reads: Configure: `wcd?{Standard802_3List&interfaceType=2}{LAGList}`; Assign: `wcd?{VLANInterfaceISLiteList&interfaceType=1}{LAGList}` (response section is VLANInterfaceISList) + `wcd?{VLANList}`; Summary: `wcd?{VLANInterfaceISLiteList&interfaceType=1}`.
- Write: single POST `wcd?{VLANList}` (URL irrelevant), body by mode:
  - Configure (per edited LAG):
    `<LAGList action="delete">` LAGEntry{interfaceName LAG<n>, LACPType OLD, PortList all members} and `<LAGList action="set">` same with NEW LACPType — only when mode changed; then `<Standard802_3List action="set"><Entry>` {interfaceName LAG<n>, interfaceDescription, adminState 1/2, speedAdmin (10/100/1000/10000; omitted when autoneg Enabled), autoNegotiationAdminEnabled 1/2, adminAdvertisementList (only when autoneg Enabled; same 16-char bitstring), flowControlAdminType 1/2 (wizard has no Auto)}.
  - Assign: `<VLANInterfaceISList action="set"><Entry>` {interfaceName LAG<n>, switchportModeAdmin 11 + accessPVID | 10 + generalPVID, generalFrameType 1/2/3, generalIngressFiltering 1/2, generalTaggedVLANs, generalUntaggedVLANs (csv) | 12 + trunkNativeVID, trunkMemberVLANs (csv)} THEN `<LAGList action="set"><LAGEntry>` {interfaceName LAG<n>, LACPType existing (2 if LACP else 1), PortList[PortEntry portName] selected ports}.
  - Clear (remove ports from LAG + reset VLAN): `<VLANInterfaceISList action="restore">` one Entry per port {interfaceName, switchport, switchportModeAdmin, generalPVID, generalFrameType, generalIngressFiltering, generalTaggedVLANs, generalUntaggedVLANs, generalForbiddenVLANs, accessPVID, accessMulticastTVVID, trunkNativeVID, trunkMemberVLANs, customerVID all EMPTY (null)} THEN `<Standard802_3List action="set">` one Entry per port {interfaceName, LAGID "0"}.
- Gotchas: Clear shows that `Standard802_3List set LAGID=0` on a port is an alternative way to drop a port from its LAG. Assign applies VLAN mode to the LAG before ports join (section order). Wizard state is kept in localStorage "WizLocalJson".

---

### STP Global Settings (classic: Network Administration > Spanning Tree and LAG > Spanning Tree > Global Settings)
- Read: `GET wcd?{SpanningTreeGlobalParam}{STP}` (scalar). Structure: `SpanningTreeGlobalParam/{enabled,STPOperationMode}`; `STP/GlobalSetting/{BPDUHandlingMode, pathCostDefaultValueType, BridgeSetting/{bridgePriority,helloTime,maxAge,forwardDelay}, DesignatedRoot/{bridgeID,rootBridgeID,rootPortID,rootPathCost,topologyChangeCount,lastTopologyChangeDateTime}}` (STP also carries InterfaceList; ignored here).
- Write (POST `wcd?{SpanningTreeGlobalParam}{STP}`):
  ```xml
  <SpanningTreeGlobalParam action="set"><enabled>1</enabled><STPOperationMode>2</STPOperationMode></SpanningTreeGlobalParam>
  <STP action="set"><GlobalSetting><BPDUHandlingMode>1</BPDUHandlingMode><pathCostDefaultValueType>2</pathCostDefaultValueType>
    <BridgeSetting><bridgePriority>32768</bridgePriority><helloTime>2</helloTime><maxAge>20</maxAge><forwardDelay>15</forwardDelay></BridgeSetting>
  </GlobalSetting></STP>
  ```
- Fields:
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | enabled | Spanning Tree State | 1 Enabled, 2 Disabled | - | Enabled (inferred) |
  | STPOperationMode | mode | 0 Classic STP, 2 Rapid STP, 3 Multiple STP | - | RSTP (doc) |
  | BPDUHandlingMode | BPDU handling when STP disabled on port/device | 1 Filtering, 2 Flooding | - | Flooding (inferred) |
  | pathCostDefaultValueType | default path cost method | 1 Short (1-65535), 2 Long (1-200000000) | - | Long (inferred) |
  | bridgePriority | bridge priority | int | 0-61440, multiple of 4096 | 32768 (doc) |
  | helloTime | hello time s | int | 1-10 | 2 (standard, inferred) |
  | maxAge | max age s | int | 6-40 | 20 (inferred) |
  | forwardDelay | forward delay s | int | 4-30 | 15 (inferred) |
  | bridgeID / rootBridgeID | priority-MAC strings | - | RO | - |
  | rootPortID, rootPathCost, topologyChangeCount | root port, cost, TC count | - | RO | - |
  | lastTopologyChangeDateTime | time since last TC, "D HH:MM:SS" -> shown "dD/ hH/ mM/ sS" | - | RO | - |
- Default path costs (doc table, partly empty cells): Long: LAG 20,000; 1000M 20,000; 100M 200,000; 10M 2,000,000; 10G 20,000 (as printed). Short: 100M 19; 10M 100 (others blank in doc; standard 802.1D short: 1000M 4, 10G 2 - inferred).
- Gotchas:
  - Only one of Hello/MaxAge/ForwardDelay is editable at a time (radio rdoBridgeSetting); others are reset to stored values but all three are always sent.
  - Cross-field validation (only for the selected timer): MaxAge >= 2*(Hello+1); 2*(ForwardDelay-1) >= MaxAge.
  - Priority check: 0..61440 and %4096==0.

### STP Port Settings (classic: ... > Spanning Tree > STP Port Settings)
- Read (table): `GET wcd?{LACPPortList&filter=actorAdminKey>0}{STP&interfaceType=1}{SpanningTreeGlobalParam}` (ports only, bulk). Rows = `STP/InterfaceList/InterfaceEntry`.
- Read (edit): `GET wcd?{LACPPortList&filter=actorAdminKey>0}{STP&interfaceName=<port>}{SpanningTreeGlobalParam}`.
- Write (POST `wcd?{LACPPortList&filter=actorAdminKey>0}{STP}{SpanningTreeGlobalParam}`):
  ```xml
  <STP action="set"><InterfaceList><InterfaceEntry>
    <interfaceName/><interfaceType/><STPEnabled/><portFastEnabled/><rootGuardEnabled/>
    <pathCost/><portPriority>(only if changed)</portPriority><BPDUGuardEnabled/>
  </InterfaceEntry></InterfaceList></STP>
  ```
  - "Use Default" path cost: pathCost "" in the set entry AND an extra section after it:
    `<STP action="restore"><InterfaceList><InterfaceEntry><interfaceName>p</interfaceName><pathCost></pathCost></InterfaceEntry></InterfaceList></STP>`
- Fields (InterfaceEntry):
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | interfaceName / interfaceId(interfaceID) / interfaceType | port | - | Pkey interfaceName | - |
  | STPEnabled | STP on port | 1/2 | - | Enabled (inferred) |
  | portFastEnabled | Fast Link (edge) | 1/2 | - | Disabled (inferred) |
  | portFastOperEnabled | oper fast link | 1/2 | RO | - |
  | BPDUGuardEnabled | BPDU guard | 1/2 | - | Disabled |
  | rootGuardEnabled | root guard | 1/2 | - | Disabled |
  | portState, portRole | see common enums | - | RO | - |
  | portSpeed | speed; "10" shown as 10G else suffix M | - | RO | - |
  | pathCost | path cost | int | 1-200000000 (Short mode effectively 1-65535) | default per speed |
  | portPriority | port priority | 0-240 step 16 | dropdown | 128 |
  | designatedBridgeString, designatedPortString, designatedPathCost, forwardTransitionCount | designated info | - | RO | - |
  | LAGID | LAG membership | - | RO | - |
  | BPDUHandlingMode | (global copy) | - | RO | - |
- Gotchas:
  - Classic intends to disable/omit STPEnabled for LAG member ports (Port2Lag from LACPPortList) but the save checks `$("#rdoSTP")` (nonexistent id), so STPEnabled is always sent. For LAG members configure STP via STP LAG Settings instead.
  - Legacy form API/stp_port_table.htm (STPPortTable VT, dot1dStp* MIB names) exists but is not used (metadata overridden to wcd).

### STP LAG Settings (classic: ... > Link Aggregation (LAG) > STP LAG Settings) — RomPager form page
- Read (table): `GET API/stp_lag_settings.htm` (no filter; bulk). Hidden inputs `<col>$repeat?N` for STPTrunkTable rows + scalar `dot1dStpVersion`.
- Read (edit): `GET API/stp_lag_settings_e.htm?Query:dot3adAggIndex=<LAG ifIndex>` (Pkey `dot3adAggIndex$repeat?`; exact query key spelling inferred). Inputs `<col>$query`, `dot1dStpPortPathCost$queryEqVal`, select `dot1dStpPortEnable$select`.
- Write: POST `API/stp_lag_settings_e.htm` (form action /Forms/API/stp_lag_settings_e.htm), urlencoded, enabled fields:
  `restoreUrl, errorCollector, dot3adAggIndex$query=<ifIndex>, dot1dStpPortEnable$query=<OLD value>, dot1dStpPortEnable$select=<NEW 1|2>, dot1dStpPortAdminEdgePort$query=1|2, rldot1dStpPortBpduGuardEnable$query=1|2, rldot1dStpPortRestrictedRole$query=1|2, dot1dStpPortState$query=<echo>, rldot1dStpPortRole$query=<echo (classic wrongly sends portState)>, [dot1dStpPortAdminPathCost$query=0 (Use Default) | dot1dStpPortPathCost$queryEqVal=<cost>], dot1dStpPortPriority$query=0..240, dot1dStpPortDesignatedBridge$query, dot1dStpPortDesignatedPort$query, dot1dStpPortDesignatedCost$query, dot1dStpPortForwardTransitions$query (echoes), STPTrunkTable$endQuery=OK`. Errors in `mibError`.
- Fields:
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | dot3adAggIndex | LAG ifIndex (display via interfaceManager name) | - | Pkey | - |
  | dot1dStpPortEnable (+$select) | STP on LAG | 1 Enabled, 2 Disabled | - | Enabled |
  | dot1dStpPortAdminEdgePort | Fast Link | 1/2 | - | Disabled |
  | rldot1dStpPortBpduGuardEnable | BPDU Guard | 1/2 | - | Disabled |
  | rldot1dStpPortRestrictedRole | Root Guard | 1/2 | - | Disabled |
  | dot1dStpPortState | LAG state | common enum (Discarding if dot1dStpVersion=2) | RO | - |
  | rldot1dStpPortRole | role | common enum | RO | - |
  | dot1dStpPortPathCost / dot1dStpPortAdminPathCost | oper / admin path cost (admin 0 = default) | int | 1-200000000 | default 20,000 long |
  | dot1dStpPortPriority | priority | 0-240 step 16 | - | 128 |
  | dot1dStpPortDesignatedBridge | hex: priority hex + 12-hex MAC -> "prio-MAC" | - | RO | - |
  | dot1dStpPortDesignatedPort | hex: last 3 hex digits = port num, prefix+"0" = priority | - | RO | - |
  | dot1dStpPortDesignatedCost, dot1dStpPortForwardTransitions | - | - | RO | - |
  | dot3adAggPortActorAdminKey | nonzero -> state shown N/A | - | RO | - |
  | dot1dStpVersion (StpSetting) | mode | 0/2/3 | RO | - |
- Gotchas: values escaped by ServerManager._escape; must echo the RO $query values; only one LAG per POST. A wcd alternative likely exists (`STP&interfaceType=2` like RSTP) — unverified (inferred); RapidSpanningTree uses `RSTP&interfaceType=2` for LAGs.

### Rapid Spanning Tree (classic: ... > Spanning Tree > Rapid Spanning Tree (RSTP); page RapidSpanningTree)
- Read (table): `GET wcd?{RSTP&interfaceType=1}` (Ports) or `wcd?{RSTP&interfaceType=2}` (LAGs) via "View By" filter. Rows `RSTP/InterfaceList/InterfaceEntry`; scalar `RSTP/pathCostDefaultValueType`.
- Read (edit): `GET wcd?{RSTP&interfaceName=<if>}`.
- Write (POST `wcd?{RSTP}`):
  ```xml
  <RSTP action="set"><pathCostDefaultValueType>(echo from read)</pathCostDefaultValueType>
    <InterfaceList><InterfaceEntry><interfaceName/><pointToPointAdminStatusMode/><activateProtocolMigrationTestEnabled/></InterfaceEntry></InterfaceList></RSTP>
  ```
- Fields:
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | interfaceName / interfaceID | port or LAG | - | Pkey | - |
  | portState | state (this page never shows Discarding) | 1 Disabled,2 Blocking,3 Listening,4 Learning,5 Forwarding,6 Broken, else Unknown | RO | - |
  | portRole | role | common enum | RO | - |
  | STPMode | mode on port | 1 STP, 2 RSTP | RO | - |
  | fastLinkStatusEnabled (table) / fastLinkOperStatus (edit) | Fast Link oper | 1 Enabled else Disabled | RO | - |
  | pointToPointAdminStatusMode | P2P admin | 0 Enabled, 1 Disabled, 2 Auto | radio | Auto (inferred) |
  | pointToPointOperationStatusMode | P2P oper | 1 Enabled else Disabled | RO | - |
  | activateProtocolMigrationTestEnabled | trigger protocol migration check | send 1 = run, 2 = no | checkbox (action, not state) | 2 |
- Gotchas: must echo pathCostDefaultValueType (global) in the same entry; checkbox is a one-shot action.

### rstp_table (legacy RomPager variant of RSTP; not in menu)
- Read: `GET API/rstp_table.htm?Filter:(ifOperStatus!=6)`; edit `API/rstp_table.htm?Query:(...)`. Rows `<col>$repeat?N`: dot1dStpPort, rlPhdPortsIfIndexName, dot1dStpPortState, dot3adAggPortActorAdminKey, rldot1dStpPortRole, rldot1dStpBpduType (0 STP, 1 RSTP), rlPhdPortsModuleNumber, dot1dStpPortOperEdgePort (1/2), dot1dStpPortAdminPointToPoint (0 Enabled, 1 Disabled, 2 Auto), dot1dStpPortOperPointToPoint (1/2), dot1dStpPortProtocolMigration (1/2), ifOperStatus; scalar dot1dStpVersion.
- Write: generic Tags save (changed `<col>$repeat?N` + `rstpTableAllVT$endRepeat?N=OK`) POST API/rstp_table.htm. Only dot1dStpPortProtocolMigration/ifOperStatus/state have real setters (AdminPointToPoint uses RL_NULLSet -> not writable here). Use RapidSpanningTree (wcd) instead.

### MSTP Properties (classic: ... > Spanning Tree > MSTP Properties)
- Read: `GET wcd?{MSTPGlobalSetting}` (scalar): regionName, revision, maxHops, ISTMasterPriority, ISTMasterAddr.
- Write: POST `wcd?{MSTPGlobalSetting}`: `<MSTPGlobalSetting action="set"><regionName/><revision/><maxHops/></MSTPGlobalSetting>` (all three always).
- Fields:
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | regionName | MST region name | string | 1-32 chars, required | bridge MAC (inferred) |
  | revision | MST config revision | int | 0-65535 | 0 (inferred) |
  | maxHops | max hops in region | int | 1-40 | 20 (inferred) |
  | ISTMasterPriority + ISTMasterAddr | IST master (instance-0 root), shown "prio-addr" | - | RO | - |

### VLAN to MSTP Instance (classic: ... > Spanning Tree > VLAN to MSTP Instance; page mstp_instance_table)
- Read (table): `GET wcd?{MSTPInstanceList}`; rows instanceID, VLANList (range string e.g. "1-5,7"). First entry (instance 0 / CIST) is removed from display.
- Read (edit): `GET wcd?{MSTPInstanceList&instanceID=<n>}`.
- Write — NOTE different section name MSTPVLANList, one Entry PER VLAN (ranges expanded client-side), POST `wcd?{MSTPInstanceList}`:
  - Add: `<MSTPVLANList action="set"><Entry><VLANID>10</VLANID><instanceID>1</instanceID></Entry>...</MSTPVLANList>`
  - Remove: `<MSTPVLANList action="restore"><Entry><VLANID>10</VLANID><instanceID>1</instanceID></Entry>...</MSTPVLANList>`
- Fields:
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | instanceID | MST instance | 1-15 (interface page dropdown) | Pkey | - |
  | VLANList (read) / VLANID (write) | VLANs mapped | csv/ranges | chars 0-9 , - only; no leading/trailing , or -; no "--" or ",,"; each 1-4094; non-empty | all VLANs in instance 0 (inferred) |
  | (Action rdoAction) | 0 Add, 1 Remove | - | - | Add |
- Gotchas: Remove only proceeds if at least one requested VLAN is currently in the instance ("None of the removed VLANs exist in this instance."), but then sends ALL requested VLANs (not just existing ones). Large ranges -> thousands of entries in one POST (3 s XHR timeout in classic). VLANs need not exist in VLAN DB (inferred).

### MSTP Instance Settings (classic: ... > Spanning Tree > MSTP Instance Settings; page mstp_instance)
- Read: `GET wcd?{MSTPInstanceList}` (all instances; dropdown = instanceID of entries 1..n, i.e. skips entry 0; default first non-zero instance). Entry fields: instanceID, VLANList, priority, dsgRootAddr, rootIfName, rootCost, brdgAddr, rmngHops.
- Write: POST `wcd?{MSTPInstanceList}`: `<MSTPInstanceList action="set"><Entry><instanceID>n</instanceID><priority>p</priority></Entry></MSTPInstanceList>`.
- Fields:
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | VLANList | included VLANs | - | RO | - |
  | priority | bridge priority for instance | int | 0-61440, must be 0 or multiple of 4096 (error suggests nearest) | 32768 (inferred) |
  | dsgRootAddr | designated root bridge ID | - | RO | - |
  | rootIfName | root port | - | RO | - |
  | rootCost | root path cost | - | RO | - |
  | brdgAddr | this bridge ID | - | RO | - |
  | rmngHops | remaining hops | - | RO | - |

### MSTP Interface Settings (classic: ... > Spanning Tree > MSTP Interface Settings; page mstp_interface_table)
- Read (default): `GET wcd?{MSTPInterfaceList&instanceID=1&interfaceType=1}{MSTPInstanceList&instanceID=1}{SpanningTreeGlobalParam}`.
- Read (filter: Instance 1-15, Ports=1/LAGs=2): `wcd?{MSTPInterfaceList&instanceID=<n>&&interfaceType=<t>}{MSTPInstanceList&instanceID=<n>&&interfaceType=<t>}{SpanningTreeGlobalParam}` (classic literally joins with `&&`; same string appended to both sections).
- Read (edit): `wcd?{MSTPInterfaceList&instanceID=<n>&interfaceName=<if>}{MSTPInstanceList&instanceID=<n>&interfaceName=<if>}{SpanningTreeGlobalParam}`.
- Write: POST `wcd?{MSTPInterfaceList}{MSTPInstanceList}{SpanningTreeGlobalParam}`:
  `<MSTPInterfaceList action="set"><Entry><instanceID/><interfaceName/><interfaceType/><priority/><adminPathCost/></Entry></MSTPInterfaceList>`; "Use Default" -> adminPathCost empty (inferred = default).
- Fields (MSTPInterfaceList entry):
  | field | meaning | values | range/validation | default |
  |---|---|---|---|---|
  | instanceID, interfaceName | keys | - | Pkey | - |
  | interfaceType | 1 port, 2 LAG | - | echo | - |
  | ifID | ifIndex | - | RO | - |
  | priority | interface priority | 0-240 step 16 | dropdown | 128 |
  | adminPathCost / operPathCost | admin / oper path cost | int | 1-200000000 or default | default |
  | enbl | enabled | 1/2 | RO | - |
  | state | port state | 1-6 common enum (no Discarding mapping) | RO | - |
  | role | role | 0 Unknown,1 Disabled,2 Alternate,3 Backup,4 Root,5 Designated (" port" suffix) | RO | - |
  | bndryEnbl | type | 2 Boundary, else Internal | RO | - |
  | STPVer, dsgRootPriority, dsgRootAddr, dsgBrdgPriority, dsgBrdgAddr, dsgIfPriority, dsgIfID, dsgCost, fwdTransitions | designated info | - | RO | - |
  | MSTPInstanceList.rmngHops | remaining hops (instance) | - | RO | - |
- Gotchas: every value displays "N/A" unless SpanningTreeGlobalParam.STPOperationMode == 3 (MSTP).

### Legacy: classic/SpanningTree/sta_bridge.htm (not referenced by any JS)
- RomPager page `/config/sta_bridge.htm`; form ACTION `/config/sat_bridge.htm` (sic, "sat"). Fields: selects rldot1dStpEnable (1 Enable, 2 Disable), dot1dStpVersion (0 Classic, 2 Rapid, 3 Multiple), rldot1dStpFilterBpdu (1 Filtering, 2 Flooding), dot1dStpPathCostDefault (1 Short, 2 Long); dot1dStpPriority (text, +$bnd, $help), dot1dStpBridgeForwardDelay/MaxAge/HelloTime (+$bnd; MIB units likely centiseconds, inferred); RO dot1dBaseBridgeAddress, dot1dStpDesignatedRoot, dot1dStpRootPort, dot1dStpTimeSinceTopologyChange. Superseded by spanning_tree_global_settings (wcd).


## MAC address tables + Multicast (classic X1018 fw 3.0.1.9)

General json2xml gotcha (serverManager.js): values must be **strings**. A JS number is walked with for..in and serialises to an empty element (`<VID></VID>`). Empty sections are skipped. If `post._order` is present, **only** the section/action pairs listed in it are emitted (everything else in `post` is dropped).

Note: `address_binding.js` is DHCP Server > Address Binding (not MAC tables). Out of scope here.

---

### Dynamic Address Table (classic: Network Administration > Port Settings > Address Tables > Dynamic Address Table; page `address_dynamic`, SystemName DynamicAddressTable)
- Read: `GET wcd?{ForwardingTable}{ForwardingGlobalSetting}`. This returns the full FDB in one bulk request, which can be slow or large on a busy switch.
  - Filtered ("Search Dynamic Address Table" dialog): `GET wcd?{ForwardingTable&filter=<expr>}{ForwardingGlobalSetting}`. `<expr>` joins terms with `&&` (built in buttonmanager.js, wcd branch):
    - `MACAddress='<as typed, e.g. 00:11:22:33:44:55>'` (filterParams type `MacToString` falls to `default` in the wcd branch, so the value is quoted verbatim).
    - `VLANID=<int>` (unquoted).
    - `interfaceName='<name with the first space removed, e.g. gi1/0/3 or LAG1>'`. The interface term is always appended last.
    - The classic UI uses each term only when its checkbox is ticked. URL-encode the expression when you send it.
  - XML: `ForwardingTable` holds repeated entries (element name not referenced in JS; probably `Entry`, (inferred)) with fields `VLANID, VLANName, MACAddress, interfaceName, interfaceType, addressType`. `ForwardingGlobalSetting/agingInterval`.
- Write, aging time: POST `wcd?{ForwardingTable}{ForwardingGlobalSetting}`
  `<ForwardingGlobalSetting action="set"><agingInterval>300</agingInterval></ForwardingGlobalSetting>` (scalar section, no entry wrapper).
- Write, clear all dynamic entries ("Clear All" button = MetaData.Remove; it ignores the selection):
  `<ForwardingTable action="deleteAll"><Entry></Entry></ForwardingTable>`
- Fields:

| field | meaning | values | range/validation | default |
|---|---|---|---|---|
| agingInterval | Address aging (s). Actual aging falls between N and 2N-1 | int | 10-630 (JS: numeric, 10..630) | not stated (300 typical, (inferred)) |
| VLANID | VLAN | int; values >= 4096 shown as "Internal Use" | filter: 1-4093, non-blank when ticked | |
| MACAddress | MAC | string `XX:XX:XX:XX:XX:XX` | filter: unicast MAC validation | |
| interfaceName | port/LAG name | `"none"` shown as "None" | | |
| addressType | entry type | 1 Secure, 2 Invalid, 3 Dynamic, 4 Self, 5 Static, 6 Dynamic-Static | | |
| VLANName, interfaceType | read-only extras, not displayed | | | |

- Gotchas: the table shows all address types, not only dynamic ones. The filter dialog's interface selector is a Port/LAG dropdownRadio, and the value used is the `_Text` (name) of the selected interface. Clearing removes every dynamic entry; the classic UI offers no per-entry delete.

---

### Static Address Table (classic: Network Administration > Port Settings > Address Tables > Static Address Table; page `address_static_table`, form page)
- Read: `GET API/address_static_table.htm`. Rows are `dot1qStaticUnicastAddress$repeat?N`, `dot1qFdbId$repeat?N`, `dot1qStaticUnicastReceivePort$repeat?N` (ifIndex), `dot1qStaticUnicastStatus$repeat?N`. There are also `PortString$repeat?N`, `Default$repeat?N`, `dot1qStaticUnicastStatus$default`, `AddressStaticVT$endRepeat?N` and `AddressStaticVT$default`. The MAC comes back as a plain hex string; the classic UI formats it with `fromStringToMacAddress`.
- Read VLAN list for the add dialog: `GET API/address_static_table_a.htm`. Its `dot1qVlanIndex$repeat?N` and `dot1qVlanStaticName$repeat?N` (VlanNameVT table) fill the VLAN dropdown, which also gets an extra "Routed Interfaces" option.
- Write, add: `POST API/address_static_table_a.htm` (form ACTION `/Forms/API/address_static_table_a.htm`) with restoreUrl, errorCollector and:
  - `dot1qStaticUnicastReceivePort$add=<ifIndex>`: port ifIndex, or LAG ifIndex = trunkFirstIndex+n-1.
  - `dot1qStaticUnicastAddress$add=<MAC as typed, XX:XX:XX:XX:XX:XX>`
  - `dot1qFdbId$add=<VLAN id>`. For "Routed Interfaces" send `ifIndex + 4096`.
  - `dot1qStaticUnicastStatus$add=<3|4|5|1>`
  - `AddressStaticVT$endAdd`: enabled as-is from the GET. The value is presumably `OK`, (inferred).
- Write, delete (multi-select): `POST API/address_static_table.htm`. For each selected row i (1-based within the selection):
  - `dot1qStaticUnicastAddress$repeat?i`, `dot1qFdbId$repeat?i`, `dot1qStaticUnicastReceivePort$repeat?i` = that row's key values
  - `dot1qStaticUnicastStatus$repeat?i=2` (invalid = delete)
  - `AddressStaticVT$endRepeat?i=OK`
- Fields:

| field | meaning | values | range/validation | default |
|---|---|---|---|---|
| dot1qStaticUnicastAddress | MAC | `XX:XX:XX:XX:XX:XX` | MacAddress validation, required | |
| dot1qFdbId | VLAN | VLAN id; >= 4096 shown as "Routed Interfaces" (ifIndex+4096) | existing VLAN | |
| dot1qStaticUnicastReceivePort | interface ifIndex | Port / LAG | | |
| dot1qStaticUnicastStatus | entry lifetime | 3 Permanent, 4 Delete on Reset, 5 Delete on Time Out, 1 Secure (2 = delete) | | 3 Permanent |

- Gotchas: choosing "Routed Interfaces" forces Status=Secure(1) and disables the radio. Any real VLAN resets Status to Permanent. Secure only makes sense on a port in classic locked mode (Port Security). There is no edit; to change an entry, delete it and add it again.

---

### Multicast Global Parameters (classic: Network Administration > Multicast > Global Parameters; page `MulticastGlobalSetting`)
- Read: `GET wcd?{MulticastMgmtList}{MulticastGlobalSetting}`.
  - `MulticastGlobalSetting` (scalar): `multicastFilterEnbl, IGMPSnoopEnbl, querierEnbl, MLDSnoopEnbl, MLDQuerierEnbl`.
  - `MulticastMgmtList`: repeated `MulticastMgmtEntry {VID, addrType, adminMode}`, one entry per VLAN per addrType (1=IPv4, 2=IPv6).
- Write: POST the same URI, single request. Sections are emitted in for-in order of the scalar data:
```
<MulticastGlobalSetting action="set"><multicastFilterEnbl>1</multicastFilterEnbl><IGMPSnoopEnbl>1</IGMPSnoopEnbl><querierEnbl>2</querierEnbl><MLDSnoopEnbl>2</MLDSnoopEnbl><MLDQuerierEnbl>2</MLDQuerierEnbl></MulticastGlobalSetting>
<MulticastMgmtList action="set"><MulticastMgmtEntry><VID>1</VID><adminMode>1</adminMode><addrType>2</addrType></MulticastMgmtEntry><MulticastMgmtEntry><VID>1</VID><adminMode>1</adminMode><addrType>1</addrType></MulticastMgmtEntry></MulticastMgmtList>
```
  The IPv6 entry is first, then IPv4; both are always sent for the selected VID. Field set of the scalar section: dataSource lists only `multicastFilterEnbl, IGMPSnoopEnbl, querierEnbl, MLDQuerierEnbl`, but ScalarData also binds `MLDSnoopEnbl`. Send all five (inferred).
- Fields:

| field | meaning | values | default |
|---|---|---|---|
| multicastFilterEnbl | Bridge Multicast Filtering | 1 Enabled, 2 Disabled | Enabled |
| IGMPSnoopEnbl | global IGMP snooping | 1/2 | Disabled |
| querierEnbl | global IGMP querier | 1/2 | Disabled |
| MLDSnoopEnbl | global MLD snooping | 1/2 | Disabled |
| MLDQuerierEnbl | global MLD querier | 1/2 | Disabled |
| MulticastMgmtEntry.VID | VLAN whose forwarding method is set | VIDs present in MulticastMgmtList (deduplicated) | |
| MulticastMgmtEntry.adminMode | forwarding method | 1 MAC Group Address, 2 IP Group Address, 3 Source Specific IP Group Address | (MAC, (inferred)) |
| MulticastMgmtEntry.addrType | 1 IPv4, 2 IPv6 | | |

- Gotchas: the read-only view hides the VLAN and forwarding-method rows. The edit view's VLAN dropdown re-selects both radios from the list. Snooping works only when Bridge Multicast Filtering is enabled.

---

### IGMP Snooping per VLAN (classic: Network Administration > Multicast > IGMP Snooping; page `IGMP_Snooping`)
- Read (table): `GET wcd?{IGMPMLDSnoopVLANList&addrType=1}{IPv4InterfaceList}{VLANCurrentStatus}`. This is bulk, one `VLANEntry` per VLAN. VLANCurrentStatus supplies the VLAN names shown as "VID (name)".
- Read (edit): `GET wcd?{IGMPMLDSnoopVLANList&addrType=1&VLANID=<vid>}{IPv4InterfaceList}`. The row Pkey is overridden to VLANID only. `IPv4InterfaceList` `ifEntry/IPAddr` fills the Querier Source IP dropdown; addresses whose first octet is 0 are skipped.
- Write: POST `wcd?{IGMPMLDSnoopVLANList&addrType=1}{IPv4InterfaceList}{VLANCurrentStatus}`
```
<IGMPMLDSnoopVLANList action="set"><VLANEntry><addrType>1</addrType><VLANID>5</VLANID><adminSnoopEnbl/><MRouterLearnEnbl/><immediateLeaveEnbl/><robustnessAdmin/><queryIntervalAdmin/><queryMaxResponseTimeAdmin/><lastMemberQueryIntervalAdmin/><lastMemberQueryCountAdmin/><querierAdminEnable/>[<querierAdminIPAddress/><querierAdminVersion/>]</VLANEntry></IGMPMLDSnoopVLANList>
```
  The bracketed fields are sent only when querierAdminEnable=1.
- Fields (entry `VLANEntry`, Pkey addrType+VLANID):

| field | meaning | values | range | default (inferred, standard) |
|---|---|---|---|---|
| VLANID | VLAN | | | |
| adminSnoopEnbl / operSnoopEnbl | IGMP snooping on VLAN (admin / oper) | 1 Enabled, 2 Disabled | | 2 |
| snoopVer | "Router IGMP Version" column (read-only) | shown as v<n> | | |
| MRouterLearnEnbl | MRouter ports auto-learn | 1/2 | | 1 |
| robustnessAdmin / robustnessOper | query robustness | int | 1-7 | 2 |
| queryIntervalAdmin / queryIntervalOper | query interval (s) | int | 30-18000 | 125 |
| queryMaxResponseTimeAdmin / queryMaxResponseTimeOper | max response (s) | int | 5-20 | 10 |
| lastMemberQueryCountAdmin / lastMemberQueryCountOper | last-member query counter | int | 1-7 | = robustness |
| lastMemberQueryIntervalAdmin / lastMemberQueryIntervalOper | LMQ interval (ms) | int | 100-25500 | 1000 |
| immediateLeaveEnbl | immediate leave | 1/2 | | 2 |
| querierAdminEnable / querierOperEnable | IGMP querier on VLAN | 1/2 | | 2 |
| querierAdminVersion / querierOperVersion | querier version | 2 v2, 3 v3 | | |
| querierAdminIPAddress / querierOperIPAddress | querier source IP | an IPv4 interface address of the switch | | oper `0.0.0.0` / `255.255.255.255` shown blank |

- Gotchas:
  - "Use Default" checkbox for Last Member Query Counter: it is pre-ticked when the admin count equals the admin robustness or is 0. When ticked, the classic UI sends `lastMemberQueryCountAdmin = robustnessAdmin`.
  - When querier is Disabled, the version and source-IP inputs are disabled and not sent.
  - Classic reads VLANID from the label text, which onEditDataFunction appends " (name)" to. A new UI must send the bare number.
  - Snooping is effective only if the global IGMP snooping setting and Bridge Multicast Filtering are both enabled. Static VLANs only.

### MLD Snooping per VLAN (classic: Network Administration > Multicast > MLD Snooping; page `MLD_Snooping`)
- Read: `GET wcd?{IGMPMLDSnoopVLANList&addrType=2}{VLANCurrentStatus}`. Edit: `GET wcd?{IGMPMLDSnoopVLANList&addrType=2&VLANID=<vid>}`. No IPv4InterfaceList.
- Write: same element as IGMP, but `addrType=2`. The querier block differs: when querierAdminEnable=1 it adds `querierElectionEnbl` (1/2) and `querierAdminVersion` (1 v1, 2 v2). It never sends querierAdminIPAddress.
- Fields: same names and ranges as IGMP, plus `querierElectionEnbl` (MLD Querier Election 1/2). There is no Querier IP column.
- Gotchas: same "Use Default" and VLANID-label quirks as IGMP. The JS radio name is still `rdoIGMPSnoopingStatus`, which is irrelevant to the wire format.

---

### Multicast Group (classic: Network Administration > Multicast > Multicast Group; page `igmp_member_table`)
- Read: `GET wcd?{LACPPortList&filter=actorAdminKey>0}{MulticastMacGroupPortList}{MulticastMacGroupList}{MulticastIPGroupList}{MulticastIPGroupPortList}{VLANCurrentStatus}`. This is bulk, all VLANs.
  - `MulticastMacGroupList`: `GroupEntry {VID, groupAddr}`. MAC strings `01:00:5e:..` mean IPv4; anything else (`33:33:..`) means IPv6.
  - `MulticastIPGroupList`: `GroupEntry {VID, groupAddr, srcAddr, addrType}` (addrType 1 IPv4, 2 IPv6).
  - `MulticastMacGroupPortList` / `MulticastIPGroupPortList`: `GroupEntry {VID, groupAddr, [srcAddr], staticPortList, forbdnPortList}`. The port lists are comma-separated names with ranges, e.g. `gi1/0/1-4,LAG1`. In a range, the end is a bare number with the same prefix. The parser understands prefixes `lag`, `tunnel`, `vlan` and port names.
  - LACPPortList (`interfaceID`, `actorAdminKey`) maps ports to LAGs.
- UI: an IPv4/IPv6 radio filters the VLAN dropdown to VLANs that have groups of that family. The group dropdown is built from IP groups plus MAC groups of the selected VLAN. Labels show the mapped IP: a MAC group's IPv4 label is the ambiguous `224-239.<b|b+128>.x.y` form, and IPv6 groups show as `ff00::xxxx:xxxx`. The source dropdown lists `srcAddr` values of matching IP groups. Port grid states: S=1 static, F=2 forbidden, 0 none, read from the MacGroupPortList entry.
- Write, add group (Add dialog):
```
<MulticastIPGroupPortList action="set"><GroupEntry><VID/><groupAddr>ip</groupAddr><srcAddr>src|0.0.0.0</srcAddr><staticPortList>gi1/0/1,gi1/0/2</staticPortList><forbdnPortList/></GroupEntry></MulticastIPGroupPortList>
<MulticastMacGroupPortList action="set"><GroupEntry><VID/><groupAddr>mac</groupAddr><staticPortList/><forbdnPortList/></GroupEntry></MulticastMacGroupPortList>
```
  Both sections are always sent. With mode None, the port lists are empty. Port names are `getInterfaceNameAccordingToValue` with the first space removed (`LAG 1` becomes `LAG1`).
- Write, change port membership (edit Save on the selected VLAN/group). For each selected port whose current state differs from the chosen mode:
  - mode Static or Forbidden: the port goes into the new list, and its old state's list goes into the delete list.
  - mode None: the port goes into both delete lists.
  - Classic sends only:
```
<MulticastMacGroupPortList action="delete"><GroupEntry><VID/><groupAddr>mac</groupAddr><staticPortList>del</staticPortList><forbdnPortList>del</forbdnPortList></GroupEntry></MulticastMacGroupPortList>
<MulticastMacGroupPortList action="set"><GroupEntry><VID/><groupAddr>mac</groupAddr><srcAddr/><staticPortList>new</staticPortList><forbdnPortList>new</forbdnPortList></GroupEntry></MulticastMacGroupPortList>
```
  The IPGroupPortList delete/set objects are built but dropped, because `_order` is overwritten to list only the MAC sections (classic bug). groupAddr is the dropdown value, i.e. the raw groupAddr from the list (could be an IP string for IP groups, (inferred)).
- Write, delete group (Remove), `_order` = IP delete then MAC delete:
```
<MulticastIPGroupList action="delete"><GroupEntry><VID/><groupAddr>ip</groupAddr>[<srcAddr/>]</GroupEntry></MulticastIPGroupList>
<MulticastMacGroupList action="delete"><GroupEntry><VID/><groupAddr>mac</groupAddr></GroupEntry></MulticastMacGroupList>
```
  For an IPv4 IP group, the MAC is derived from the IP (01:00:5e + low 23 bits). If only one of the two sections is applicable, the empty one is omitted.
- Fields (Add):

| field | meaning | validation |
|---|---|---|
| IP Format | IPv4/IPv6 (UI only) | |
| VID | VLAN | from VLANCurrentStatus (ifIndex-100000+1) |
| groupAddr (IP) | New Bridge IP Multicast | IPv4 224.0.0.0-239.255.255.255 / IPv6 multicast; required |
| groupAddr (MAC) | New Bridge MAC Multicast | multicast MAC; required |
| srcAddr | Source address (SSM) | IPv4/IPv6 when "Use Default" is unticked; ticked sends `0.0.0.0` (also for IPv6) |
| port lists | Static (1) / Forbidden (2) / None (0) for selected ports/LAGs | |

- Gotchas:
  - The IP and MAC fields auto-fill each other on blur. IPv4 IP to MAC is `01:00:5e` + low 23 bits; IPv6 to MAC is `33:33` + last 32 bits. A MAC typed for IPv4 becomes the ambiguous `224-239.x|y.z.w` form, and classic then rewrites it to `224.`+rest.
  - Port/LAG grids are toggled by an Interface radio.
  - Group/port effectiveness depends on the VLAN's forwarding method (Global Parameters adminMode).

---

### Multicast Forward All (classic: Network Administration > Multicast > Multicast Forward All; page `igmp_router_table`)
- Read: `GET wcd?{LACPPortList&filter=actorAdminKey>0}{MulticastForwardAllList&VLANID=<vid>}{VLANCurrentStatus}`. This covers one VLAN per request; the initial request uses the default VLAN. The VLAN filter dropdown re-requests with `{LACPPortList}` (no filter) and the new VLANID.
  - `MulticastForwardAllList[0]`: `{VLANID, staticPortList, forbdnPortList}`, with port lists in the same name/range format as above.
- Write: POST the same URI, `_order` = delete then set:
```
<MulticastForwardAllList action="delete"><VLANEntry><VLANID>5</VLANID><staticPortList>del</staticPortList><forbdnPortList>del</forbdnPortList></VLANEntry></MulticastForwardAllList>
<MulticastForwardAllList action="set"><VLANEntry><VLANID>5</VLANID><staticPortList>new</staticPortList><forbdnPortList>new</forbdnPortList></VLANEntry></MulticastForwardAllList>
```
  The delete/new list computation is the same as in Multicast Group edit.
- Fields: per-port mode 1 Static (receives all multicast), 2 Forbidden (never receives, even if snooping joins it), 0 None. Applies only to ports that are members of the VLAN.
- Gotchas:
  - `selectedVlan` comes from the response (`MulticastForwardAllList[0].VLANID`). It may be a string or number; if it is a number, json2xml would emit an empty VLANID, so send a string.
  - Port vs LAG grid toggle.

---

### Unregistered Multicast (classic: Network Administration > Multicast > Unregistered Multicast; page `igmp_member_unreg`, form page)
- Read: `GET API/igmp_member_unreg.htm`. "View By" re-reads with `?Filter:((dot1dBasePort >= <start>) && (dot1dBasePort < <start+n>))` for ports or LAGs. The only data field is `rlMacMulticastUnregFilterEnable$scalar`: a hex octet string bitmap, MSB-first, where bit (ifIndex-1) = 1 means Filtering and 0 means Forwarding. The classic UI pads it to trunkFirstIndex-1+NumberOfTrunks bits.
- Write: `POST API/igmp_member_unreg.htm` (template ACTION `/api/igmp_member_unreg.htm`, lowercase, no `/Forms`). Send `restoreUrl`, `errorCollector` and `rlMacMulticastUnregFilterEnable$scalar=<whole new bitmap as hex>`, with one bit flipped per edit. Hex is uppercase from decToHex, padded with `0` to an even length.
- Fields: per interface 0 Forwarding, 1 Filtering. Default Forwarding (inferred). The setting applies to all VLANs the port is in.
- Gotchas:
  - Read-modify-write of the whole bitmap. Read it fresh before writing, or you will clobber other ports.
  - Only existing ports are listed (`existedPortsArr`).

---

### Multicast TV VLAN Membership (classic: Network Administration > Multicast > Multicast TV VLAN > Membership; page `bridg_multicast_TV_m`, form page, read-only)
- Read: first `GET API/bridg_multicast_TV_m.htm`. `dot1qVlanIndex$select` gives the TV VLAN choices, and `dot1qVlanIndex$query` is the current one (" " = none). Then:
  `GET API/bridg_multicast_TV_m.htm?[ifTable]Filter:(ifOperStatus!=6)^[vlanAccessPortModeTable]Filter:(ifIndex!=0)&&(vlanAccessPortModeMcstTvVlanId=<vid>)[dot1qVlanCurrentTable]Query:dot1qVlanTimeMark=0@dot1qVlanIndex=<vid>`
  - `dot1qVlanCurrentEgressPorts$query` is a hex bitmap of the VLAN's egress ports.
  - `ifTable` `ifIndex$repeat1?N` / `ifOperStatus$repeat1?N`
  - `vlanAccessPortModeTable` `ifIndex$repeat?N` / `vlanAccessPortModeMcstTvVlanId$repeat?N` (access ports mapped to this TV VLAN)
- Display: of the egress ports, those whose ifIndex appears in the returned ifTable are listed as "Transceiver Ports" and the rest as "Receiver Ports". This is the literal classic logic; the semantics are murky (the `^` join likely restricts ifTable, (inferred)).
- Write: none. Receiver access-port mapping to a TV VLAN is configured elsewhere (VLAN port settings / `vlanAccessPortModeMcstTvVlanId`).

### Multicast TV VLAN Mapping (classic: Network Administration > Multicast > Multicast TV VLAN > Mapping; page `bridg_multicast_TV_Map`, form page)
- Read: `GET API/bridg_multicast_TV_Map.htm`. Table T1 has rows `rlIgmpSnoopMulticastTvVID$repeat?N`, `rlIgmpSnoopMulticastTvGroup$repeat?N`, `rlIgmpSnoopMulticastTvStatus$repeat?N`, and `T1$endRepeat?N`.
- Write, add: `POST API/bridg_multicast_TV_Map_a.htm` (ACTION `/Forms/api/bridg_multicast_TV_Map_a.htm`) with `rlIgmpSnoopMulticastTvVID$add=<vid>`, `rlIgmpSnoopMulticastTvGroup$add=<IPv4 group>`, `rlIgmpSnoopMulticastTvStatus$add=4` (createAndGo) and `T1$endAdd=OK`.
- Write, delete (multi-select): `POST API/bridg_multicast_TV_Map.htm`. Per selected row i: `rlIgmpSnoopMulticastTvVID$repeat?i`, `rlIgmpSnoopMulticastTvGroup$repeat?i` (keys), `rlIgmpSnoopMulticastTvStatus$repeat?i=6` (destroy), and `T1$endRepeat?i=OK`.
- Fields:

| field | meaning | validation |
|---|---|---|
| rlIgmpSnoopMulticastTvVID | TV VLAN ID | int 1-4094, required |
| rlIgmpSnoopMulticastTvGroup | multicast group IP mapped to the TV VLAN | IPv4, non-blank (hint "224-239.X.X.X") |
| rlIgmpSnoopMulticastTvStatus | RowStatus | 4 create, 6 destroy |

- Gotchas: there is no edit; delete and re-add. Requires IGMP snooping on the TV VLAN (per docs).
