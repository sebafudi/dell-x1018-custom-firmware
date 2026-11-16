# X1018 classic web UI (3.0.1.9) catalogue: QoS, ACLs, security extras, diagnostics/stats, Dashboard, platform flags

Built only by reading files: the decompressed classic UI (`EWS_FILE`) and the platform parameter files in the image (`*.raw` sections). No requests went to the switch. Anything marked "(inferred)" was not read directly.

Contents:
1. Transport conventions (common to every section)
2. Platform capability flags (what exists on X1018)
3. Dashboard
4. QoS
5. ACLs and time ranges
6. Security extras (802.1X, DHCP snooping, DAI, IP Source Guard)
7. Diagnostics, statistics, RMON, routing tables, sFlow, PoE

---

## 1. Transport conventions

Source: `js/views.js` (`jqueryPostFunc`, `tagPostFunc`, `jqueryBasicTableEditDF`, Tags edit query builder around line 1030) and `js/components/serverManager.js` (`get`, `post`, `wcd`, `wcdPost`, `json2xml`).

Each page's descriptor in `js/metadata.js` gives `PageType` plus `GetDataURI` / `SetDataURI` / `GetEditDataURI` / `GetAddDataURI`. The page type decides the transport.

### wcd pages (`PageType: pageType.jQuery`)
- **Read:** `GET wcd?{A}{B&filter=(expr)}{C&key=val}`.
  - In an edit URI, `&query` is replaced by `&<pkey>=<encodeURIComponent(val)>` for each primary key of the selected row.
  - Response: `ResponseData/DeviceConfiguration/<Section>`. Sections whose names end in `List`/`Table` hold repeated entries; others are scalars. There is also an `ActionStatus` element.
- **Write:** `POST <SetDataURI>`.
  - Body from `json2xml`: `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><Sec action="set|add|delete|restore|edit">…</Sec>…</DeviceConfiguration>`.
  - Without a custom handler, a table section is written as `<Sec action="set"><Entry>fields+pkeys</Entry></Sec>`. The entry tag is the data source's `entryField`, defaulting to `Entry`.
  - `post._order=[{section,action},…]` fixes the order of sections in a multi-section write.
  - Success is `ActionStatus/statusCode == 0`.
  - The classic XHR timeout is **3000 ms**, and a timeout logs the user off. A new UI needs a longer timeout for slow actions such as the cable test.
- **Async jobs** (Dashboard `ConfigInfoExecute`): POST the job, then poll `wcd?{ConfigInfoStatus}` until `state == 6`, then read `wcd?{ConfigInfoOutputList}`. Classic busy-loops with no delay; a new UI should sleep between polls.

### Form pages (`PageType: pageType.Tags`): RomPager templates in `API/*.htm`
- **Read:** `GET API/<page>.htm[?…]`.
  - Query suffix grammar: `[VTname]Filter:(expr)` and/or `[VTname]Query:col=val@col2=val2`. `^` joins a filter and a query. The edit URI is the page's `GetEditDataURI` with `Query:(&query)` replaced.
  - Values come back as hidden inputs:
    - `<obj>$scalar`: scalar values
    - `<col>$repeat?N`: table rows
    - `<col>$query`, `<VT>$VT`, `$endVT`: virtual-table edit rows
    - `$add`, `$select`: add and select rows
    - `mibError`: errors
- **Write:** `POST` the same `API/<page>.htm` (without its `?…` part) as `application/x-www-form-urlencoded`.
  - The body is only the inputs that are **enabled**. The page JS enables the fields it wants to send and sets a terminator such as `<VT>$endQuery=OK`, `…$endRepeat?N=OK` or `…$endAdd=OK`.
  - `restoreUrl` and `errorCollector` are always present.
  - Values are escaped: a space becomes U+00A0, and `*@-_+./` are percent-encoded.
  - The template declares the only fields the device will accept. The form endpoints are not a generic MIB gateway.
  - Row create/delete often goes through a RowStatus-like column, e.g. 4 = createAndGo, 6 = destroy. Exact values are given per page below.
- The section parts below note several cases where classic JS names a terminator that does not exist in the template, or never sets one. Take field names **from the API template**, not from the classic JS.

### Port index range used in filters
Many reads filter on `ifIndex` in `[StartingPortPerModuleArr[firstPresentModule], +NumberOfPortPerModuleArr)`. These come from the `wcd?{ports}` / `wcd?{units}{fullInterfaceList}` poll (`polling/eventPolling.js`). LAGs start at hostparam `l2_first_trunk_ifIndex`.

---

## 2. Platform capability flags (X1018)

### Runtime flags the UI reads
At login the UI loads `wcd?{general&HostParam=/js/hostparams.js}`. `js/hostparams.js` maps UI names to platform parameter names, read through `getHostParam(name)`:

| UI name | Platform parameter | UI name | Platform parameter |
|---|---|---|---|
| poeSupported | `poe.supported` | sflowSupported | `sflow.supported` |
| udldSupported | `udld.supported` | rateLimit | `cosParams_ingressRateLimitSupported` |
| numOfQueue | `bridge_numOfTCPerPort` (default 4) | PolicyClassMapsCir/CbsMin/Max/Default | `cosparams_policer_*` |
| pveSupported | `vlan_pve_supported` | ipv6Supported | `ipv6_general_ipv6_supported` |
| ipv6forward_supported | `IP6.uc_forward_supported` | routersIPforward | `routers_ip_forward` |
| systemModeEditable | `tuning_features_enable_edit_allowed` (bit 6) | energyDetectSupported | `GreenEthernet_ED_is_supported` |
| protectedPorts* | `protected_ports_pp_*` | udpRelay_max_num_of_entries | same name |

`js/globalParameters.js` `Conditions` gates menu items:
- `POE_Supported`
- `sflowSupported`
- `SystemMode.L3Mode`: `globalParameters.displayRouter`. The routing pages appear only in L2+ (router) mode; otherwise a "requires L2+ mode" link stub is shown.
- `systemModeEditable`

### Static platform parameters
Files: `HPRM.raw` is the base; `X10XX_L3.raw` is the X10xx overlay; `POE*.raw` are PoE-model overlays; `ADV_FAMILY.raw` is for another family (inferred).

| Parameter | X1018 value | Effect |
|---|---|---|
| `PoE.supported` | **FALSE** (the TRUE value is only in the `POE.raw` overlay, for X10xxP models) | PoE menu hidden; dashboard PoE gauge not drawn |
| `SFLOW.supported` | **FALSE** in HPRM; X10XX_L3 does not override it. `ADV_FAMILY.raw` sets TRUE, but that overlay is not X10xx (inferred) | sFlow menu hidden |
| `SRC_Guard.supported` | **FALSE** | IP Source Guard: no page and no API template exists |
| `FHS`, `RA_Guard`, `ND_Inspection`, `DHCPv6_Guard`, `NBI`, `DHCPV6_Relay` | FALSE | IPv6 first-hop security not available |
| `ip_std_acl.supported` | FALSE | Standard IP ACLs not available; extended MAC/IPv4/IPv6 ACLs are used |
| `LED.supported` | FALSE | Identify page is still shown (not gated). Whether the LED blinks is unverified (inferred) |
| `Fiber.supported` | FALSE; `Fiber.sfp_eeprom_supported` is TRUE | Optical diagnostics only for SFP ports with DDM (inferred) |
| `SCT.supported` | TRUE (`managementSupported` FALSE) | (inferred: smart cable test; the cable-test page is ungated anyway) |
| `VLAN.pve_supported` | FALSE | |
| `DCE`, `PFC`, `DCBX`, `ETS`, `QCN`, `CDP`, `voip`, `Bonjour`, `AP`, `Internal_Ports` | FALSE | |
| `Modes.networking_type` | `router_no` by default; `Modes.Qos` = `Qos_no` | Default system mode is L2. IPv4/IPv6 route pages need L2+ mode, which takes a reboot. ARP, IPv6 Neighbors and Identify are always shown |
| `IP6.supported` / `uc_forward_supported` | TRUE (X10XX_L3) | IPv6 pages exist |
| `UDLD.supported` | TRUE | |
| `unit.max_number_of_units` | 1 | Standalone; no stacking |

Pages in the tree that are orphaned (present in the source but not reachable from the menu):
- `cosqos_global`, `dscp_rewrite_edit`, `cosqos_int_basic`: basic-mode QoS
- `network_authen_monitor_table`
- `ipv4_static_route_table`

---

## 3. Dashboard (page `Dashboard`, `js/Pages/Dashboard.js`, `tpl/Dashboard.htm`, `js/uiComponents/Dashboard/*`)

Menu: top-level **Dashboard**. `GetDataURI: welcome.htm` is not used for data.

### Load sequence (`Dashboard.GetDataFromServer`)
1. `POST wcd?{ConfigInfoExecute}`:
   `<DeviceConfiguration><ConfigInfoExecute action="set"><type>4</type></ConfigInfoExecute></DeviceConfiguration>`
   This starts an async job that lists the configured ports (inferred from use).
2. One large read:
   `GET wcd?{PortAppliedMacroList&interfaceType=1}{VLANCurrentStatus}{DiagnosticsUnitList}{VLANMembershipInterfaceList&interfaceType=1}{LACPPortList&filter=actorAdminKey>0}{MemoryLogTable&count=3}{SyslogSeverityCounters}{StackInfoTable}{SystemGlobalSetting}{SNMPGlobalSetting}{CommunityList}{AdminUserSetting}{IPv4InterfaceList&filter=(IPAddr>=1.0.0.0)}{TimeSetting}{IPv4GatewayList}`
3. Poll `GET wcd?{ConfigInfoStatus}` until `ConfigInfoStatus/state == "6"`. The classic code busy-loops twice.
4. `GET wcd?{ConfigInfoOutputList}`. Each entry's `text` is a port name like `gi1/0/N`; the number after the second `/` is the port. "Ports configured" = list length − 1.

### Fields used, by section
- **`DiagnosticsUnitList[0]`:**
  - `tempSensorStatus`: anything other than 1 shows "Temperature: Hot".
  - `fan1Status`…`fan5Status`: a fan is OK if its value is 1 or 5. All OK shows "Fan: On", otherwise "Fan: Off".
  - `mainPSStatus`, `redundantPSStatus`: only interpreted for module type 171 (PoE+ input); 1 = OK, 5 = not connected, 6 = off.
  - Module types 171/172/173/175 show "Temperature: Not Applicable". Types 171/173/175 show "Fanless".
- **`SystemGlobalSetting`:** `systemDescription` (header), `MACAddress`, `systemName`, `systemContact`, `systemLocation`, `firmwareVersion`.
- **`StackInfoTable[0].assetTag`.**
- **`TimeSetting.CurrentLocalTime`:** `{hour, minute, day, month, year}`, shown as "As of hh:mm d/m/y".
- **`IPv4InterfaceList`:** the row whose `IPAddr` equals the browser's hostname, else row 0. Uses `IPAddr`, `subnetMask`, `interfaceName`, and `owner` (1 = Static, else Dynamic; read side).
- **`IPv4GatewayList[0].IPAddr`:** gateway.
- **`AdminUserSetting/AdminUserList[0].userName`.**
- **`VLANCurrentStatus`:** `currentVLANsNumber`, and `currentVLANs` (range string such as `1,10-20`).
- **`VLANMembershipInterfaceList`** (one row per port, in index order): `currentTaggedVLANs`, `currentUntaggedVLANs`, `portVLANMode`. Mode letters: 10 = G (general), 11 = A (access), 12 = T (trunk), other = O.
- **`LACPPortList`:** `actorAdminKey`, `interfaceID`. LAG number = `actorAdminKey − (trunkFirstIndex − 1)`.
- **`PortAppliedMacroList`:** `interfaceName`, `appliedMacro` (port profile, smartport macro).
- **`MemoryLogTable&count=3`:** `severityType`, `dateTime` (MMDDYYYY hh:mm:ss, shown DD/MM/YYYY), `message`. Severity groups: 0–2 = Urgent, 3–4 = Major, 5–6 = Informational.
- **`SyslogSeverityCounters`:** `emergency`+`alert`+`critical` = Urgent, `error`+`warning` = Major, `notice`+`info` = Informational ("Active Alerts" counts).

### Alert drill-downs
- `wcd?{MemoryLogTable}` (all)
- `wcd?{MemoryLogTable&filter=(severityType=0||severityType=1||severityType=2)}`
- `…(severityType=3||severityType=4)`
- `…(severityType=5||severityType=6)`

### Port panel status
Comes from the global `wcd?{ports}` poll (`polling/projectFunctions.js`), not from the dashboard read. Per port it uses `operStatus`, `suspStatus`, `adminStatus`, `transType`, `swIfType`, `ifSpeed`, `POESupported`, `relUnit`, `portName`.
- Status: operStatus 1 = "Up"; else suspended = "Error"; else adminStatus 1 = "Inactive"; else "Disabled". operStatus 6 = not present.
- Port type: transType 1 = Copper; swIfType 3/4 = Fiber.
- Tabs: Port, VLAN, LAG, Port Profile.

### Per-interface running config (Ports and VLANs widget, "select interface")
1. `POST wcd?{ConfigInfoExecute}`, with `_order` RemoteCLITable then ConfigInfoExecute:
   `<RemoteCLITable action="set"><Entry><commandText>exit</commandText></Entry><Entry><commandText>exit</commandText></Entry></RemoteCLITable><ConfigInfoExecute action="set"><type>1</type><interfaceName>gi1/0/N</interfaceName></ConfigInfoExecute>`
2. Poll `ConfigInfoStatus` until state is 6.
3. `GET wcd?{ConfigInfoOutputList}` and join the `text` entries (these are the CLI lines).

### Gauges
- **Gauge 1** "Resources": temperature, fan and power text. It calls `DrawInfoGauge(1, 20)` with a **hard-coded 20**, not CPU.
- **Gauge 2** "Bandwidth": two reads of `API/sum_utilize.htm?[sumCounterTable]Filter:((ifIndex >= S) && (ifIndex < S+N))` taken **2 s apart** (the classic code busy-sleeps). Utilization comes from the octet deltas via `sum_utilize.js` helpers.
  - Counter columns: `ifHCInOctets$repeat?`, `ifHCOutOctets$repeat?`, `ifIn/OutUcastPkts`, `ifIn/OutNUcastPkts`, `ifIn/OutErrors`.
  - Cap = Σ port speed by swIfType (1 = 10M, 2 = 100M, 3 = 1G, 4 = 10G) × 2, in Gb.
- **Gauge 3** "PoE": only when `poeSupported`, which is never on X1018. Reads `wcd?{PoEPSEUnitList}{PoEPSEInterfaceList}{PoEGlobalSetting}`, using `nominalPower`, `consumptionPower`, and `outputPower>0` per port.
- Gauge pinning is stored in browser `localStorage` (`GaugeWrapper1..3`) and never on the switch.

### Switch Information quick edit (SwitchInformationContainerManager; only for access level 15 and L3 mode)
`POST wcd?{IPv4InterfaceList&filter=(interfaceName='VLAN<defaultVlanId>')}[{IPv4GatewayList}]` with:
- `IPv4InterfaceList set <ifEntry>{IPAddr, interfaceName, subnetMask, owner}`
- `IPv4GlobalSetting set {IPv4ManagementAddress, managementInterfaceName}`
- `IPv4GatewayList set <GWEntry>{IPAddr, owner=1}`

Gotcha: on write, `owner` is 2 for static, which looks inverted against the read meaning (1 = static).

### Other Dashboard behaviour
- The Wizards buttons (`confPorts`, `confInitSetup`, `confPortProfile`, `confVlan`, `confLag`) open the wizard pages, which are out of scope here.
- When the startup config is empty (`isStartupEmpty`), the initial-setup wizard opens automatically on first load.

### Gotchas
- The dashboard load is slow: an async job, a 15-section read, polling, and then 2 × sum_utilize with a 2 s sleep.
- For a new UI: run the ConfigInfo job only when the "configured ports" count is needed, and poll with a delay.
- `ConfigInfoExecute` is shared global state; concurrent users or tabs can clobber each other's output (inferred).

---

## 4. QoS

Source: C/js/Pages/<page>.js, C/API/*.htm, C/documentation/*.html, C/js/tree_Items.js, C/js/metadata.js.
Menu (tree_Items.js): Network Administration > Quality of Service >
- Global Settings: default_cos, cosqos_queue, cosqos_to, cosqos_dscp, cosqos_port_band_table, tcp_congestion
- QoS Mapping: cosqos_dscp_map, cosqos_cmap, agg_policer_table, map_policy_table, qos_policyClassMaps, cosqos_service
- QoS Statistics: policer_statistics, cosqos_agg_stat, queues_statistics
- NOT in menu (orphans): cosqos_global ("Global Settings"), cosqos_int_basic ("Trust Settings"), dscp_rewrite_edit ("DSCP Rewrite"). `networkAdministation_QualityOfService_Interface_Settings = [cosqos_int_basic]` is defined but never attached to the accordion. No help pages for them in toc.html.

### Cross-cutting: hostparams, QoS mode, form conventions

Hostparams (js/hostparams.js -> globalParameters, loaded from `wcd?{general&HostParam=/js/hostparams.js}` rlHostParamTable; every row also lands in `_top.hostParams[<lowercased name>]`):
| globalParameters key | hostparam | default in globalParameters.js | used by |
|---|---|---|---|
| numOfQueue | bridge_numOfTCPerPort | 4 | cosqos_queue (row count, loops), cosqos_to / cosqos_dscp (queue dropdown 1..N), qos_policyClassMaps (Set Queue max), queues_statistics (queue dropdown 1..N + All) |
| rateLimit | cosParams_ingressRateLimitSupported | 0 | not referenced by any QoS page JS (only port_profile_table) |
| PolicyClassMapsCirMin/CirMax/CbsMin/CbsMax/CbsDefault | cosparams_policer_min_rate / _max_rate / _min_burst / _max_burst / _default_burst | null (note typo `PolicyClassMapsCbsMa` in globalParameters.js) | NOT used by qos_policyClassMaps (it hard-codes CIR 100..1000000, CBS 3000..16769020) |
| (direct hostParams[]) | cosparams_shaper_min_rate, cosparams_shaper_max_rate, cosparams_shaper_min_burst, cosparams_shaper_max_burst, cosparams_policer_min_rate, cosparams_shaper_burst_default, cosparams_policer_default_burst | — | cosqos_port_band_table.initQosDefaultValues. The cosparams_shaper_* names are not in hostparams.js, so they may be absent -> NaN (inferred) |
X1018 queue count: docs table "x1008/P, x1018/P, x1026/P" uses 4 queues (CoS 0..7 -> 1,1,2,3,3,4,4,4; DSCP 0-15 Q1, 16-31 Q2, 32-47 Q3, 48-63 Q4) -> numOfQueue = 4 on X1018 (inferred from docs + default). Help page qos_queue_scheduling.html says "eight queues" (generic text).

QoS mode (rlQosModeGlobalCfgTable, VT name `QosModeGlobalVT`, key rlQosGlobalIndex):
- Fields present in templates: rlQosGlobalIndex, rlQosGlobalQoSMode, rlQosBasicGlobalTrustMode, rlQosAdvcGlobalTrustMode, rlQoSPortTrustAdvancedMode, rlQosDscpMutationEnable.
- rlQosGlobalQoSMode values: 3 = Advanced (cosqos_dscp_map.js `var Advanced = 3`); 2 = basic (templates use server-side `RL_updateTagSelectorGet name="rlQosGlobalQoSMode=2"` + `RpDynamicDisplay RL_dynamicIfDef` in cosqos_global/dscp_rewrite_edit/cosqos_int_basic; `"rlQosGlobalQoSMode=3"` in cosqos_cmap/create_new_cmap). 1 = disable (inferred, standard Radlan MIB).
- No page in this UI writes rlQosGlobalQoSMode (there is no mode switch). Only client-side check: cosqos_dscp_map shows "The device is currently not in CoS/QoS Advanced mode." and hides the Edit button when mode != 3. Templates many QoS pages carry the QosModeGlobalVT block only for read/conditional rendering.
- rlQosBasicGlobalTrustMode: 1 = CoS, 2 = DSCP (cosqos_global). rlQosDscpMutationEnable: 1 = Enabled, 2 = Disabled.

Form-page conventions used below: Tags pages read `GET API/<page>.htm[?Filter:...]`, edit dialogs read `GetEditDataURI` with `Query:(&query)` replaced by `Query:<pkey>=<val>@<pkey2>=<val2>` (pkey names stripped at `$`). POST body = serialize() of enabled inputs; inputs NOT marked disabled in the template are always sent with their fetched value (incl. restoreUrl, errorCollector, mibError, and any undisabled VT header inputs). "Row slot N" (`$repeat?N`) in Remove/Restore functions is the 1-based position in the *selected rows list*, not the table row (the key field value identifies the row). `getDefaultValue(name)` reads "Default value=X" out of the `<field>$VT` hidden input's metadata string (server-provided defaults).

---

### QoS Properties (default CoS per port/LAG) — page `default_cos`
Classic: Network Administration > Quality of Service > Global Settings > QoS Properties. Help: GlobalSettingsQoSProperties.html "QoS Properties".
- Read (table): `GET API/interface_table.htm?Filter:((dot1dBasePort >= S) && (dot1dBasePort < S+N))`. Ports: S = StartingPortPerModuleArr[firstPresentModule], N = NumberOfPortPerModuleArr[...]. LAGs ("View By" = LAGs): S = trunkFirstIndex, N = NumberOfTrunks. First load is unfiltered then onDataFunction re-routes with the Ports filter (double fetch).
  - VT `portPriorityTable` (lead dot1dPortPriorityTable, alt keys rlPhdPortsIfIndex=dot1dBasePort, ifIndex=dot1dBasePort; extra VT fields rlPhdPortsIfIndex, rlPhdPortsIfIndexName, rlPhdPortsStackUnit, rlPhdPortsModuleNumber, ifIndex, ifOperStatus). Rows: `dot1dBasePort$repeat?N`, `rlPhdPortsModuleNumber$repeat?N`, `dot1dPortDefaultUserPriority$repeat?N`, `portPriorityTable$endRepeat?N`.
- Edit read: `GET API/interface_table_e.htm?Query:dot1dBasePort=<ifIndex>`.
- Write (edit): `POST API/interface_table_e.htm` enable+set `dot1dBasePort$query`, `dot1dPortDefaultUserPriority$query`, `portPriorityTable$endQuery=OK` (Save enables every input whose name ends with `endQuery`) + restoreUrl, errorCollector.
- Write (Restore Default, button enabled only when >=1 row checked): `POST API/interface_table.htm` for each selected row slot k: `dot1dBasePort$repeat?k=<ifIndex>`, `dot1dPortDefaultUserPriority$repeat?k=<getDefaultValue("dot1dPortDefaultUserPriority$repeat")>`, `portPriorityTable$endRepeat?k=OK`.
- Fields:
| field | meaning | values | range | default |
|---|---|---|---|---|
| dot1dBasePort | interface ifIndex (shown via interfaceManager name) | — | — | key |
| dot1dPortDefaultUserPriority | default CoS for untagged ingress | 0..7 dropdown | 0-7 | from $VT "Default value" (0, inferred) |
| rlPhdPortsModuleNumber | hidden | — | — | — |
- Gotchas: buttons checkbox/edit/restore; LAG view changes column title only.

### Global Settings (trust mode) — page `cosqos_global` (orphan, not in menu)
- Read: `GET API/cosqos_global.htm` (single VT row `QosModeGlobalVT$query`).
- Write: `POST API/cosqos_global.htm` enable `rlQosGlobalIndex$query`, changed fields among `rlQosBasicGlobalTrustMode$query`, `rlQosDscpMutationEnable$query`, and `QosModeGlobalVT$endQuery=OK`.
- Fields: rlQosBasicGlobalTrustMode radio 1=CoS, 2=DSCP; rlQosDscpMutationEnable checkbox "Always Rewrite DSCP" 1=Enabled, 2=Disabled. When trust=CoS the checkbox is forced unchecked/disabled (value 2). Other template fields (rlQosGlobalQoSMode, rlQosAdvcGlobalTrustMode, rlQoSPortTrustAdvancedMode) never written.

### Queue Scheduling — page `cosqos_queue`
Classic: ... > Global Settings > Queue Scheduling. Help: qos_queue_scheduling.html "Queue Scheduling".
- Read: `GET API/cosqos_queue.htm` (no filter). Two VTs:
  - `EfManageTable` (lead rlQosEfManageTable): rows `rlQosEfQueueId$repeat-eqVal?N`, `rlQosEfState$repeat-eqVal?N`, `EfManageTable$endrepeat-eqVal?N` (note lowercase `endrepeat` and `-eqVal` suffix).
  - `ProfileTable` (lead rlQosQueueProfileTable) single queried row: `rlQueueProfileName$query`, `rlQosValueQueue1$query`..`rlQosValueQueue8$query`, `rlQosQueueProfileStatus$query`, `ProfileTable$endQuery`.
- Write: `POST API/cosqos_queue.htm`:
  - Find i = highest 1-based queue whose radio is WRR. If found: enable `rlQosEfState$repeat-eqVal?i=1` (WRR), `rlQosEfQueueId$repeat-eqVal?i` (fetched value), `EfManageTable$endrepeat-eqVal?i` (fetched value, NOT set to OK). If no WRR queue: same on row 1 with state 2 (Strict).
  - For every WRR queue q: enable `rlQosValueQueue<q>$query=<weight>`.
  - Always sent (not disabled in template): `rlQueueProfileName$query`, `rlQosQueueProfileStatus$query`, `ProfileTable$endQuery` with fetched values, plus restoreUrl, errorCollector, all VT header inputs.
- Fields:
| field | meaning | values | range | default |
|---|---|---|---|---|
| rlQosEfQueueId | queue number | 1..numOfQueue | — | key |
| rlQosEfState | scheduling | 1=WRR, 2=Strict Priority | — | — |
| rlQosValueQueueN | WRR weight queue N | int | 0..255 (alert text says 1..255; 0 allowed after confirm) | page const arrayDefaultValuesWRR = [1,2,8,16,32,64,128,255]; Strict placeholder arrayDefautValuesStrict = [1,2,4,8,1,1,1,1] |
| "% of WRR Bandwidth" | client-computed weight/sum*100 (2 decimals), "N/A" if invalid | — | — | — |
- Gotchas:
  - Strict queues are always the top ones: selecting Strict on queue k forces queues k..N Strict; selecting WRR on queue k forces queues 1..k WRR. Quirks: Strict on queue 2 (index 1) is treated as index 0 -> all queues Strict; WRR on queue 1 is treated as index 1 -> queues 1 and 2 WRR. So valid states = all Strict, or WRR on 1..k with k>=2.
  - Device semantics (inferred): writing state on one EF row sets the strict/WRR boundary (hence `-eqVal`).
  - When switching a queue to WRR, weight resets to arrayDefaultValuesWRR[i] if it was Strict before, else to the stored rlQosValueQueue.
  - Validation: if any WRR queue, sum of WRR weights must be >0 ("At least one queue WRR must be greater than 0."); any WRR weight 0 -> confirm warning; WRR on queue 8 (`rdoWRR7`) -> confirm "Queue number 8 is reserved for special traffic" (not reachable with 4 queues).
  - Only an edit view (BtnsEditPage cancel/save); DataType Table2Scalar2.

### CoS to Queue — page `cosqos_to`
Classic: ... > Global Settings > CoS to Queue. Help: GlobalSettingsCoStoQueue.html "CoS to Queue".
- Read: `GET API/cosqos_to.htm`. VT `QosCosQueueTable` (lead rlQosCosQueueTable): `rlQosCosIndex$repeat?N`, `rlQosCosQueueId$repeat?N`, `QosCosQueueTable$endRepeat?N` (8 rows, CoS 0..7).
- Write (save): `POST API/cosqos_to.htm` for every row N=1..8: `rlQosCosIndex$repeat?N=N-1`, `rlQosCosQueueId$repeat?N=<queue>`, `QosCosQueueTable$endRepeat?N=OK` (all 8 rows always sent).
- Write (restore): same names, rlQosCosQueueId = defValuesArr[N-1] (rlQosCosIndex keeps fetched value), after confirm().
- Fields: rlQosCosIndex 0..7 (CoS, 0 lowest); rlQosCosQueueId dropdown 1..numOfQueue.
- Defaults: defValuesArr by globalParameters.TypePerModuleArr[1]: module types 171-176 -> [1,1,2,3,3,4,4,4]; 177-179 -> [1,2,3,4,5,6,7,8]. Other types -> null (restore would send "undefined"). X1018 = first set (per docs table; type code inferred).

### DSCP to Queue — page `cosqos_dscp`
Classic: ... > Global Settings > DSCP to Queue. Help: GlobalSettingsDSCPtoQueue.html "DSCP to Queue".
- Read: `GET API/cosqos_dscp.htm`. VTs:
  - `DSCPMapTable` (lead rlQosDscpMutationTable): `rlQosOldDscp$repeat?N`, `rlQosQueueNum$repeat?N`, `DSCPMapTable$endRepeat?N` (64 rows).
  - `DSCPMapDefaultTable` (lead rlQosDscpQueueDefaultMapTable): `rlQosDscpQueueDefaultMapDscp$repeat?N`, `rlQosDscpQueueDefaultMapQueueId$repeat?N` (factory defaults, used by Restore).
- Write (save): `POST API/cosqos_dscp.htm` for N=1..64: `rlQosOldDscp$repeat?N=N-1`, `rlQosQueueNum$repeat?N=<queue>`. JS also tries `QosCosQueueTable$endRepeat?N=OK`, which does not exist in this template (copy/paste bug) -> no row terminator is actually sent; `DSCPMapTable$endRepeat?N` stays disabled. Classic apparently works anyway (inferred); a new UI should probably send `DSCPMapTable$endRepeat?N=OK` (untested).
- Write (restore): rlQosQueueNum$repeat?N = rlQosDscpQueueDefaultMapQueueId of row N; rlQosOldDscp keeps fetched value; same terminator bug.
- Fields: DSCP In 0..63; Queue dropdown 1..numOfQueue. UI renders 4 columns x 16. Note restoreUrl is `disabled` in this template (not sent); `DSCPMapDefaultTable$endVT` is not disabled (sent).
- Docs defaults (X1018): DSCP 0-15 Q1, 16-31 Q2, 32-47 Q3, 48-63 Q4.

### Bandwidth Management (ingress rate limit / egress shaper) — page `cosqos_port_band_table` (+ edit `cosqos_port_band.htm`)
Classic: ... > Global Settings > Bandwidth Management. Help: GlobalSettingsBandwidthManagement.html "Bandwidth Management".
- Read: `GET API/cosqos_port_band_table.htm?[IfPolicyVT]Filter:((rlIfIndex>=S)&&(rlIfIndex<E))` (Ports: module start/count; LAGs: trunkFirstIndex / NumberOfTrunks). VT `IfPolicyVT` (lead rlQosIfPolicyTable), rows use `$repeat2?N`: rlIfIndex, rlIfType, rlQosPortShaperStatus, rlQosCirPortShaper, rlQosCbsPortShaper, rlQosIfPolicyMapStatus, rlQosPortRateLimitStatus, rlQosCirPortRateLimit, rlQosCbsPortRateLimit, rlPhdPortsModuleNumber, `IfPolicyVT$endRepeat2?N`.
- Edit read: `GET API/cosqos_port_band.htm?Query:rlIfIndex=<ifIndex>@rlIfType=<type>`.
- Write (edit): `POST API/cosqos_port_band.htm` enabling:
  - `rlIfIndex$query`, `rlIfType$query` (fetched), `rlQosCbsPortRateLimit$query=<hostParams cosparams_policer_default_burst>` (always),
  - Ports only: `rlQosPortRateLimitStatus$query=2|1`, `rlQosCirPortRateLimit$query=<txtInRateLimit>`,
  - `rlQosPortShaperStatus$query=2|1`, `rlQosCirPortShaper$query=<txtCIR>`, `rlQosCbsPortShaper$query=<txtCBS>`,
  - `IfPolicyVT$endQuery` (enabled, value NOT set to OK; fetched value).
  - Template also has `$add` set (rlIfIndex$add ... `IfPolicyVT$endAdd`) unused.
- Fields:
| field | meaning | values | range (JS) | default/behaviour |
|---|---|---|---|---|
| rlQosPortRateLimitStatus | Ingress Rate Limit State | 2=Enabled, 1=Disabled | — | — |
| rlQosCirPortRateLimit | ingress rate limit (Kbps, inferred; docs say bits/s) | int | 3..10000000, maxlength 8 | if stored 0 shows 100 |
| rlQosCbsPortRateLimit | ingress burst | int | — | always hostparam cosparams_policer_default_burst |
| rlQosPortShaperStatus | Egress Shaping Rate State | 2=Enabled, 1=Disabled | — | — |
| rlQosCirPortShaper | egress CIR (Kbps inferred) | int | 64..10000000 | if stored 0 shows 64 |
| rlQosCbsPortShaper | egress CBS bytes | int | 4096..16762902 | stored |
| rlQosIfPolicyMapStatus, rlPhdPortsModuleNumber | read only / hidden | — | — | — |
- Gotchas: when a status is Disabled the text box is disabled and checkValid() resets it to the previously stored value (or to hostparam min if empty) so stored values are re-sent unchanged. LAG view drops rate-limit columns and does not send rate-limit status/CIR (but still sends rlQosCbsPortRateLimit); `isLag` is never set true so the edit dialog still shows the rate-limit controls for LAGs (UI quirk). List shows CIR/CBS only when status=2.

### TCP Congestion Avoidance — page `tcp_congestion`
Classic: ... > Global Settings > TCP Congestion Avoidance. Help: GlobalSettingsTCPCongestionAvoidance.html.
- Read: `GET API/tcp_congestion.htm` scalars `rlWeightedRandomTailDropCurrentStatus` (disabled, current/running) and `rlWeightedRandomTailDropStatusAfterReset`.
- Write: `POST API/tcp_congestion.htm` with `rlWeightedRandomTailDropStatusAfterReset=0` (Enabled) or `=1` (Disabled) (+ restoreUrl, errorCollector, mibError). No terminator (scalar). Template form action is /Forms/API/QoS_TCP_Congestion_Avoidance.htm but framework posts to SetDataURI.
- Values: JS radio Enabled=0, Disabled=1; list transform 1 -> Disabled, anything else -> Enabled.
- Gotchas: confirm dialog on change; effective only after save config + reboot (AfterReset semantics). Show both current and after-reset status in a new UI.

### DSCP Mapping (out-of-profile remark map) — page `cosqos_dscp_map`
Classic: ... > QoS Mapping > DSCP Mapping. Help: QoSMappingDSCPMapping.html "DSCP Mapping".
- Read: `GET API/cosqos_dscp_map.htm`. VT `DSCPMapTable` (lead rlQosDscpMutationTable): `rlQosOldDscp$repeat?N`, `rlQosRmNewDscp$repeat?N`, `DSCPMapTable$endRepeat?N` (64 rows) + `QosModeGlobalVT$query` with rlQosGlobalIndex/rlQosGlobalQoSMode.
- Mode gate: if `rlQosGlobalQoSMode$query != 3` page shows "The device is currently not in CoS/QoS Advanced mode." and hides Edit.
- Write (save): `POST API/cosqos_dscp_map.htm` for N=1..64: enable `rlQosOldDscp$repeat?N` (fetched), `rlQosRmNewDscp$repeat?N=<0..63>`, `DSCPMapTable$endRepeat?N` (enabled, value not set — fetched).
- Write (restore): rlQosRmNewDscp$repeat?N = rlQosOldDscp value (identity map), same enables, after confirm.
- Fields: DSCP In 0..63, DSCP Out dropdown 0..63; default identity. Used by Policy Class Maps exceed action 3 (Out of Profile DSCP) and Aggregate Policer action 3 (Remark DSCP).

### DSCP Rewrite — page `dscp_rewrite_edit` (orphan, not in menu)
- Read: `GET API/dscp_rewrite_edit.htm` (DSCPMapTable rows `rlQosOldDscp$repeat?N`, `rlQosNewDscp$repeat?N`; plus full QosModeGlobalVT; dynamic block on `rlQosGlobalQoSMode=2`).
- Write save: N=1..64 `rlQosOldDscp$repeat?N=N-1`, `rlQosNewDscp$repeat?N=<0..63>`, `DSCPMapTable$endRepeat?N=OK`. Restore: rlQosNewDscp = rlQosOldDscp. Basic-mode "DSCP mutation" map (inferred; paired with rlQosDscpMutationEnable on cosqos_global).

### Class Mapping — page `cosqos_cmap` (+ add `create_new_cmap.htm`)
Classic: ... > QoS Mapping > Class Mapping. Help: QoSMappingClassMapping.html "Class Mapping".
- Read: `GET API/cosqos_cmap.htm`. VTs:
  - `QosAclTableIP` (lead rlQosAclTable, `$VT1` header): `rlQosAclIndex$repeat?N`, `rlQosAclName$repeat?N`, `rlQosAclType$repeat?N` (type 1=MAC, 2=IPv4, other=IPv6).
  - `QosClassMapTable1` (lead rlQosClassMapTable): `rlQosClassMapIndex$repeat?N`, `rlQosClassMapType$repeat?N`, `rlQosClassMapStatus$repeat?N`, `rlQosClassMapMatch1..3$repeat?N` (ACL indexes, 0=none), `rlQosClassMapName$repeat?N`, `QosClassMapTable1$endRepeat?N`; also `numOfEntries$52` (RL_filterPerKeyGet).
  - `PolicyRefClassTable` (lead rlQosPolicyClassPriorityRefTable): `rlQosPolicyClassPriorityRefPriority$repeat1?N`, `...RefClassPointer$repeat1?N`, `...RefPolicyPointer$repeat1?N`, `...RefStatus$repeat1?N`.
  - `QosModeGlobalVT` (dynamic on `rlQosGlobalQoSMode=3`).
  - List columns: Class-Map Name, ACL 1, Match, ACL 2, Match, ACL 3 (built client-side: "<aclName> MAC|IP|IPv6"; match shown "and" if rlQosClassMapType=1 else "or"; forced "or" between two non-MAC ACLs).
- Add read: `GET API/create_new_cmap.htm` (same ACL list, class map list, `$add` inputs).
- Write (add): `POST API/create_new_cmap.htm` enabling/setting:
  - `rlQosClassMapIndex$add` = last row's rlQosClassMapIndex + 1 (1 if table empty/placeholder row) — client-generated free index,
  - `rlQosClassMapName$add` (1..32 chars, trimmed, must be unique client-side "Entry already exists."),
  - `rlQosClassMapType$add` = 1 (match-all, "IP and MAC") or 2 (match-any; "IP or MAC", and the default for IP-only / MAC-only),
  - `rlQosClassMapStatus$add=4` (createAndGo),
  - `rlQosClassMapMatch1$add`.. up to `Match3$add` = selected ACL indexes in order: default IPv4, IPv6, MAC; if Preferred ACL = MAC (only when IP and MAC both chosen): MAC, IPv4, IPv6. Empty slots skipped (compacted).
  - `QosClassMapTable$endAdd` (enabled, value fetched).
  - NB: in create_new_cmap.htm the `$add` inputs and VT headers are NOT disabled, so all are sent anyway (unused Match slots with fetched values, inferred 0/empty).
- Write (remove): `POST API/cosqos_cmap.htm` for each selected slot k: `rlQosClassMapIndex$repeat?k=<index>`, `rlQosClassMapStatus$repeat?k=6` (destroy). JS also tries `AddressStaticVT$endRepeat?k=OK` (copy/paste bug, no such input) -> no row terminator sent; `QosClassMapTable1$endRepeat?k` stays disabled.
- Add form controls: Class Map Name; Match ACL Type dropdown built from existing ACLs: "IP" (value ip, if any IPv4/IPv6 ACL), "MAC" (mac, if any MAC ACL), "IP and MAC" (1), "IP or MAC" (2) (both only if both kinds exist); IP ACL: chkIpv4 + IPv4 ACL select, chkIpv6 + IPv6 ACL select; MAC ACL select; Preferred ACL radio "IP Based ACL"(ip, default)/"MAC Based ACL"(mac), enabled only when an IP ACL is checked AND match type is IP and MAC / IP or MAC.
- Validation: at least one ACL selected ("At least one ACL should be selected first."); IP match requires an IP ACL to exist.
- Gotchas: no edit (class maps are add/remove only); ACLs come from rlQosAclTable (QoS view of ACL & ACE pages). Server-side mode gate rlQosGlobalQoSMode=3 (advanced) on the template (inferred: page empty otherwise).

### Aggregate Policer — page `agg_policer_table` (wcd)
Classic: ... > QoS Mapping > Aggregate Policer. Help: QoSMappingAggregatePolicer.html "Aggregate Policer" (+ policers.html "Policers").
- Read: `GET wcd?{AggregatePolicerList}` -> entries with policerID, policerName, CIR, CBS, action, markVal.
- Edit read: `GET wcd?{AggregatePolicerList&policerID=<id>&policerName=<enc>&CIR=<cir>&CBS=<cbs>}` (Pkey = policerID, policerName, CIR, CBS).
- Write (add and edit — both use action "set"):
  `<DeviceConfiguration><AggregatePolicerList action="set"><Entry><policerName>N</policerName><CIR>c</CIR><CBS>b</CBS><action>a</action></Entry></AggregatePolicerList></DeviceConfiguration>` (no policerID; name is the identity; on edit name is read-only span).
- Write (delete): `<AggregatePolicerList action="delete"><Entry><policerID/><policerName/><CIR/><CBS/></Entry>...</AggregatePolicerList>` one Entry per selected row.
- Fields:
| field | meaning | values | range | default |
|---|---|---|---|---|
| policerName | name | string | 1..32, unique ("Name already exist") | — |
| CIR | committed info rate (Kbps per policers.html) | int | 3..57982058 | 3 |
| CBS | committed burst bytes | int | 3000..19173960 | 3000 |
| action | exceed action | 1=None, 2=Drop, 3=Remark DSCP | — | 1 |
| markVal, policerID | read only | — | — | — |
- Gotchas: max 255 entries ("Table is full"); apostrophes in names mangled client-side via placeholder "&aposu" for row keys (classic quirk only). Remark DSCP uses the DSCP Mapping table.

### Policy Table — page `map_policy_table` (wcd)
Classic: ... > QoS Mapping > Policy Table. Help: QoSMappingPolicyTable.html "Policy Table".
- Read: `GET wcd?{PolicyMapList}` -> PolicyMapEntry rows: policyID (hidden), policyName.
- Write (add): `<PolicyMapList action="set"><PolicyMapEntry><policyName>X</policyName></PolicyMapEntry></PolicyMapList>`.
- Write (delete): `<PolicyMapList action="delete"><PolicyMapEntry><policyName>X</policyName></PolicyMapEntry>...</PolicyMapList>` (name only).
- Fields: policyName 1..32 chars (trimmed). No edit.
- Gotchas: after add/delete the page re-points qos_policyClassMaps to the first policy and routes there. Policy bound to an interface must be unbound before editing (docs, inferred also before delete).

### Policy Class Maps — page `qos_policyClassMaps` (wcd)
Classic: ... > QoS Mapping > Policy Class Maps. Help: QoSMappingPolicyClassMaps.html.
- Read: first `GET wcd?{ClassMapList&filter=(policyIDRef>0)}{PolicyMapList}`; then automatically re-reads `GET wcd?{ClassMapList&filter=(policyIDRef=<P>)}{PolicyMapList}` with P = first policy's policyID ("View By" policy dropdown changes P). Empty PolicyMapList -> empty table and Add disabled.
- ClassMapList entry (ClassMapEntry) fields: classID (key), className, policyIDRef, policyNameRef, action, markVal, bindPoliceType, aggPolNameRef, sglPolCIR, sglPolCBS, sglPolAction, type (listed, unused), bindPolicyEnbl (write only).
- Edit read: `GET wcd?{ClassMapList&filter=(policyIDRef=<P>&&classID=<C>)}{PolicyMapList&filter=(policyID=<P>)}{AggregatePolicerList}` (the `&query` placeholder sits inside the filter parentheses, so it becomes an AND clause).
- Add read: `GET wcd?{ClassMapList&query}{AggregatePolicerList}` (literal `&query`, no substitution for add; returns all class maps).
- Write (add): `<ClassMapList action="set"><ClassMapEntry><policyNameRef/><policyIDRef/><classID/><className/><action/><markVal/>(only when Set Marking)<bindPoliceType/><sglPolCIR/><sglPolCBS/><sglPolAction/><aggPolNameRef/><bindPolicyEnbl>1</bindPolicyEnbl></ClassMapEntry></ClassMapList>`.
- Write (edit): same `set` ClassMapEntry with classID, className, action, markVal?, bindPoliceType, sglPolCIR, sglPolCBS, sglPolAction, aggPolNameRef (no policy refs, no bindPolicyEnbl).
- Write (remove = unbind class from policy): `set` ClassMapEntry per selected row {classID, className, policyIDRef, policyNameRef, bindPolicyEnbl=2}. Class map itself is not deleted.
- Fields:
| field | meaning | values | range | default |
|---|---|---|---|---|
| action | Action Type / marking | 1=None, 6=Trust CoS-DSCP, "Set Marking" -> 3=Set DSCP, 4=Set Queue, 5=Set CoS (802.1p) | — | 1 (marking default 3 when Set chosen) |
| markVal | New Value | — | DSCP 0..63; Queue 1..numOfQueue (default "1"); CoS 0..7; default "0" | sent only when action 3/4/5 |
| bindPoliceType | Police Type | 0=None, 1=Single, 2=Aggregate | Aggregate disabled if no agg policers | 0 |
| aggPolNameRef | aggregate policer **name** (not ID) | — | — | "0" unless type 2 |
| sglPolCIR | single policer CIR Kbps | int | 100..1000000 (hard-coded), maxlength 7 | "0" unless type 1 |
| sglPolCBS | single policer CBS bytes | int | 3000..16769020, maxlength 8 | "0" unless type 1 |
| sglPolAction | exceed action | 1=None, 2=Drop, 3=Out of Profile DSCP (0 = n/a) | — | 1 when Single chosen; "0" otherwise |
- Validation: add rejects a class map already bound (policyIDRef>0: "...is already bound to another Policy-Map..."); "No Class Maps are available to bind to this policy." when none; exceed action 3 not allowed if action is None or Set Queue/CoS (only Trust or Set DSCP) — "Cannot remark exceeded traffic, if the action is default or set VPT/queue."
- Gotchas: values are all strings (json2xml drops non-string numbers -> empty element, so always stringify). Docs: Police Type / Aggregate Policer available in Layer 2 mode only. Each class map belongs to at most one policy. Edit of a bound policy probably refused by device (docs: unbind first).

### Policy Binding — page `cosqos_service` (wcd)
Classic: ... > QoS Mapping > Policy Binding. Help: QoSMappingPolicyBinding.html.
- Read: `GET wcd?{PolicyMapBindingList&filter=(bindPolicyInEnbl=1)}{PolicyMapList}`. Entry fields: interfaceName, interfaceType, policyInNameRef, bindPolicyInEnbl, policyInIDRef, policyAclDefaultAction (all also Pkey).
- Edit read: `GET wcd?{PolicyMapBindingList&interfaceName=..&interfaceType=..&policyInNameRef=..&bindPolicyInEnbl=..&policyInIDRef=..&policyAclDefaultAction=..}{PolicyMapList}`. Add read: `GET wcd?{PolicyMapBindingList}{PolicyMapList}` + interface list from interfaceManager (Port / LAG radio).
- Write (add): `<PolicyMapBindingList action="set"><ifEntry><interfaceType>2</interfaceType><interfaceName>gi1/0/1</interfaceName><policyInNameRef>P</policyInNameRef><bindPolicyInEnbl>1</bindPolicyInEnbl><policyInIDRef>1</policyInIDRef><policyAclDefaultAction>1</policyAclDefaultAction></ifEntry></PolicyMapBindingList>` — interfaceType always '2' and policyInIDRef always '1' (constants regardless of port/LAG or policy; device resolves by name, inferred); interfaceName = dropdown text with first space removed.
- Write (remove/unbind): `<PolicyMapBindingList action="restore"><ifEntry>{all 6 key fields as read}</ifEntry>...</PolicyMapBindingList>`.
- Write (edit = change policy): single POST with two sibling sections in order: `<PolicyMapBindingList action="restore"><ifEntry>{old 6 fields}</ifEntry></PolicyMapBindingList><PolicyMapBindingList action="set"><ifEntry>{interfaceType 2, interfaceName, new policyInNameRef, bindPolicyInEnbl 1, policyInIDRef 1, policyAclDefaultAction 1}</ifEntry></PolicyMapBindingList>`.
- Validation: requires a policy ("You must first define a Policy"). One policy per interface; ingress only.
- Note: legacy form templates API/cosqos_service.htm/_a/_e exist but are unused by this jQuery page.

### Trust Settings (per-interface QoS trust) — page `cosqos_int_basic` (orphan, not in menu)
- Read: `GET API/cosqos_int_basic.htm?Filter:((rlIfIndex >= S) && (rlIfIndex < E))` (Ports/LAGs as default_cos; first load unfiltered then re-route). VT `IfPolicyVT` rows: rlIfIndex, rlPhdPortsModuleNumber, rlIfType, rlQosIfTrustActive, rlQosIfPolicyMapStatus `$repeat?N`; QosModeGlobalVT dynamic on `rlQosGlobalQoSMode=2`.
- Edit read: `GET API/cosqos_int_basic_e.htm?Query:rlIfIndex=<i>@rlIfType=<t>`.
- Write: `POST API/cosqos_int_basic_e.htm` enabling changed `rlQosIfTrustActive$query`, plus pkeys/hidden `rlIfType$query`; JS sets `QosModeGlobalVT$endQuery=OK` instead of `IfPolicyVT$endQuery` (bug; intended terminator is `IfPolicyVT$endQuery=OK`, inferred).
- Field: rlQosIfTrustActive 2=Enabled, 1=Disabled ("QoS Trust State"). Basic mode only (inferred from template selector).

### Policer Statistics (single policer counters) — page `policer_statistics`
Classic: ... > QoS Statistics > Policer Statistics. Help: QoSStatisticsPolicerStatistics.html.
- Read: `GET API/policer_statistics.htm`. VTs:
  - `ClassMapTableVT1` (lead rlQosPolicyClassPriorityRefTable, joined rlQosClassMapTable by rlQosClassMapIndex=…ClassPointer and rlQosPolicyMapTable by rlQosPolicyMapIndex=…PolicyPointer): `$repeat1?N` fields rlQosPolicyClassPriorityRefPriority, …RefClassPointer, …RefPolicyPointer, rlQosClassMapIndex, rlQosClassMapName, rlQosClassMapPolicer, rlQosPolicyMapIndex, rlQosPolicyMapName.
  - `rlQosSinglePolicerStatisticsTableVT` (lead rlQosSinglePolicerStatisticsTable): `$repeat?N` rlIfIndex, rlQosPolicerIndex, rlQosSinglePolicerStatisticsInProfileCounterValue, …OutProfileCounterValue, rlQosSinglePolicerStatisticsStatus, `rlQosSinglePolicerStatisticsTableVT$endRepeat?N` (VT header also has …InProfileCntrNumOfBits, …OutProfileCntrNumOfBits).
  - `rlQosClearCounters$scalar` exists (disabled) — never used by JS (no clear button).
  - Display: Interface = portsNamesArr[rlIfIndex]; Policy/Class Map resolved by rlQosPolicerIndex == rlQosClassMapPolicer.
- Add read: `GET API/policer_statistics_a.htm?[rlQosNamesToIndexesTableVT2]Filter:rlQosNamesToIndexesTableId=3` — adds `rlQosNamesToIndexesTableVT2` rows (`$repeat2?N` rlQosNamesToIndexesTableId, …Name (policy name), …Value (policy index)) and external `rlQosPolicerType$repeatPolicer?N` per class row. Dropdown "Policy - Class Map Name" = for each policy, class rows with matching PolicyPointer and policer type 1 (single): text "<policy> - <class>", value rlQosClassMapPolicer.
- Write (add): `POST API/policer_statistics_a.htm` enabling `rlIfIndex$add=<ifIndex>`, `rlQosPolicerIndex$add=<policer index>`, `rlQosSinglePolicerStatisticsStatus$add=4`. `rlQosSinglePolicerStatisticsTableVT$endAdd` not enabled by JS (inferred server commits anyway; a new UI may add `=OK`, untested). Interface Type Port/LAG radio.
- Write (remove): `POST API/policer_statistics.htm` per selected slot k: enable `rlIfIndex$repeat?k`, `rlQosPolicerIndex$repeat?k`, `…InProfileCounterValue$repeat?k`, `…OutProfileCounterValue$repeat?k` (all fetched row-k values, NOT the selected keys — classic bug: slot k uses table row k's values), `rlQosSinglePolicerStatisticsStatus$repeat?k=6`, `rlQosSinglePolicerStatisticsTableVT$endRepeat?k` (fetched). A new UI should put the selected row's keys into the slot.
- Columns: Interface, Policy, Class Map, In-Profile Bytes, Out-of-Profile Bytes.
- Validation: "A Policy and a Class Map must be selected." when no single-policer class exists.

### Aggregate Policer Statistics — page `cosqos_agg_stat`
Classic: ... > QoS Statistics > Aggregate Policer. Help: QoSStatisticsAggregatePolicer.html "Aggregated Policer".
- Read: `GET API/cosqos_agg_stat.htm`. VT `rlQosAggregatePolicerStatisticsTableVT`: `$repeat?N` rlQosPolicerIndex, rlQosAggregatePolicerStatisticsInProfileCounterValue, …OutProfileCounterValue, rlQosAggregatePolicerStatisticsStatus, `…TableVT$endRepeat?N`; external `rlQosPolicerName$repeatPol?N` (name via rlQosPolicerIndex). `rlQosClearCounters$scalar` present, unused.
- Add read: `GET API/cosqos_agg_stat_a.htm?[rlQosPolicerTableVT2]Filter:rlQosPolicerType=2` -> `rlQosPolicerIndex$repeat2?N`, `rlQosPolicerName$repeat2?N` (aggregate policers) for the dropdown.
- Write (add): `POST API/cosqos_agg_stat_a.htm` `rlQosPolicerIndex$add=<idx>`, `rlQosAggregatePolicerStatisticsStatus$add=4`, `rlQosAggregatePolicerStatisticsTableVT$endAdd=OK`.
- Write (remove): `POST API/cosqos_agg_stat.htm` per selected slot k: `rlQosPolicerIndex$repeat?k=<idx>`, `rlQosAggregatePolicerStatisticsStatus$repeat?k=6`, `rlQosAggregatePolicerStatisticsTableVT$endRepeat?k=OK`.
- Columns: Aggregate Policer Name, In-Profile Bytes, Out-of-Profile Bytes. Validation: "No Aggregate Policer Name was selected."

### Queues Statistics — page `queues_statistics`
Classic: ... > QoS Statistics > Queues Statistics. Help: QoSStatisticsQueuesStatistics.html.
- Read: `GET API/queues_statistics.htm`. VT `rlQosOutQueueStatisticsTableVT` (lead rlQosOutQueueStatisticsTable): `$repeat?N` rlQosOutQueueStatisticsCountrID, …IfIndexList (port bitmap octets), …PortAll, …Queue, …QueueAll, …DP, …DPAll, …CounterAllValue, …CounterTailDropValue, …Status, `…TableVT$endRepeat?N` (header also has …Vlan, …VlanAll, …CntrNumOfBits). `rlQosClearCounters$scalar` present, unused.
  - Display: Port = "All" if PortAll=1 else first set bit of IfIndexList -> portsNamesArr[bit+1]; Queue = "All" if QueueAll=1.
- Add read: `GET API/queues_statistics_a.htm`.
- Write (add): `POST API/queues_statistics_a.htm` enabling `rlQosOutQueueStatisticsCountrID$add` (1|2), `…IfIndexList$add`, `…PortAll$add`, `…Vlan$add=1`, `…VlanAll$add=1`, `…Queue$add`, `…QueueAll$add`, `…Status$add=4`, `rlQosOutQueueStatisticsTableVT$endAdd` (enabled, value fetched).
  - Queue "All" (-1): QueueAll=1, Queue=1; else QueueAll=2, Queue=<q 1..numOfQueue>.
  - Interface radio value 1 (All Ports, inferred): PortAll=1, IfIndexList="00"; else PortAll=2, IfIndexList = bitsAsCharsToOctet("0"*(ifIndex-1)+"1") (single-port bitmap).
  - DP/DPAll not set.
- Write (remove): `POST API/queues_statistics.htm` per selected slot k: `rlQosOutQueueStatisticsCountrID$repeat?k=<id>`, `rlQosOutQueueStatisticsStatus$repeat?k=6`; JS sets `rlQosOutQueueStatisticsTableVT$endRepeat<k>` (missing "?", bug) so terminator not sent.
- Fields: Counter Set 1 = high-DP set, 2 = low-DP set (docs); Total Packets, Tail-Drop Packets. Counter set ID is the key -> max 2 counters (inferred).

### Notable gotchas summary
- Several classic Save/Remove functions name non-existent terminators (cosqos_dscp `QosCosQueueTable$endRepeat`, cosqos_cmap `AddressStaticVT$endRepeat`, queues_statistics `...$endRepeat<k>` without `?`, cosqos_int_basic `QosModeGlobalVT$endQuery`) or enable terminators without setting OK (cosqos_queue, cosqos_dscp_map, port band `IfPolicyVT$endQuery`, cmap/queues `$endAdd`). Writes still work in classic, so the server apparently commits on field presence; replicate the classic body exactly (inferred) or test with OK.
- No UI changes rlQosGlobalQoSMode; DSCP Mapping requires mode 3 (Advanced). Class Map templates gated on mode 3; basic-mode pages (cosqos_global, dscp_rewrite_edit, cosqos_int_basic) are orphaned.
- Queue scheduling: strict queues are always contiguous at the top; one EF row write sets the boundary; quirks at queue 1/2.
- Policy binding edit = restore(old)+set(new) in one POST; constants interfaceType=2, policyInIDRef=1.
- Policy class maps: initial double read (policyIDRef>0, then policyIDRef=first). aggPolNameRef carries the policer name. All XML values must be strings.
- TCP congestion avoidance takes effect only after save + reboot (Enabled=0, Disabled=1).
- Statistics pages have rlQosClearCounters$scalar in templates but no clear action in JS.

---

## 5. ACLs and time ranges

Sources: C/js/Pages/{mac_aces_associated,MacBasedACE,ipv4_aces_associated,IPv4BasedACE,ipv6_acl_table,IPv6BasedACE,acl_membership_table,NetworkAdministration_Security_ACLACE_TimeRange,Security_Time_Range_Recurrence,rmon_ace_counters,proprietary_protocol_filterring}.js, C/tpl/{MacACE,IPv4ACE,IPv6ACE,TimeRange}.htm, C/API/*.htm, C/documentation/ACLandACE*.html, time_range.html, StatisticsDeniedACEsCounters.html.

Menu (js/tree_Items.js `networkAdministation_security_ACLandACE`, accordion "ACL and ACE", Id 110, under Network Administration > Security), in order:
MAC Based ACL, MAC Based ACE, IPv4 Based ACL, IPv4 Based ACE, IPv6 Based ACL, IPv6 Based ACE, ACL Binding, Proprietary Protocol Filtering, Time Range, Time Range Recurrence.
Denied ACEs Counters is elsewhere: Statistics and Diagnostics > Statistics > Denied ACEs Counters (`statisticsAndDiagnostics_Statistics`).

`MacBasedACEm.js` and `IPv4BasedACEm.js` are empty stubs (only a BOM + CRLF, 5 bytes); metadata.js has no `MacBasedACEm`/`IPv4BasedACEm` entries. Ignore them.

Unused or orphan templates: `API/mac_aces_associated.htm` (Tags version of the MAC ACL list; the page actually uses wcd), `API/ipv4_aces_summery.htm` (per-interface policy + ACL + ACE + tuple dump, not referenced by any JS), `API/ipv6_based_ACE.htm`/`_a.htm` (the IPv6 ACE page uses wcd; IPv6BasedACE.js still has dead tuple helpers `setTuples/setIPAddress/setClassification/setAceKeys/setAceTidxType/getFreeTupleIndex`), `tpl/TimeRange.htm` (generic table skeleton).

### Common model (MIB-backed Tags pages for MAC and IPv4 ACEs)

- ACL table `rlQosAclTable`: `rlQosAclIndex`, `rlQosAclName`, `rlQosAclType` (1=MAC, 2=IPv4, 3=IPv6), `rlQosAclStatus`, `rlQosAclNumOfAces`. wcd `ACLList` entry `ACLID` == `rlQosAclIndex` (MAC list page uses `ACLID` directly as `rlQosAceTidxAclIndex`).
- ACE table `rlQosAceTidxTable`, key (`rlQosAceTidxAclIndex`, `rlQosAceTidxIndex`). `rlQosAceTidxIndex` == the ACE "priority" the user types (1 = highest, evaluated first).
  Columns: `rlQosAceTidxAction`, `rlQosAceTidxTimeRange` (name), `rlQosAceTidxTimeRangeIsActive`, `rlQosAceTidxType`, `rlQosAceTidxStatus` (RowStatus), `rlQosAceTidxTuple1..10` (pointers into tuple table; 0 = unused).
- Tuple table `rlQosTupleTable`: `rlQosTupleIndex`, `rlQosTupleType`, `rlQosTupleValue1` (integer), `rlQosTupleValue2` (hex octet string), `rlQosTupleStatus`.
- Free tuple index table `rlQosFreeIndexesTable`: `rlQosFreeIndexesTableId`, `rlQosFreeIndexesValue` (exposed as `FreeIndexesVT$query`).
- Action values (`rlQosAceTidxAction`, and wcd `ruleAction`): 1 = Permit, 2 = Deny, 3 = Shutdown, 4 = Deny + log dropped packets. Reading: 5 is shown as Permit; IPv4/IPv6 pages show logging Enabled for 4 or 5, the MAC page only for 4. The UI only lets you pick logging when the action is Deny (the radio is disabled for Permit/Shutdown, and Disabled is preselected when you choose Deny). Default action is Permit.
- `rlQosAceTidxType`: MAC = 5. IPv4: 1 = IP (any/other protocol), 2 = TCP, 3 = UDP, 7 = ICMP, 8 = IGMP. (Dead IPv6 code: 9 = IPv6, 10 = TCP, 1 = UDP, 13 = ICMP.)
- Tuple types (`rlQosTupleType`) and encodings:

| type | meaning | Value1 | Value2 |
|---|---|---|---|
| 1 | IP protocol | – | 2 hex digits (uppercase, from Str2Hex) + `ff`, e.g. TCP=`06ff` |
| 2 / 3 | IPv4 src / dst | – | 8 hex IP + 8 hex wildcard (ipToOctet), e.g. `0a000000000000ff` |
| 4 | DSCP | 0-63 | – |
| 5 | IP precedence | 0-7 | – |
| 6 / 7 | UDP src / dst single port | port | `0000` |
| 8 / 9 | TCP src / dst single port | port | `0000` |
| 10 / 11 | MAC src / dst | – | MAC + wildcard mask. The read side expects 24 hex digits (12 + 12). The classic write sends the raw text concatenated, e.g. `00:11:..:55ff:ff:..`, and the server parses it (inferred) |
| 12 | VLAN ID | 1-4094 | – |
| 16 | CoS | `0` | 4 hex digits: `0<cos>0<mask>` |
| 17 | Ethertype | decimal value (typed as hex) | – |
| 18 | TCP flags | – | 4 hex digits = bits `00 U A P R S F` + `00` + 6 don't-care bits (1 = don't care) |
| 19 / 20 | ICMP type / code | 0-255 | – |
| 21 | IGMP type | 0-255 | – |
| 22 / 23 | IPv6 src / dst | dead code only | |
| 25 / 26 | UDP src port range from / to | port | – |
| 27 / 28 | UDP dst port range from / to | port | – |
| 29 / 30 | TCP src port range from / to | port | – |
| 31 / 32 | TCP dst port range from / to | port | – |

- RowStatus values used: 4 = createAndGo, 6 = destroy.
- ACEs have no edit form. You can only add or remove them, and an ACL can only be added or removed (there is no rename).
- Limits (help): up to 256 ACEs per ACL and 3000 rules globally, shared with DHCP snooping and protocol-based VLANs, so expect at least 2000 to be available.
- An ACL bound to an interface ends with an implicit "deny any". To change that default, add a lowest-priority ACE that matches everything with action Permit.

### MAC Based ACL (`mac_aces_associated`, jQuery/wcd, Id 230)
- Menu: Network Administration > Security > ACL and ACE > MAC Based ACL. Help: "MAC-Based ACLs" (documentation/ACLandACEMACBasedACL.html).
- Read: `GET wcd?{ACLList&filter=(ACLType=1)}`. Each entry has `ACLID`, `ACLName`, `ACLType`, `ruleCount`. The only column shown is "ACL Name".
- Add (custom `MetaData.Add`): `POST wcd?{ACLList&filter=(ACLType=1)}`
  `<DeviceConfiguration><ACLList action="set"><ACLEntry><ACLName>NAME</ACLName><ACLType>1</ACLType></ACLEntry></ACLList></DeviceConfiguration>`. The action is `set`, not `add`.
- Remove (custom `Remove`): same URL, `<ACLList action="delete">` with one `<ACLEntry><ACLName>..</ACLName><ACLType>1</ACLType></ACLEntry>` per selected row, all in one POST.
- Field: ACL Name, text input `txtACL`, maxLength 32, hint "(1 - 32)". This page has no client-side validation (`validationType 'NA'`) and no duplicate check. Names are case-sensitive.
- After an add or delete, the MAC ACE page filter is reset to the first ACL (`ACLList[0].ACLID`).

### IPv4 Based ACL (`ipv4_aces_associated`, Id 240) / IPv6 Based ACL (`ipv6_acl_table`, Id 250)
- Menu: ... > IPv4 Based ACL / IPv6 Based ACL. Help: "IPv4-Based ACLs" (ACLandACEIPv4BasedACL.html) / "IPv6-Based ACLs" (ACLandACEIPv6BasedACL.html; IPv6 ACLs match only pure IPv6, not IPv6-over-IPv4 or ARP).
- These pages are identical to the MAC one, except:
  - `ACLType` is 2 or 3 in the filter and in every entry.
  - Fields read are `ACLName`, `ACLType`, `ruleCount` (no `ACLID`).
  - Validation is `String`, required, 1-32 characters. A local duplicate check against the loaded list shows "Entry already exists.".
- Write XML is the same as MAC, using `ACLEntry` with `ACLName` and `ACLType`.
- Gotcha: after an add or delete, the IPv4 page computes the ACE filter from `ACLList[0].ACLID`, but `ACLID` is not among the fields read, so the filter ends up as `rlQosAceTidxAclIndex=undefined` (inferred). After an add or delete, the IPv6 page re-points IPv6BasedACE to `...{ACLRuleList&filter=(ACLName='<first>')}...`.

### MAC Based ACE (`MacBasedACE`, Tags, Id 450, template tpl/MacACE.htm)
- Menu: ... > MAC Based ACE. Help: "MAC-Based ACEs" (ACLandACEMACBasedACE.html).
- Read list: `GET API/mac_based_ACE.htm?[AceVT]Filter:(rlQosAceTidxAclIndex=<aclIndex>)`.
  - The first load has no filter. `onDataFunction` then re-routes with the first `AclTable` row's `rlQosAclIndex`.
  - The form contains:
    - `AclTable` VT (`rlQosAclTable`, hidden `Filter:(rlQosAclType=1)`) with repeat rows `rlQosAclIndex$repeat?N` and `rlQosAclName$repeat?N`. These fill the "View By" ACL dropdown, whose values are the ACL indexes.
    - `TupleVT` repeat: `rlQosTupleIndex/Type/Value1/Value2$repeat?N`.
    - `AceVT` repeat: `rlQosAceTidxAclIndex, Index, Action, TimeRange, TimeRangeIsActive, Tuple1..10, Status, Type $repeat?N`.
  - The selected ACL is recovered from `restoreUrl`.
  - The page joins each ACE's `Tuple1..10` pointers to TupleTable rows to build its columns.
- Columns: Priority, Source MAC Address, Source Mask, Destination MAC Address, Destination Mask, VLAN ID, CoS, CoS Mask, Ethertype, Time Range Name, Action, Logging. Empty src/dst shows "Any". CoS 0 shows as blank. Ethertype is shown in hex.
- Add form read: `GET API/mac_based_ACE_a.htm?[AceVT]Filter:(rlQosAceTidxAclIndex=<aclIndex>)`. It provides:
  - `FreeIndexesVT$query`: `rlQosFreeIndexesTableId$query` and `rlQosFreeIndexesValue$query`.
  - `time_table` repeat: `rlTBITimeRangeName$repeat?N` and `rlTBITimeRangeActiveStatus$repeat?N`.
  - `$add` inputs.
  - The Add button is disabled when no MAC ACL exists.
- Add write: `POST API/mac_based_ACE_a.htm`. Enabled fields:
  - `rlQosAceTidxAclIndex$add` = ACL index (taken from the filter in the add URI), and `rlQosAceTidxIndex$add` = priority.
  - `rlQosAceTidxAction$add` = 1, 2, 3, or 4 (Deny with logging Enabled).
  - `rlQosAceTidxTimeRange$add` = time-range name or "". `rlQosAceTidxTimeRangeIsActive$add` = that range's `rlTBITimeRangeActiveStatus`, or `2` when there is no range.
  - Tuples, per used tuple k = 1..n:
    - `rlQosTupleIndex$add<k>`, `rlQosTupleType$add<k>`, plus `rlQosTupleValue1$add<k>` and/or `rlQosTupleValue2$add<k>` (only when non-empty).
    - `TupleVT$endAdd<k>` is enabled, but the JS never sets its value; it is posted with whatever the server rendered (presumably empty). A new UI should send `OK` (inferred).
    - The ACE slot pointer `rlQosAceTidxTupleS$add` = that tuple's index.
    - Slots: src MAC = Tuple1 (type 10), dst MAC = Tuple2 (11), VLAN = Tuple3 (12), CoS = Tuple4 (16), Ethertype = Tuple5 (17).
    - All `rlQosAceTidxTuple1..10$add` are first set to `0`. Only the used ones are enabled, so unused pointers are not sent.
  - `rlQosAceTidxType$add` = 5.
  - `AceVT$endAdd` = OK.
  - Tuple indexes: the first one is `rlQosFreeIndexesValue$query` (2 if the query returned `_top.queryNA`), and each further tuple adds 1.
- Fields (MacACE.htm):
  - New Rule Priority `txtACEPriority`: 1-2147483647, required. If the priority already exists in the shown ACL, the UI alerts "The New Ace Priority is occupied, the next free Priority is N".
  - Source MAC Address: radio `rdSource` (option 1 = MAC + wildcard mask, option 2 = Any, default Any). Inputs `txtSourceMAC` and `txtSourceMask` (maxlength 17). Both are required when option 1 is selected. MAC validation `checkValidationMAC(...,'Muticast')`. Wildcard: 00 = must match, ff = ignore.
  - Dest MAC Address: radio `rdDest`, `txtDestMAC` / `txtDestMask`, same rules.
  - VLAN ID `txtVLANID`: 1-4094, optional. The help wrongly says 1-4095.
  - CoS `txtCoS` 0-7 and CoS Mask `txtCoSMask` 0-7: if either is set, both are required. A tuple is only created if CoS is non-empty and not "0", so CoS 0 cannot be matched.
  - Ether Type `txtEtherType`: entered as hex, must be 0x05DD-0xFFFF ("Value must be in range 05DD-FFFF."). The hint text wrongly says "(1501-65535)". The value is posted as decimal in Value1. The value "0" is ignored.
  - Time Range Name: checkbox `chTimeRangeName` + select `slcTimeRangeName`. Options show the range name; the option value is its active status. The checkbox is disabled when no time range exists.
  - Action `slcAction`: 1 Permit, 2 Deny, 3 Shutdown. Logging of Dropped Packets: `rdoEnable` / `rdoDisable`, Deny only.
  - "Apply to" `slctSave`: 0 = Running, 1 = Running and Startup (generic save-mode control).
- Remove: `POST API/mac_based_ACE.htm`. For each selected row i = 1..k (numbered by selection order, not by table row), enable:
  - `rlQosAceTidxAclIndex$repeat?i` and `rlQosAceTidxIndex$repeat?i` = the row's keys
  - `rlQosAceTidxStatus$repeat?i` = 6
  - `AceVT$endRepeat?i` = OK

  The VT header inputs (`AclTable`, `rlQosAclTable$VT`..., `TupleVT`..., `AceVT`... `$endVT`) are rendered without `disabled`, so they are also posted with their server values.
- Tuple cleanup gotcha: `Remove` also tries to destroy the ACE's tuples (`rlQosTupleIndex$add<n>`, `rlQosTupleStatus$add<n>=6`, `TupleVT$endAdd<n>=OK`). This does nothing, for two reasons: the condition compares the array `value` against a string, and those `$add` inputs do not exist in mac_based_ACE.htm. The device presumably frees the tuples itself, or they leak (inferred).

### IPv4 Based ACE (`IPv4BasedACE`, Tags, template tpl/IPv4ACE.htm)
- Menu: ... > IPv4 Based ACE. Help: "IPv4-Based ACEs" (ACLandACEIPv4BasedACE.html).
- Read list: `GET API/ipv4_based_ACE.htm?[AceVT]Filter:(rlQosAceTidxAclIndex=<idx>)`. Same structure as MAC, but `AclTable` has `Filter:(rlQosAclType=2)` and also `AclTable$query`.
- Columns: Priority, Protocol (name or number; "Any"), Source IP Address, Source Wildcard Mask, Destination IP Address, Destination Wildcard Mask, Source Port (single or "a-b"; only for TCP/UDP), Dest Port, Flag Set (6 characters U A P R S F, with `1`/`0`/`x` for don't care), DSCP, IP Precedence, ICMP Type (name from `icmpTypeText`; only for proto 1), ICMP Code, Time Range Name, Action, Logging.
- Add form read: `GET API/ipv4_based_ACE_a.htm?[AceVT]Filter:(rlQosAceTidxAclIndex=<idx>)`. Free tuple indexes come from a separate `GET API/ipv4_based_ACE_a_tupel.htm`. That form has 9 repeated `FreeIndexesVT$query` blocks, and the k-th tuple uses the k-th `rlQosFreeIndexesValue$query`, so there are at most 9 tuples per ACE.
- Add write: `POST API/ipv4_based_ACE_a.htm` with the same `$add` fields as MAC, except:
  - `rlQosAceTidxType$add` is 1, 2, 3, 7, or 8.
  - The classic `Add` never enables `AceVT$endAdd` (MAC does). A new UI should send `AceVT$endAdd=OK` (inferred).
  - Tuple slot mapping:
    - protocol → Tuple1 (type 1; omitted for Any, which is 256)
    - src IP → Tuple2 (type 2)
    - TCP/UDP src port → Tuple3 (type 8 or 6 single, 29 or 25 range-from), with range-to → Tuple6 (30 or 26)
    - ICMP type or IGMP type → Tuple4 (19 or 21)
    - ICMP code or dst port → Tuple5 (20; dst port 9 or 7 single, 31 or 27 range-from), with dst range-to → Tuple7 (32 or 28)
    - TCP flags → Tuple8 (18)
    - DSCP or precedence → Tuple8 (4 or 5)
    - dst IP → Tuple9 (type 3)
- Fields:
  - New ACE Priority: 1-2147483647, with the same duplicate / next-free check as MAC.
  - Protocol: radio `protocolRadio`.
    - Option 1 "Select from List" `selectProtocol`: ICMP 1, IGMP 2, IP in IP 4, TCP 6, EGP 8, IGP 9, UDP 17, HMP 20, RDP 27, IDPR 35, IDRP 45, RSVP 46, GRE 47, ESP 50, AH 51, EIGRP 88, OSPF 89, IPIP 94, PIM 103, L2TP 115, ISIS 124.
    - Option 2 "Protocol ID To Match" `txtProtocolIDtoMatch`: 0-255, required when selected.
    - Option 3 "Any (IP)" (default).
    - For display, `protocolNum`/`protocolName` also map 41 IPV6, 43 IPV6:ROUT, 44 IPV6:FRAG, 58 IPV6:ICMP.
  - Source Port / Destination Port (TCP and UDP only): radios `rdSourseProtocol` / `rdDestinationProtocol`. 1 = Single (0-65535), 2 = Range from-to (0-65535, from < to strictly, "Invalid range for source port."), 3 = Any (preselected when TCP/UDP is chosen).
  - Source IP / Destination IP: radio 1 = address + Wildcard Mask (X.X.X.X; the IP is required; 0 bits = match, 255 = ignore), 2 = Any (default).
  - TCP Flags (TCP only): checkbox `chUrg` enables six selects Urg/Ack/Psh/Rst/Syn/Fin, each 1 = Set, 0 = Unset, 2 = Don't Care (default).
  - ICMP (protocol 1 only): radio `rdICMP`. 1 = list `icmplistslct`: 0 Echo Reply, 3 Destination Unreachable, 4 Source Quench, 5 Redirect, 6 Alternate Host Address, 8 Echo Request, 9 Router Advertisement, 10 Router Solicitation, 11 Time Exceeded, 12 Parameter Problem, 13 Timestamp, 14 Timestamp Reply, 15 Information Request, 16 Information Reply, 17 Address Mask Request, 18 Address Mask Reply, 30 Traceroute, 31 Datagram Conversion Error, 32 Mobile Host Redirect, 35 Mobile Registration Request, 36 Mobile Registration Reply, 37 Domain Name Request, 38 Domain Name Reply, 39 Skip, 40 Photuris. 2 = ICMP Type 0-255. 3 = Any (default; the UI puts 255 internally but sends no tuple).
  - ICMP Code: radio `rdICMPCode`, 1 = code 0-255, 2 = Any (default).
  - IGMP (protocol 2 only): radio `rdIGMP`. 1 = list `igmplistslct`: 17 host-query, 18 host-report, 19 dvmrp, 20 pim, 21 cisco-trace, 22 host-report-v2, 23 host-leave-v2, 34 host-report-v3. 2 = IGMP Type 0-255. 3 = Any.
  - Classification: checkbox `chClasifications`, then radio Match DSCP `txtIMatchDHCP` (0-63, default radio) or Match IP Precedence `txtClasific` (0-7).
  - Time Range Name, Action, Logging, Apply to: same as MAC.
- Remove: same as MAC, but posted to `API/ipv4_based_ACE.htm`. The tuple cleanup is the same no-op.
- Gotchas:
  - TCP flags and DSCP/Precedence both target slot `rlQosAceTidxTuple8`. With both set, two tuples are created but the ACE only points to the last one, so the flags are silently lost (inferred bug).
  - IP tuples are built from the text fields even if the radio is back on Any. The fields are disabled but keep their values (inferred bug).
  - Port ranges are inclusive and need from < to.

### IPv6 Based ACE (`IPv6BasedACE`, jQuery/wcd, template tpl/IPv6ACE.htm)
- Menu: ... > IPv6 Based ACE. Help: "IPv6-Based ACEs" (ACLandACEIPv6BasedACE.html).
- Read: `GET wcd?{ACLList&filter=(ACLType=3)}{ACLRuleList&filter=(ACLName='<acl>')}{TimeRangeList}`. The first load has no ACLRuleList filter and then re-routes with `ACLList[0].ACLName`. "View By" option value = ACLName.
  - `ACLRuleList` entry fields:
    - `ACLName`, `rulePriority`, `ruleAction` (1-5 as above), `timeRangeName`
    - `IPv6Parameters`:
      - `protocolType` (6 TCP, 17 UDP, 58 ICMP, 256 = any IPv6, or any 0-255)
      - `Source`: `sourceAddressType` (1 any, 2 specific), `sourceIPv6Address`, `sourcePrefixLength`, `sourcePortType` (1 any, 2 single, 4 range), `sourcePort`, `sourcePortStart`, `sourcePortEnd`
      - `Destination`: the same with the `destination...` prefix
      - `ToSType` (1 none, 2 DSCP, 3 IP precedence), `ToSValue`
      - `TCPFlagsEnabled` (1 yes, 2 no), `TCPFlags` {`urg`,`ack`,`psh`,`rst`,`syn`,`fin`: 1 don't care, 2 set, 3 unset}
      - `ICMPType`, `ICMPCode` (256 = any)
  - `TimeRangeList` entry: `timeRangeName`, `timeRangeEnable`.
- Add (custom): `POST wcd?{ACLList&filter=(ACLType=3)}{ACLRuleList}{TimeRangeList}`, element order as the classic page sends it:
  ```
  <ACLRuleList action="set"><ACLRuleEntry>
    <ACLName>acl</ACLName><rulePriority>N</rulePriority><ruleAction>1|2|3|4</ruleAction>
    <IPv6Parameters>
      <protocolType>..</protocolType>
      <Source><sourceAddressType>1|2</sourceAddressType><sourcePortType>1|2|4</sourcePortType>[<sourcePort>|<sourcePortStart><sourcePortEnd>][<sourceIPv6Address><sourcePrefixLength>]</Source>
      <Destination>(same, destination*)</Destination>
      <TCPFlags>[<urg>..<ack>..<psh>..<rst>..<syn>..<fin>]</TCPFlags>   (empty element when unused)
      <ToSType>1|2|3</ToSType>
      [<TCPFlagsEnabled>1|2</TCPFlagsEnabled>]   (TCP only)
      [<ICMPType>n|256</ICMPType><ICMPCode>n|256</ICMPCode>]   (proto 58 only)
      [<ToSValue>v</ToSValue>]
    </IPv6Parameters>
    [<timeRangeName>name</timeRangeName>]
  </ACLRuleEntry></ACLRuleList>
  ```
  Every value is a string. json2xml would drop numbers, emitting an empty element.
- Remove: same URL. `<ACLRuleList action="delete">` with `<ACLRuleEntry><ACLName>..</ACLName><rulePriority>..</rulePriority></ACLRuleEntry>` for each selected row.
- Fields:
  - ACL Name: label only. It is the ACL selected in View By. The Add button is disabled when there is no IPv6 ACL.
  - New Rule Priority: 1-2147483647, with the duplicate / next-free check.
  - Protocol:
    - radio 1 "Select from List" `selectProtocol` (default): TCP 6 (default), UDP 17, ICMP 58, IPv6 256 (= any).
    - radio 2 "Protocol ID To Match": 0-255.
    - There is no separate "Any" radio.
  - Source/Destination Port: TCP and UDP only, same as IPv4. Single maps to PortType 2, Range to 4, Any to 1.
  - Source/Destination IP: radio 1 = IPv6 address (maxlength 39, `checkIPv6General`) + Prefix Length 0-128 (both required). Radio 2 = Any (default).
  - TCP Flags: TCP only; same six selects, with values 2 Set, 3 Unset, 1 Don't Care (default). The checkbox off sends `TCPFlagsEnabled` 2.
  - ICMP (58 only): list `icmplistslct` with 1 Destination Unreachable, 2 Packet Too Big, 3 Time Exceeded, 4 Parameter Problem, 128 Echo Request, 129 Echo Reply, 130 MLD Query, 131 MLD Report, 143 MLDv2 Report, 132 MLD Done, 133 Router Solicitation, 134 Router Advertisement, 135 ND NS, 136 ND NA. Or ICMP Type 0-255, or Any (= 256). ICMP Code 0-255 or Any (256).
  - Traffic Class: checkbox, then Match DSCP 0-63 (ToSType 2) or Match IP Precedence 0-7 (ToSType 3).
  - Time Range Name (`timeRangeName` sent only when checked), Action, Logging, Apply to: same as MAC.
- There is no IGMP option.

### ACL Binding (`acl_membership_table`, Tags, SystemName ACLBinding)
- Menu: ... > ACL Binding. Help: "ACL Binding" (ACLandACEACLBinding.html).
- Read: `GET API/acl_membership_table.htm?[pVT]Filter:((rlIfIndex >= S) && (rlIfIndex < S+N))`.
  - Ports: S = `StartingPortPerModuleArr[firstPresentModule]`, N = `NumberOfPortPerModuleArr[...]`. LAGs: S = `trunkFirstIndex`, N = `NumberOfTrunks`.
  - Rows: `rlIfIndex$repeat?N`, `rlIfType$repeat?N`, `rlQosIfAclIn$repeatIfPolicy?N`, `rlQosIfAclOut$repeatIfPolicy?N`, `rlQosIfIpv6AclIn$repeatIfPolicy?N`, `rlQosIfIpv6AclOut$repeatIfPolicy?N` (all ACL indexes; 0 = none).
  - Plus the `ACLVT` repeat: `rlQosAclIndex/Name/Type$repeat?N`, which maps indexes to names.
- Columns: Port (or LAG), then Ingress MAC ACL / IPv4 ACL / IPv6 ACL and Egress MAC ACL / IPv4 ACL / IPv6 ACL.
  - `rlQosIfAclIn`/`Out` holds either a MAC or an IPv4 ACL index. The display decides which by the ACL's type.
  - `rlQosIfIpv6AclIn`/`Out` holds the IPv6 ACL and is hidden when a MAC ACL is bound.
- View By: Ports (1) / LAGs (2).
- Edit read: `GET API/acl_membership_table_e.htm?Query:rlIfIndex=<if>@rlIfType=<t>` (built from Pkey `rlIfIndex$query`, `rlIfType$query`; exact column spelling inferred from the framework convention).
  - The form has two copies of `qosifPolicyVT`: `$query` and `$query2`. Each has `rlIfIndex`, `rlIfType`, `rlPhdPortsModuleNumber`, `rlQosIfAclIn`, `rlQosIfAclOut`, `rlQosIfIpv6AclIn`, `rlQosIfIpv6AclOut`.
  - Plus the `ACLVT` list.
- Edit fields:
  - Interface (label).
  - Binding Type radio `rdoBindingType`: 1 = Ingress (default), 2 = Egress. Switching re-reads the current In or Out binding.
  - Select MAC Based ACL: checkbox `chkMac` + `slcMac`.
  - Select IPv4 Based ACL: `chkIpv4` + `slcIpv4`.
  - Select IPv6 Based ACL: `chkIpv6` + `slcIpv6`.
  - Mutual exclusion: MAC excludes both IPv4 and IPv6. IPv4 and IPv6 can be combined. A checkbox is disabled when there are no ACLs of that type. If no ACL exists at all, saving alerts "No ACLs exist.".
- Save write (`POST API/acl_membership_table_e.htm`) is a two-phase write in one POST. With D = `In` or `Out`:
  1. Unbind: enable `rlIfIndex$query`, `rlIfType$query` (fetched values), `rlQosIfAcl<D>$query=0`, `rlQosIfIpv6Acl<D>$query=0`, `qosifPolicyVT$endQuery`.
  2. Bind: enable `rlIfIndex$query2`, `rlIfType$query2`, `rlQosIfAcl<D>$query2` = MAC index, or IPv4 index, or 0. Set `rlQosIfIpv6Acl<D>$query2` = IPv6 index or 0. Enable `qosifPolicyVT$endQuery2`.

  The `$endQuery`/`$endQuery2` values are not set by the JS (they keep the server-rendered values). A new UI should send `OK` (inferred). The other direction is not touched.
- Unbind (the "remove" button on the list): `POST API/acl_membership_table.htm`. For each selected interface, with row r = ifIndex (or ifIndex-999 for LAGs; this assumes row number == ifIndex):
  - enable `rlIfIndex$repeat?r`
  - `rlIfType$repeat?r` = 2
  - `rlQosIfAclIn`, `rlQosIfAclOut`, `rlQosIfIpv6AclIn`, `rlQosIfIpv6AclOut` (`$repeatIfPolicy?r`) = 0
  - enable `pVT$endRepeat?r` (value not set)

  This clears all four bindings, ingress and egress.
- Policy vs ACL (inferred): QoS policy binding (cosqos_service, `rlQosIfPolicyMapPointerIn`) uses the same `rlQosIfPolicyTable`, and its add form also carries `rlQosIfAclIn$query`/`rlQosIfIpv6AclIn$query`. So an interface has either an ingress policy map or ingress ACLs. ACL default action is set on the policy binding (`policyAclDefaultAction`); with a plain ACL binding the default is deny-all.
- PPF help: if proprietary protocol filtering is enabled on a port, a QoS ACL cannot be enabled on it.

### Time Range (`NetworkAdministration_Security_ACLACE_TimeRange`, Tags, Id 190)
- Menu: ... > Time Range. Help: "Time Range" (ACLandACETimeRange.html) and overview "Time Range Configuration" (time_range.html):
  - at most 10 absolute ranges
  - local time, not affected by DST
  - when combined with recurring entries, the ACE is active only if both the absolute and the recurring range are active
  - needs the system clock to be set
- Read: `GET API/security_time_range_m.htm`. `time_table` repeat: `rlTBITimeRangeName$repeat?N`, `rlTBITimeRangeAbsoluteStart$repeat?N`, `rlTBITimeRangeAbsoluteEnd$repeat?N`, `rlTBITimeRangeRowStatus$repeat?N`.
- Wire date format: `MM DD YY HH:MM` (14 characters, 2-digit year), e.g. `03 15 25 08:30`. An empty value means Immediate (start) or Infinite (end). The display shows `DD-Mon-20YY HH:MM`.
- Columns: Time Range Name, Absolute Start, Absolute End.
- Add read `GET API/security_time_range_a.htm`, write `POST API/security_time_range_a.htm`. Enabled fields:
  - `rlTBITimeRangeName$add`
  - `rlTBITimeRangeAbsoluteStart$add` (value or "")
  - `rlTBITimeRangeAbsoluteEnd$add` (value or "")
  - `rlTBITimeRangeRowStatus$add=4`
  - `time_table$endAdd=OK` (`time_table$add` is not enabled)
- Edit read `GET API/security_time_range_m.htm?Query:rlTBITimeRangeName=<name>` (inferred spelling). Write `POST API/security_time_range_m.htm` with `rlTBITimeRangeName$query`, `rlTBITimeRangeAbsoluteStart$query`, `rlTBITimeRangeAbsoluteEnd$query`, `time_table$endQuery=OK`. The name cannot be changed.
- Remove: `POST API/security_time_range_m.htm`. For each selected range i = 1..k: `rlTBITimeRangeName$repeat?i=<name>`, `rlTBITimeRangeRowStatus$repeat?i=6`, `time_table$endRepeat?i=OK`.
- Fields:
  - Time Range Name: 1-32 characters. Keypress only allows A-Z, a-z, 0-9 and space.
  - Absolute Start: radio Date (datepicker dd/mm/yyyy + time H:i) or Immediate (default).
  - Absolute End: Date or Infinite (default).
  - Validation: time must match `^([0-9]|0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$`, and start must not be after end ("Absolute Start date must be before Absolute End date.").
- After an add, the classic UI jumps to Time Range Recurrence.

### Time Range Recurrence (`Security_Time_Range_Recurrence`, Tags, Id 299)
- Menu: ... > Time Range Recurrence. Help: "Time Range Recurrence" (ACLandACETimeRangeRecurrence.html).
- Read: `GET API/security_recurring_range_m.htm?[recurring_table]Filter:(rlTBIPeriodicTimeRangeName='<name>')` (unfiltered on first load).
  - Rows: `rlTBIPeriodicTimeRangeName`, `rlTBIPeriodicWeekDayList`, `rlTBIPeriodicStart`, `rlTBIPeriodicEnd`, `rlTBIPeriodicRowStatus` (`$repeat?N`).
  - The View By list comes from the `rlTBITimeRangeName$select` value-select.
  - The page shows two tables: "Daily Recurrence" (WeekDays, Start Time, End Time) and "Weekly Recurrence" (Start Time, End Time).
- Encoding:
  - `rlTBIPeriodicWeekDayList`: a bit-char string with Mon first, i.e. `MTWTFSS` + pad `0` (8 characters). All 7 days display as "All".
  - Daily entry: WeekDayList has any bit set; start and end are `0 HH:MM`.
  - Weekly entry: WeekDayList = `00`; start and end are `D HH:MM` with D = 1 Mon … 6 Sat, 7 Sun.
- Add read: `GET API/security_recurring_range_a.htm?[time_table]Filter:(rlTBITimeRangeName='<name>')`. It shows the parent range's Absolute Start and End.
- Add write: `POST API/security_recurring_range_a.htm`. Note the template ACTION is `/Forms/config/security_recurring_range_a.htm`, but the classic UI posts to the API path. Fields use capital `$Add`:
  - `rlTBIPeriodicTimeRangeName$Add`
  - `rlTBIPeriodicWeekDayList$Add`
  - `rlTBIPeriodicStart$Add`
  - `rlTBIPeriodicEnd$Add`
  - `rlTBIPeriodicRowStatus$Add=4`
  - `recurring_table$endAdd=OK`
- Add fields:
  - Time Range Name (fixed to the View By selection).
  - Recurrence type `rdoRecurrence`: 1 = Daily (default), 2 = Weekly.
  - Daily: Start Time `lblStartTime` and End Time `lblEndTime` (H:i). Weekday checkboxes `chkOperation`: Sun..Sat + All, at least one required.
  - Weekly: Start = day `drpWeekdayStart` (Sun 7, Mon 1 … Sat 6) + time `datePickerStart`. End = `drpWeekdayEnd` + `datePickerEnd`.
  - There is no start < end check.
- Remove: `POST API/security_recurring_range_m.htm`. For each selected entry i: `rlTBIPeriodicTimeRangeName$repeat?i`, `rlTBIPeriodicWeekDayList$repeat?i`, `rlTBIPeriodicStart$repeat?i`, `rlTBIPeriodicEnd$repeat?i` (the composite key), `rlTBIPeriodicRowStatus$repeat?i=6`, `recurring_table$endRepeat?i=OK`.
- Add is disabled when no time range exists. Recurrence entries can't be edited, only added or removed.

### Denied ACEs Counters (`rmon_ace_counters`, Tags, Id 860)
- Menu: Statistics and Diagnostics > Statistics > Denied ACEs Counters. Help: StatisticsDeniedACEsCounters.html.
- Read: `GET API/rmon_ace_counters.htm?Filter[aceCountersVT]Filter:((rlQosDenyAceStatisticsIfIndex>=S)&&(rlQosDenyAceStatisticsIfIndex<S+N))`.
  - The initial URI has a stray `Filter` prefix. The Ports/LAGs switch builds `?[[aceCountersVT]Filter:(...)` with a doubled `[`. Both are typos; use `?[aceCountersVT]Filter:(...)` (inferred).
  - Rows: `rlQosDenyAceStatisticsIfIndex$repeat?N`, `rlQosDenyAceStatisticsIfCounter$repeat?N`.
  - Scalars: `rlQosDenyAceStatisticsOtherFlowCounter` (read, not shown), `rlQosDenyAceStatisticsClearOtherFlowCounter`, `rlQosDenyAceStatisticsClearIfCounters`.
- Columns: Interface, Dropped Packets. View By: Ports / LAGs.
- Reset Counter: `POST API/rmon_ace_counters.htm` with `rlQosDenyAceStatisticsClearOtherFlowCounter=1`, `rlQosDenyAceStatisticsClearIfCounters=0`, plus the non-disabled `aceCountersVT`/`aceCountersVT$endVT`. This clears all interfaces; there is no per-interface clear.

### Proprietary Protocol Filtering (`proprietary_protocol_filterring`, Tags) — brief
- Menu: ... > Proprietary Protocol Filtering. Help: ACLandACEProprietaryProtocolFiltering.html. It blocks CDP/VTP/DTP/UDLD/PaGP (DA 0100.0ccc.cccc) and SSTP (0100.0ccc.cccd) on ingress, and is mutually exclusive with a QoS ACL on the port.
- Read: `GET API/proprietary_protocol_filterring.htm?[protocolFilterVTable]Filter:((ifIndex>=S)&&(ifIndex<S+N))`. Rows: `ifIndex`, `rlProtocolFilteringList`, `rlProtocolFilteringRowStatus`, `rlPhdPortsModuleNumber`, `rlPhdPortsIfIndexName`, `ifOperStatus` (`$repeat?N`).
- `rlProtocolFilteringList` is an 8-character bit string. Positions: 0 All, 1 CDP, 2 VTP, 3 DTP, 4 UDLD, 5 PaGP, 6 SSTP, 7 unused.
- Edit read: `GET API/proprietary_protocol_filterring_e.htm?[protocolFilterVT]Query:ifIndex=<if>`. The VT name in the template is `protocolFilterVTable`. Fields: `ifIndex$query`, `rlProtocolFilteringList$query`, `rlProtocolFilteringRowStatus$query`, plus `$add` versions and `protocolFilterVTable$endAdd`. An empty `ifIndex$query` means no row exists.
- Blocked Protocol: 1 None, 2 Block All (bit 0), 3 Select Protocols (transfer box).
- Save:
  - If no row exists and bits ≠ `00000000`: create with `ifIndex$add`, `rlProtocolFilteringList$add`, `rlProtocolFilteringRowStatus$add=4`.
  - If a row exists and bits are all zero: `rlProtocolFilteringRowStatus$query=6`.
  - If a row exists and bits are non-zero: destroy (`$query` RowStatus 6) and re-create (`$add`, 4) in the same POST.
- Quirks:
  - `disableQuery` uses `protocolFilterVT$query` names, which don't match the template. `protocolFilterVTable$query`/`$endQuery` are rendered enabled and always posted.
  - The JS never enables `protocolFilterVTable$endAdd`.
  - The available-protocols list stops before SSTP (`length-1`), so SSTP can't be selected individually (inferred bug).

### Gotchas summary
- Write order: create the ACL (wcd `ACLList` set), then add ACEs one at a time (one Tags POST per ACE for MAC/IPv4, one wcd `ACLRuleList` set for IPv6), then bind (ACL Binding). Time ranges must exist before you reference them from an ACE.
- An ACE has no update. To change one, remove it and re-add it. The priority is the key, and the client only checks for duplicates within the ACL being viewed.
- MAC and IPv4 ACEs are a three-table write: tuples plus the ACE row. Tuple indexes come from the free-index query, so they must be fetched fresh right before each add. The classic remove does not clean up tuples.
- MAC and IPv4 ACLs share a single binding slot per direction (`rlQosIfAcl{In,Out}`); IPv6 has its own slot. Binding Save always zeroes that direction's slots first, then writes the new values.
- Deleting an ACL that is still bound, or a time range still used by an ACE: the client does no check. Expect the device to reject the request with a `mibError` / wcd error (inferred). Unbind or remove the dependents first.
- Clear counters is global (ClearOtherFlowCounter=1, ClearIfCounters=0).

---

## 6. Security extras

Conventions used below (all verified in js/views.js, js/components/serverManager.js, containerManager.js, buttonmanager.js unless marked):
- "Tags" pages: GET `API/<x>.htm[?...]`; POST `application/x-www-form-urlencoded` = jQuery `serialize()` of every *enabled* input of the last-fetched form (`restoreUrl`, `errorCollector` are never disabled, so always sent). POST URL = the URI used for the dialog (views.js:801 posts to `DataURI` = GetEditDataURI/GetAddDataURI/GetDataURI, *including* the substituted `?Query:...`). Errors: hidden `mibError` inputs in the response.
- Tags edit-dialog read URI: `<page>_e.htm?` + [filter + `^`] + `Query:<col>=<val>@<col2>=<val2>`; with >1 key section: `[<SectionA>]Query:a=1[<SectionB>]Query:b=2` (no separator). Values pass `adjustStringToQuery` (escapes `^ [ " ' \ @` with `\`, `# % ? ; & +` percent-encoded) unless page sets `AdjustFilterAndQuery:false`.
- Row keys: a column is a key if its field base-name (before `$`) is in `dataSource[].Pkey` (containerManager.js:246-263).
- Remove on Tags tables: for each selected row i (1-based *selection index*, not table position) the page writes key fields as `<field>$repeat?i`, row-status `...$repeat?i=6` (destroy), and `<VT>$endRepeat?i=OK`.
- RowStatus values: 1=active, 4=createAndGo, 6=destroy.
- Interfaces are ifIndex numbers (ports from `globalParameters.StartingPortPerModuleArr`, LAGs from `globalParameters.trunkFirstIndex`, inferred ~1000+). MACs are returned as 12 hex chars (no separators); UI inserts `:`.
- Defaults marked "(inferred, MIB)" come from IEEE8021-PAE-MIB DEFVALs, not from the switch files.

---

### 802.1X Port Based Authentication - Global (classic: Network Administration > Security > Dot1x Authentications > Port Based Authentication - Global; help "Port-Based Authentication Global", Dot1xAuthenticationsPortBasedAuthentication-Global.html)
Page `authen_global_param` (Tags, scalar).
- Read: `GET API/authen_global_param.htm`. Sections parsed: `AuthSetting` (scalars `dot1xPaeSystemAuthControl`, `rlAAAEapCurrentMethodList`, `rldot1xGuestVlanVID$scalar`, `rldot1xRadiusAttributesErrorsAclReject$scalar`), `MethodListTable` (VT rows `rlAAAEapMethodListName$repeat?N`, `rlAAAEapMethodType1..5$repeat?N`, `MethodListTable$endRepeat?N`), `queueVlanCurrentTable` (`dot1qVlanIndex$select` VLAN list; JS ignores it and uses `interfaceManager.vlanInterfaceType()` for the Guest VLAN dropdown).
- Write: `POST API/authen_global_param.htm`, enabled fields (all always sent by Save):
  - `dot1xPaeSystemAuthControl=<1|2>`
  - `rlAAAEapMethodListName$repeat?1=<name read from row 1>`
  - `rlAAAEapMethodType1$repeat?1`, `rlAAAEapMethodType2$repeat?1`: method RADIUS -> 1,0; None -> 2,0; RADIUS,None -> 1,2
  - `MethodListTable$endRepeat?1=OK`
  - `rldot1xGuestVlanVID$scalar=<VID or 0>`
  - `rldot1xRadiusAttributesErrorsAclReject$scalar=<1|2>`
  - (`rlAAAEapCurrentMethodList` is never sent.)
- Fields:

| field | meaning | values | range/validation | default |
|---|---|---|---|---|
| dot1xPaeSystemAuthControl | Port Based Authentication State | 1=Enabled, 2=Disabled | radio | 2 Disabled (inferred, MIB) |
| (method, from MethodListTable row 1 Type1/Type2) | Authentication Method | UI value 1=RADIUS, 2=None, 3=RADIUS, None. Read: value = Type1 + Type2 (ignoring 0); 0 -> shown as 2 None | dropdown | n/d |
| rldot1xGuestVlanVID$scalar | Guest VLAN (radio Enabled/Disabled) + VLAN List | 0 = disabled/None; else VLAN ID | dropdown of existing VLANs + "None"(0); radio and dropdown are kept in sync | 0 |
| rldot1xRadiusAttributesErrorsAclReject$scalar | Accept Supplicant when Dynamic Policy / ACL Assignment Has No Resources | 2=Enabled (accept), 1=Disabled (reject) — note inverted numbering | radio | n/d |

- Gotchas: Port auth needs a RADIUS server (Management Security > RADIUS, other part) unless method None. Method is not a scalar: it is row 1 of the EAP method-list VT; send the read name back unchanged. Guest VLAN must be an existing VLAN.

### 802.1X Port Based Authentication - Interface Settings (classic: Network Administration > Security > Dot1x Authentications > Port Based Authentication - Interface Settings; help "Port-Based Authentication Interface Settings", Dot1xAuthenticationsPortBasedAuthentication-InterfaceSettings.html)
Page `authen_table` (Tags, table, edit-only).
- Read list: `GET API/authen_table.htm` (VT `AuthenTable`, rows `<col>$repeat?N`; scalar `rldot1xGuestVlanPorts$scalar` = port bitmap hex octets, bit (ifIndex-1) MSB-first). Columns read: `dot1xPaePortNumber, dot1xAuthSessionUserName, dot1xAuthAuthControlledPortControl, dot1xAuthAuthControlledPortStatus, ifOperStatus, rldot1xAuthenticationPortMethod, rldot1xRadiusAttrVlanIdEnabled, rldot1xRadiusAttAclNameEnabled, dot1xAuthReAuthEnabled, dot1xAuthReAuthPeriod, dot1xPaePortReauthenticate, dot1xAuthPaeState, dot1xAuthQuietPeriod, dot1xAuthTxPeriod, dot1xAuthMaxReq, dot1xAuthSuppTimeout, dot1xAuthServerTimeout, dot1xAuthSessionTerminateCause, swIfHostMode` (+ `rlPhdPortsModuleNumber`). One row per port (all ports; no LAGs).
- Read edit: `GET API/authen_table_e.htm?Query:dot1xPaePortNumber=<ifIndex>` -> `$query` fields of VT `securityPortAuthTable`, plus `rldot1xGuestVlanVID$scalar`, `rldot1xGuestVlanPorts$scalar`, selects `dot1xAuthAuthControlledPortControl$query` (options RpItemNumber 1=Unauthorized, 2=Auto, 3=Authorized) and `dot1xAuthReAuthEnabled$select` (1=Enable, 2=Disable).
- Write: `POST API/authen_table_e.htm?Query:dot1xPaePortNumber=<ifIndex>`; Save enables: every `$query` field of the dialog with its value (`dot1xPaePortNumber$query`, `dot1xAuthAuthControlledPortStatus$query` (read-only echo), `rldot1xAuthenticationPortMethod$query`, `rldot1xRadiusAttrVlanIdEnabled$query`, `rldot1xRadiusAttAclNameEnabled$query`, `dot1xAuthReAuthEnabled$query`, `dot1xAuthReAuthPeriod$query`, `dot1xPaePortReauthenticate$query`, `dot1xAuthServerTimeout$query`, `dot1xAuthTxPeriod$query`, `dot1xAuthQuietPeriod$query`, `dot1xAuthSuppTimeout$query`, `dot1xAuthMaxReq$query`; NOT `dot1xAuthSessionUserName$query`), select `dot1xAuthAuthControlledPortControl$query=<1|2|3>` (posted value = item number, inferred), select `dot1xAuthReAuthEnabled$select=<1|2>`, `securityPortAuthTable$endQuery=OK`, and `rldot1xGuestVlanPorts$scalar=<whole bitmap with this port's bit set/cleared>`.
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| dot1xPaePortNumber | port ifIndex (key) | | | |
| dot1xAuthSessionUserName | User Name (RO) | string | | |
| dot1xAuthAuthControlledPortControl | Admin Interface Control | 1=Unauthorized (force-unauth), 2=Auto, 3=Authorized (force-auth) | | 3 Authorized (inferred, Dell default "force-authorized") |
| dot1xAuthAuthControlledPortStatus | Current Interface Control (RO) | 1=Authorized, 2=Unauthorized, else Undefined; if ifOperStatus!=1 shown "Port Down" | | |
| rldot1xAuthenticationPortMethod | Authentication Type | 1=802.1x Only, 2=802.1x & MAC, 3=MAC Only | | 1 |
| rldot1xRadiusAttrVlanIdEnabled | Dynamic VLAN Assignment | 1=Enabled, 2=Disabled | | 2 |
| (bit in rldot1xGuestVlanPorts$scalar) | Guest VLAN per port | bit 1=Enabled, 0=Disabled | | 0 |
| rldot1xRadiusAttAclNameEnabled | Dynamic Policy / ACL Assignment | 1=Enabled, 2=Disabled | | 2 |
| dot1xAuthReAuthEnabled ($query and $select) | Periodic Reauthentication | 1=Enabled, 2=Disabled | | 2 (inferred, MIB) |
| dot1xAuthReAuthPeriod | Reauthentication Period (s) | | 300-4294967295 | 3600 (inferred, MIB) |
| dot1xPaePortReauthenticate | Reauthenticate Now (action checkbox) | 1=checked (trigger), 2=unchecked | | 2 |
| dot1xAuthServerTimeout | Authentication Server Timeout (s) | | 1-65535 | 30 (inferred, MIB) |
| dot1xAuthTxPeriod | Resending EAP Identity Request (s) | | JS 30-65535 (help says 1-65535) | 30 (inferred, MIB) |
| dot1xAuthQuietPeriod | Quiet Period (s) | | 10-65535 | 60 (inferred, MIB) |
| dot1xAuthSuppTimeout | Supplicant Timeout (s) | | 1-65535 | 30 (inferred, MIB) |
| dot1xAuthMaxReq | Max EAP Requests | | 1-10 | 2 (inferred, MIB) |
| dot1xAuthPaeState | Authenticator State (RO, list only) | 1 Initialize, 2 Disconnected, 3 Connecting, 4 Authenticating, 5 Authenticated, 6 Aborting, 7 Held, 8 Force Authorized, 9 Force Unauthorized (classic JS has a duplicate `case 8`, so 9 shows "Undefined") | | |
| dot1xAuthSessionTerminateCause | Termination Cause (RO) | 1 Supplicant logoff, 2 Port failure, 3 Supplicant restart, 4 Reauthentication failed, 5 Force unauthorized, 6 Port re-initialize, 7 Port administratively disabled, 999 Not terminated yet | | |
| swIfHostMode | host mode (from Host Authentication) | see below | | |

- Gotchas (client-side checks in `checkAuthType`, evaluated against the *currently stored* values):
  - Changing Authentication Type between 802.1x-only and any MAC mode requires the port's stored Admin control already = 3 (Authorized). Two-step: first set Authorized, save, then change type.
  - Enabling MAC (type 2/3) requires Periodic Reauthentication already enabled (stored value). Disabling reauth while type != 1 is refused ("disable MAC-Authentication also").
  - Changing Dynamic VLAN Assignment requires stored Admin control = 3 ("Forced Authorized mode first").
  - Help: DVA needs a RADIUS server, port auth enabled and host mode Multiple-Session (classic checkHostAut is dead code; not enforced client-side). Port Lock/Port Monitor (Port Security) must be off with DVA.
  - Guest VLAN per-port is a read-modify-write of the global bitmap `rldot1xGuestVlanPorts$scalar`; read it fresh from the _e form and flip only this port's bit.
  - "Reauthenticate Now" is an action: send `dot1xPaePortReauthenticate$query=1`.
  - Help: MAC auth needs RADIUS user/password = MAC lower-case without separators (e.g. 0020aa00bbcc); max 8 MAC-auth hosts per port.

### 802.1X Host Authentication (classic: Network Administration > Security > Dot1x Authentications > Host Authentication; help "Host Authentication", Dot1xAuthenticationsHostAuthentication.html)
Page `advanced_authen_table` (Tags, table, edit-only; AdjustFilterAndQuery=false).
- Read list: `GET API/advanced_authen_table.htm?Filter:((ifOperStatus!=6) && (ifIndex <=<lastPortOfFirstModule>))` (VT `secPAuthAdvTable`; rows `ifIndex, ifOperStatus, rldot1xRadiusAttrVlanIdEnabled, swIfHostMode, swIfSingleHostViolationAdminAction, dot1xAuthAuthControlledPortStatus, dot1xAuthAuthControlledPortControl, swIfSingleHostViolationOperTrapCount` as `$repeat?N`). ifOperStatus 6 = notPresent.
- Read edit: `GET API/advanced_authen_table_e.htm?Filter:((ifOperStatus!=6) && (ifIndex <=<last>))^Query:ifIndex=<ifIndex>` (unescaped).
- Write: `POST` same URL; enables all dialog `$query` fields with values: `ifIndex$query`, `swIfHostMode$query`, `swIfSingleHostViolationAdminAction$query`, plus `secPAuthAdvTable$endQuery=OK`.
- Fields:

| field | meaning | values | notes | default |
|---|---|---|---|---|
| ifIndex | Port | | key | |
| swIfHostMode | Host Authentication | 1=Single, 2=Multiple-Host, 3=Multiple-Session | | 2 Multiple-Host (inferred) |
| swIfSingleHostViolationAdminAction | Action on Single Host Violation | 1=Discard, 2=Forward, 3=Shutdown | only editable when mode=1; JS forces 1 otherwise | 1 |
| (derived) Single Host Status (RO) | if mode!=1 "No Single-host"; else if ifOperStatus=1 and PortStatus=1: PortControl=2 -> "Single-host locked" else "Not in auto mode"; else "Unauthorized" | | classic bug: ifOperStatus not in dataSource -> always "Unauthorized" for single-host ports | |
| swIfSingleHostViolationOperTrapCount | Number of Violations (RO) | int | | |

- Gotchas: Port Security cannot be enabled on a single-host port (help). Multiple-Session required for DVA / per-host filtering.

### 802.1X Port Authentication Users (classic: Network Administration > Security > Dot1x Authentications > Port Authentication Users; help "Port Authentication Users", Dot1xAuthenticationsPortAuthenticationUsers.html)
Page `users_table` (Tags, read-only; Buttons: details).
- Read list: `GET API/users_table.htm`: VT `authSessionTable` rows `dot1xPaePortNumber$repeat0?N`, `rlDot1xAuthSessionAuthenticMethod$repeat0?N` (per-port, note `repeat0` naming); VT `authMultiSessionTable` rows `rldot1xAuthMultiSessionUserName, rldot1xAuthMultiSessionStatsPortNumber, rldot1xAuthMultiSessionTime, rldot1xAuthMultiSessionStatsSourceMac, rldot1xAuthMultiSessionRadiusAttrVlan, rldot1xAuthMultiSessionRadiusAttrFilterId` (`$repeat?N`).
- Read details: `GET API/users_table_d.htm?[authMultiSessionTable]Query:rldot1xAuthMultiSessionStatsPortNumber=<ifIndex>@rldot1xAuthMultiSessionStatsSourceMac=<mac hex>[authSessionTable]Query:dot1xPaePortNumber=<ifIndex>` -> adds `rldot1xAuthMultiSessionRadiusAttrSecondFilterId$query`.
- Write: none.
- Fields: User Name; Port (ifIndex); Session Time (seconds -> `secondsToTimeString`); Authentication Method (joined by port from authSessionTable: 1=Remote, 2=Local, 3=None); MAC Address; VLAN (`...RadiusAttrVlan`, 0 -> blank); Filter (`...FilterId`: ""/" " -> blank, "warning" -> "Warning" (resource allocation problem), else "OK"; details shows text); Filter #2 (`...SecondFilterId`, details only).

### 802.1X Monitoring Users (orphan: page `network_authen_monitor_table`, title "Monitoring Users"; NOT linked from js/tree_Items.js, no help page)
- Read: `GET API/network_authen_monitor.htm`; VT `authMultiSessionTable` rows (only rendered when `rldot1xSystemAuthControlMonitorVlan` exists and >0): `rldot1xAuthMultiSessionUserName, rldot1xAuthMultiSessionStatsPortNumber, rldot1xAuthMultiSessionRadiusAttrVlan, rldot1xAuthMultiSessionStatsSourceMac, rlDot1xAuthMultiSessionMonitorResultsReason, rldot1xAuthMultiSessionTime`.
- Write: none (NotEditable; listed Buttons have no handlers/pages).
- Reject Reason enum `rlDot1xAuthMultiSessionMonitorResultsReason`: 1 ACL Does Not Exist, 2 ACL: TCAM Overflow, 3 Wrong Username or Password, 4 More than 2 Filter IDs, 5 IPv6 Destination and MAC, 6 IPv6 and Not IP, 7 Policy Map Is Not Supported, 8 ACL Is Deleted, 9 Policy Map Is Deleted, 10 Default VLAN, 11 Dynamic VLAN, 12 Guest VLAN, 13 VLAN Was Not Sent, 14 VLAN Does Not Exist, 15 VLAN TCAM Overflow, 16 Voice VLAN, 17 Unauthenticated VLAN, 18 First Method Is Deny, 19 RADIUS Error, 20 RADIUS Invalid Packet, 21 RADIUS Is Not Responding.
- Gotcha: monitor mode VLAN (`rldot1xSystemAuthControlMonitorVlan`) has no configuration page in the classic UI; the table is empty unless set via CLI (inferred).

### EAP Statistics (classic: Statistics and Diagnostics > Statistics > EAP Statistics; help "EAP Statistics", StatisticsEAPStatistics.html)
Page `eap_statistics` (wcd, read-only).
- Read: `GET wcd?{EAPStatisticsList&interfaceType=1}` (ports only; no LAG view, showViewAll=false). Entry fields: `interfaceName` (key), `interfaceType`, `interfaceID`, `receiveFrameCount`, `transmitFrameCount`, `receiveStartFrameCount`, `receiveLogoffFrameCount`, `receiveRespondIDFrameCount`, `receiveRespondFrameCount`, `transmitRequestIDFrameCount`, `transmitRequestFrameCount`, `receiveInvalidFrameCount`, `receiveLengthErrorFrameCount`, `lastFrameVersion`, `lastFrameSourceMACAddress`.
- Write: none (no clear-counters action in classic).
- UI: refresh-rate dropdown (No Refresh 0 / 15 / 30 / 60 s) re-polls the same GET.

### Local User Database (requested as dot1x-related; true location: Switch Management > Management Security > Local User Database; help "Local User Database", ManagementSecurityLocalUserDatabase.html)
Page `auth_table_TIC` (Tags; management login users, not 802.1X supplicants). AdjustFilterAndQuery=false; edit key escaped by its own `createQueryUserName` (same rules as adjustStringToQuery).
- Read list: `GET API/auth_table_TIC.htm` (VT `LocalUserTable`; rows `rlAAALocalUserName, rlAAALocalUserPrivilage, rlAAALocalPasswordExpieryDate, rlAAALocalLockedState, rlAAAUnlockUserName, rlAAALocalHostStatus` `$repeat?N`, `LocalUserTable$endRepeat?N`).
- Read add: `GET API/auth_table_TIC_a.htm` (gives `rlAAAMinPasswordLength$Scalar`, `rlAAAPasswordComplexityEnabled$Scalar`).
- Read edit: `GET API/auth_table_TIC_e.htm?Query:rlAAALocalUserName=<escaped name>`.
- Add: `POST API/auth_table_TIC_a.htm` (inputs in _a are NOT disabled, all sent): `rlAAALocalUserName$add=<name>`, `rlAAALocalUserPrivilage$add=<1|15>`, `rlAAALocalUserPassword$add=$<password>` (literal `$` prefix), `rlAAALocalHostStatus$add=4`, `LocalUserTable$endAdd=OK`.
- Edit: `POST API/auth_table_TIC_e.htm?Query:rlAAALocalUserName=<name>`: `rlAAALocalUserName$query`, `rlAAALocalUserPrivilage$query`, `rlAAALocalHostStatus$query=1`, `rlAAALocalUserPassword$query=$<password>`; if "Reactivate Suspended User" checked also `rlAAAUnlockUserName$scalar=<name>`. Classic does NOT enable `LocalUserTable$endQuery` (send `LocalUserTable$endQuery=OK` in a reimplementation, inferred needed).
- Delete: `POST API/auth_table_TIC.htm`: per selected i `rlAAALocalUserName$repeat?i=<name>`, `rlAAALocalHostStatus$repeat?i=6`, `LocalUserTable$endRepeat?i=OK`.
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| rlAAALocalUserName | User Name | | 1-20 chars, required | admin exists by default |
| rlAAALocalUserPrivilage | Access Level | 1=Read-Only, 15=Read-Write | radio | 1 on add |
| rlAAALocalUserPassword | Password (+ Confirm, client-only) | sent as `$`+plaintext | max 64; if `rlAAAPasswordComplexityEnabled$Scalar`=1: non-empty and >= `rlAAAMinPasswordLength$Scalar` (help says 8-64) | |
| rlAAALocalPasswordExpieryDate | Expiry Date (RO) | 0 -> "Never" | | |
| rlAAALocalLockedState | Lockout Status (RO) | 0=Locked, 1=Usable | | |
| rlAAAUnlockUserName$scalar | Reactivate Suspended User | set to user name to unlock | checkbox only enabled when Locked | |

- Gotchas: edit always re-sends the password (required). Deleting the current/last admin user is not guarded client-side.

### SNTP Authentication (`show_authen_table` — NOT 802.1X; true location: Switch Management > Time Synchronization > SNTP Authentication; help "SNTP Authentication", TimeSynchronizationSNTPAuthentication.html)
Page `show_authen_table` (Tags; MetaData.Title wrongly says "Local User Database"; metadata Title "SNTP Authentication").
- Read: `GET API/show_authen_table.htm` -> scalar `rlSntpAuthenticationState$scalar`; VT `sntp_authentication_Table` rows `rlSntpAuthenticationKeyID, rlSntpAuthenticationKeyValue, rlSntpAuthenticationKeyState, rlSntpAuthenticationRowStatus` `$repeat?N`, `sntp_authentication_Table$endRepeat?N`.
- Settings (global enable): `POST API/show_authen_table.htm`: `rlSntpAuthenticationState$scalar=<1|2>`. Classic bug: uses `$("input[name='rdoSNTPAuthenStatus']").val()` (first radio), so it always sends 1 (inferred); send the selected value.
- Add: `GET/POST API/show_authen_table_a.htm`: `rlSntpAuthenticationKeyID$add`, `rlSntpAuthenticationKeyValue$add`, `rlSntpAuthenticationKeyState$add`, `rlSntpAuthenticationRowStatus$add=4`, `sntp_authentication_table$endAdd=OK`.
- Edit: `GET/POST API/show_authen_table_e.htm?Query:rlSntpAuthenticationKeyID=<id>` (all _e VT inputs are not disabled, so always sent): `rlSntpAuthenticationKeyID$query`, `rlSntpAuthenticationKeyValue$query`, `rlSntpAuthenticationKeyState$query`, `rlSntpAuthenticationRowStatus$query`, `sntp_authentication_table$query`, `sntp_authentication_table$endQuery=OK`.
- Delete: `POST API/show_authen_table.htm`: `rlSntpAuthenticationKeyID$repeat?i=<id>`, `rlSntpAuthenticationRowStatus$repeat?i=6`, end marker: JS enables `sntp_authentication_table$endRepeat?i` (lower-case t) but the list form names it `sntp_authentication_Table$endRepeat` -> no end marker sent in classic (likely broken delete, inferred). Reimplementation: send `sntp_authentication_Table$endRepeat?i=OK`.
- Fields: `rlSntpAuthenticationState` SNTP Authentication 1=Enabled 2=Disabled; `rlSntpAuthenticationKeyID` Encryption Key ID 1-4294967295 (key, RO on edit); `rlSntpAuthenticationKeyValue` Authentication Key string 1-8 chars; `rlSntpAuthenticationKeyState` Trusted Key 1=Enabled 2=Disabled (add default 2).

### DHCP Server Network Pool (`NetworkPool`; true location: Network Administration > DHCP Server > Network Pool; help "Network Pool", DHCPServerNetworkPool.html)
Page `NetworkPool` (wcd, table).
- Read list: `GET wcd?{DHCPSrvNetworkPoolList}`; entry fields `poolName` (key), `subnetMask`, `loIPAddr`, `hiIPAddr`, `leaseTime`, `totalAddrNum`, `freeAddrNum`, `domainName`, `NetBIOSType`, `nxtSrvIPAddr`, `nxtSrvName`, `bootfileName`, nested lists `RoutersList/RoutersEntry/routerIpAddr`, `DNSSrvList/DNSSrvEntry/DNSSrvIpAddr`, `NetBIOSNameSrvList/NetBIOSNameSrvEntry/NetBIOSNameSrvIpAddr`, `TimeSrvList/TimeSrvEntry/timeSrvIpAddr`.
- Read edit: `GET wcd?{DHCPSrvNetworkPoolList&poolName=<encodeURIComponent(name)>}`.
- Add and Edit (identical, action="set"): `POST wcd?{DHCPSrvNetworkPoolList}`
  `<DeviceConfiguration><DHCPSrvNetworkPoolList action="set"><Entry><poolName/><loIPAddr/><hiIPAddr/><subnetMask/><leaseTime/><nxtSrvIPAddr/><nxtSrvName/><bootfileName/><domainName/><NetBIOSType/><RoutersList><RoutersEntry><routerIpAddr/></RoutersEntry></RoutersList><TimeSrvList><TimeSrvEntry><timeSrvIpAddr/></TimeSrvEntry></TimeSrvList><DNSSrvList><DNSSrvEntry><DNSSrvIpAddr/></DNSSrvEntry></DNSSrvList><NetBIOSNameSrvList><NetBIOSNameSrvEntry><NetBIOSNameSrvIpAddr/></NetBIOSNameSrvEntry></NetBIOSNameSrvList></Entry></DHCPSrvNetworkPoolList></DeviceConfiguration>` (empty strings sent for blank optional fields).
- Delete: `<DHCPSrvNetworkPoolList action="delete"><Entry><poolName>X</poolName></Entry>...</DHCPSrvNetworkPoolList>` (multi-select).
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| poolName | Pool Name (key) | | 0-32 chars, required | |
| (client only) Subnet IP Address + Mask/Prefix | used only to compute start/end: start = subnet with host bits 0..01, end = 1..10 | prefix 8-30 | | |
| subnetMask | Network Mask (dotted; prefix converted client-side) | | required | |
| loIPAddr / hiIPAddr | Address Pool Start / End | IPv4 | required | |
| leaseTime | Lease Duration seconds = d*86400+h*3600+m*60 | 4294967295 = Infinite | days 0-49710, hours 0-23, minutes 0-59 | 1 day (86400) in UI |
| routerIpAddr | Default Router (opt 3) | IPv4 | optional | |
| DNSSrvIpAddr | Domain Name Server (opt 6) | IPv4 | optional | |
| domainName | Domain Name (opt 15) | | 0-32 | |
| NetBIOSNameSrvIpAddr | NetBIOS WINS Server (opt 44) | IPv4 | optional | |
| NetBIOSType | NetBIOS Node Type (opt 46) | None (radio has no value attr -> sends "on", inferred; likely 0 intended), 1=Broadcast, 2=Peer-to-Peer, 4=Mixed, 8=Hybrid | | UI preselects None (help says Hybrid default) |
| timeSrvIpAddr | SNTP Server (opt 4) | IPv4 | optional | |
| nxtSrvIPAddr | Next Server (siaddr) | IPv4 | optional | |
| nxtSrvName | Next Server Name (opt 66) | | 0-32 | |
| bootfileName | Image File Name (opt 67) | | 0-32 | |
| totalAddrNum - freeAddrNum | Number of Leased Addresses (RO) | | | |

- Gotchas: max 8 pools (help). Only one router/DNS/WINS/SNTP entry editable (first of each list). Edit dialog does not preselect NetBIOSType from the entry (inferred: generic dataID binding may). DHCP server must be enabled in DHCP Server Properties (other part).

---

### DHCP Snooping Global Settings (classic: Network Administration > DHCP Snooping and Relay > DHCP Snooping > Global Settings; help "DHCP Snooping Global Settings", DHCPSnoopingGlobalSettings.html)
Page `property_dhcp` (Tags, scalar). `tpl/property_dhcp.htm` is the legacy RomPager page (same field names, plus interval text box).
- Read: `GET API/property_dhcp.htm` -> hidden inputs `rlIpDhcpSnoopEnable`, `rlIpDhcpOpt82RxOnUntrustedEnable`, `rlIpDhcpSnoopVerifyMacAddress`, `rlIpDhcpSnoopFileEnable`, `rlIpDhcpSnoopFileUpdateTime` (section `DhcpSnoopSetting`).
- Write: `POST API/property_dhcp.htm`. If Enabled: enable+send `rlIpDhcpSnoopEnable=1`, `rlIpDhcpOpt82RxOnUntrustedEnable`, `rlIpDhcpSnoopVerifyMacAddress`, `rlIpDhcpSnoopFileEnable`. If Disabled: only `rlIpDhcpSnoopEnable=2`.
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| rlIpDhcpSnoopEnable | DHCP Snooping Status | 1=Enabled, 2=Disabled | | 2 (inferred) |
| rlIpDhcpOpt82RxOnUntrustedEnable | Option 82 Passthrough (forward option-82 pkts from untrusted) | 1/2 | only when enabled | 2 (inferred) |
| rlIpDhcpSnoopVerifyMacAddress | Verify MAC Address (src MAC vs chaddr on untrusted) | 1/2 | only when enabled | 1 (inferred) |
| rlIpDhcpSnoopFileEnable | Save Binding Database to File (flash) | 1/2 | only when enabled | 2 (inferred) |
| rlIpDhcpSnoopFileUpdateTime | Save Binding Database Interval (s) | | 600-86400 (legacy tpl) | 1200 (inferred) |

- Gotchas: the new classic page has no input for `rlIpDhcpSnoopFileUpdateTime` (read but never written); the API form accepts it, so a new UI can expose it. Sub-options are greyed out when snooping is disabled. Global enable is a prerequisite for VLAN settings, binding DB and DAI's use of the binding DB.

### DHCP Snooping VLAN Settings (classic: Network Administration > DHCP Snooping and Relay > DHCP Snooping > VLAN Settings; help "VLAN Settings", DHCPSnoopingVLANSettings.html)
Page `vlan_Settings` (wcd).
- Read: `GET wcd?{VLANCurrentStatus}{DHCPSnoopingVLANList}`. `VLANCurrentStatus/currentVLANs` = range string of existing VLANs (e.g. `1,10-20`); `DHCPSnoopingVLANList` entries `VLANID`, `VLANName` (snooping-enabled VLANs). List label "VLAN n (Default)" for 1 else "VLAN n (name)".
- Add (enable on VLAN): `POST wcd?{VLANList}{DHCPSnoopingVLANList}` body `<DHCPSnoopingVLANList action="set"><VLAN><VLANID>n</VLANID></VLAN></DHCPSnoopingVLANList>`.
- Remove: `<DHCPSnoopingVLANList action="delete"><VLAN><VLANID>n</VLANID></VLAN></DHCPSnoopingVLANList>` (value from the multi-select; if several selected, `VLANID` may be an array -> repeated `<VLANID>` elements, inferred; send one VLAN per entry).
- Validation: VLAN ID text box required; must exist in currentVLANs and not already enabled; client max 90 enabled VLANs (`maxDisabledVlan:90`).
- Gotchas: needs global snooping enabled first (help). Disabling on a VLAN deletes that VLAN's binding entries.

### DHCP Snooping Trusted Interfaces (classic: Network Administration > DHCP Snooping and Relay > DHCP Snooping > Trusted Interfaces; help "Trusted Interfaces", DHCPSnoopingTrustedInterfaces.html)
Page `trusted_table` (Tags; View By Ports/LAGs).
- Read list: `GET API/trusted_table.htm` -> VT `dhcpTrustedTable` rows `ifIndex$repeat?N`, `rlIpDhcpSnoopTrustedPortRowStatus$repeat?N`. Table contains ONLY trusted interfaces; UI synthesizes all ports (or LAGs) and marks present ones Enabled.
- Read edit: `GET API/trusted_table_e.htm?Query:ifIndex=<ifIndex>`; row returned (`ifIndex$query` == port) => trusted.
- Write: `POST API/trusted_table_e.htm?Query:ifIndex=<ifIndex>`:
  - Trust Enabled: `ifIndex$query=<ifIndex>`, `rlIpDhcpSnoopTrustedPortRowStatus$query=4`, `dhcpTrustedTable$endAdd=OK` (note: `$query` values with `$endAdd`; `ifIndex$add`/`...RowStatus$add` stay disabled).
  - Trust Disabled: `ifIndex$query=<ifIndex>`, `rlIpDhcpSnoopTrustedPortRowStatus$query=6`, `dhcpTrustedTable$endQuery=OK`.
- Fields: Interface (ifIndex); Trust 1=Enabled (row exists) / 2=Disabled (no row). Default: all untrusted.
- Gotchas: presence-based table (create/destroy rows); per-interface only (no bulk); uplink/DHCP-server ports must be trusted or DHCP offers are dropped.

### DHCP Snooping Binding Database (classic: Network Administration > DHCP Snooping and Relay > DHCP Snooping > Binding Database; help "Binding Database", DHCPSnoopingBindingDatabase.html)
Page `binding_database` (Tags; Buttons add, remove, filter "Search Binding Database"/Query).
- Read: `GET API/binding_database.htm[?Filter:(...)]` -> VT `dhcpBindingTable` rows `rlIpDhcpSnoopMACAddress, rlIpDhcpSnoopVLANTag, rlIpDhcpSnoopIPAddress, rlIpDhcpSnoopPortInterface, rlIpDhcpSnoopType, rlIpDhcpSnoopLeaseTime, rlIpDhcpSnoopRowStatus, rlIpDhcpSnoopStaticRowStatus` `$repeat?N`, `dhcpBindingTable$endRepeat?N`; scalar `rlIpDhcpSnoopClearAction`. Note: the VT header inputs of this form are not disabled (always posted).
- Filter/search syntax (each term optional, joined `&&`): `binding_database.htm?Filter:((rlIpDhcpSnoopMACAddress=0x"<12hex>")&&(rlIpDhcpSnoopIPAddress=<a.b.c.d>)&&(rlIpDhcpSnoopVLANTag=<vid>)&&(rlIpDhcpSnoopPortInterface=<ifIndex>))`. Validation: unicast MAC, legal non-zero unicast IP, VLAN 1-4093 (hint says 1-4094).
- Add: `GET API/binding_database_a.htm`, `POST API/binding_database_a.htm`:
  - Dynamic: `rlIpDhcpSnoopRowStatus$add=4`, `rlIpDhcpSnoopPortInterface$add=<ifIndex>`, `rlIpDhcpSnoopVLANTag$add=<vid>`, `rlIpDhcpSnoopType$add=2`, `rlIpDhcpSnoopMACAddress$add=<mac as typed XX:XX:..>`, `rlIpDhcpSnoopIPAddress$add`, `rlIpDhcpSnoopLeaseTime$add=<sec>` (omitted when Infinite), `dhcpBindingTable$endAdd=OK`.
  - Static: `rlIpDhcpSnoopStaticRowStatus$add=4`, `rlIpDhcpSnoopStaticVLANTag$add`, `rlIpDhcpSnoopStaticMACAddress$add`, `rlIpDhcpSnoopStaticIPAddress$add`, `rlIpDhcpSnoopStaticPortInterface$add`, `dhcpStaticTable$endAdd=OK` (separate VT `dhcpStaticTable` = rlIpDhcpSnoopStaticTable; no lease time).
- Delete: `POST API/binding_database.htm`: per selected i: `rlIpDhcpSnoopMACAddress$repeat?i`, `rlIpDhcpSnoopVLANTag$repeat?i`, `rlIpDhcpSnoopType$repeat?i` (keys), plus `rlIpDhcpSnoopStaticRowStatus$repeat?i=6` if Type=3 else `rlIpDhcpSnoopRowStatus$repeat?i=6`, `dhcpBindingTable$endRepeat?i=OK`.
- Clear Dynamics: MetaData defines `ClearDynamicEnteries` (enable `rlIpDhcpSnoopClearAction=2`) but views.js calls `Metadata.ClearDynamics` and the button is only created from BtnsFilterPage (which is ["query"]): no working button in classic. Mechanism for new UI: `POST API/binding_database.htm` with `rlIpDhcpSnoopClearAction=2` (inferred).
- Fields:

| field | meaning | values | range | default |
|---|---|---|---|---|
| rlIpDhcpSnoopType | Type | read: 2=Dynamic, 3=Static, other (1)=Learned; add radio Dynamic/Static | | Dynamic |
| rlIpDhcpSnoopMACAddress | MAC Address (key) | read 12-hex | unicast, XX:XX:XX:XX:XX:XX | |
| rlIpDhcpSnoopVLANTag | VLAN ID (key) | dropdown of existing VLANs | | |
| rlIpDhcpSnoopIPAddress | IP Address | IPv4 | | |
| rlIpDhcpSnoopPortInterface | Interface (Port/LAG radio + dropdown) | ifIndex | | |
| rlIpDhcpSnoopLeaseTime | Lease Time (s); Dynamic only | 4294967295 = Infinite | 10-4294967295 | 10 |

- Gotchas: manual entries are not saved in the config file (help); Static vs Dynamic go to different MIB tables and need different delete status fields; delete row indexes are selection order.

---

### DAI Global Settings (classic: Network Administration > Security > Dynamic ARP Inspection (DAI) > Global Settings; help "Global Settings", DynamicARPInspection(DAI)GlobalSettings.html)
Page `arp_inspection_global` (Tags, scalar).
- Read: `GET API/arp_inspection_global.htm` -> `rlIpArpInspectEnable`, `rlIpArpInspectValidation`, `rlIpArpInspectLogInterval` (section `ArpSetting`).
- Write: `POST API/arp_inspection_global.htm` with all three enabled: `rlIpArpInspectEnable`, `rlIpArpInspectValidation`, `rlIpArpInspectLogInterval` (= text value, or 4294967295 for Never).
- Fields: Enable ARP Inspection 1=Enabled 2=Disabled (default 2, inferred); ARP Inspection Validate (src MAC, dst MAC, IP checks) 1/2 (default 2, inferred); Minimal Syslog Interval 0-86400 s or Never=4294967295 (default 5, inferred).

### DAI List (classic: ... > Dynamic ARP Inspection (DAI) > DAI List; help "DAI List", DynamicARPInspection(DAI)DAIList.html)
Page `arp_inspection_list` (Tags). A "list" = all rows of `rlIpArpInspectListTable` sharing a name; UI shows one row per distinct name.
- Read: `GET API/arp_inspection_list.htm` -> VT `ArpInspectionList` rows `rlIpArpInspectListName, rlIpArpInspectListIPAddress, rlIpArpInspectListMACAddress, rlIpArpInspectListRowStatus` `$repeat?N` (+ `String$repeat?N`, `Default$add`).
- Add (create list + first pair): `POST API/arp_inspection_list_a.htm`: `rlIpArpInspectListName$add`, `rlIpArpInspectListIPAddress$add`, `rlIpArpInspectListMACAddress$add`, `String$add=OK`, `Default$add=OK`, `ArpInterface$endAdd=OK` (`rlIpArpInspectListRowStatus$add` not sent).
- Delete list: `POST API/arp_inspection_list.htm`: for every entry i of every selected list: `rlIpArpInspectListName$repeat?i`, `rlIpArpInspectListIPAddress$repeat?i`, `String$repeat?i=OK`, `rlIpArpInspectListRowStatus$repeat?i=6`, `ArpInspectionList$endRepeat?i=OK` (classic also targets nonexistent `Default$add?i`).
- Fields: List Name (1-32, unique among existing names), IP Address (IPv4 unicast), MAC Address (XX:XX:XX:XX:XX:XX).
- Gotchas: deleting a list deletes all its entries (one row each). After add/delete classic re-renders DAI Entries. A list cannot exist empty (inferred).

### DAI Entries (classic: ... > Dynamic ARP Inspection (DAI) > DAI Entries; help "DAI Entries", DynamicARPInspection(DAI)DAIEntries.html)
Page `arp_inspection_list_entries` (Tags; filter dropdown = list name).
- Read: first `GET API/arp_inspection_list_entries.htm` (gives `rlIpArpInspectListName$select` = names), then `GET API/arp_inspection_list_entries.htm?[ArpInterface]Filter:(rlIpArpInspectListName='<name>')` (first name by default). Rows `rlIpArpInspectListName, rlIpArpInspectListIPAddress, rlIpArpInspectListMACAddress, rlIpArpInspectListRowStatus` `$repeat?N`.
- Add: `POST API/arp_inspection_list_entries_a.htm`: `rlIpArpInspectListName$add=<existing list>`, `rlIpArpInspectListIPAddress$add`, `rlIpArpInspectListMACAddress$add`, `String$add=OK`, `Default$add=OK`, `ArpInterface$endAdd=OK` (the _a form's `rlIpArpInspectListName$select` select is not disabled and is also posted).
- Delete: `POST API/arp_inspection_list_entries.htm?...`: per i `String$repeat?i=OK`, `Default$repeat?i=OK`, `rlIpArpInspectListName$repeat?i`, `rlIpArpInspectListIPAddress$repeat?i` (keys), `rlIpArpInspectListRowStatus$repeat?i=6`, `ArpInterface$endRepeat?i=OK`.
- Fields: List Name (dropdown of existing), IP Address (key with name), MAC Address (shown with colons).
- Gotchas: key is (name, IP) — one MAC per IP per list. Deleting the last entry removes the list (inferred).

### DAI VLAN Settings (classic: ... > Dynamic ARP Inspection (DAI) > DAI VLAN Settings; help "DAI VLAN Settings", DynamicARPInspection(DAI)DAIVLANSettings.html)
Page `arp_vlan_settings` (Tags).
- Read: `GET API/arp_vlan_settings.htm` -> VT `arpVlanTable` rows `rlIpArpInspectEnableVlanTag, rlIpArpInspectAssignedListName (hex octets -> Octet2StrReturn), rlIpArpInspectEnableVlanRowStatus` `$repeat?N`.
- Add VLAN (enable DAI on VLAN): `POST API/arp_vlan_settings_a.htm`: `rlIpArpInspectEnableVlanTag$add=<1-4094>`, `rlIpArpInspectEnableVlanRowStatus$add=4`, `arpVlanTable$endAdd=OK`.
- Assign list (edit): `GET API/arp_vlan_settings_bind.htm?[arpVlanTable]Query:rlIpArpInspectEnableVlanTag=<vid>[ArpInterface]Query:rlIpArpInspectListName=` (list names from `rlIpArpInspectListName$select`; if none, dialog read-only). `POST` same URL: `String$query=OK`, `rlIpArpInspectEnableVlanTag$query=<vid>`, `Default$query=OK`, `rlIpArpInspectAssignedListName$query=<list name>`, `arpVlanTable$endQuery=OK` (the non-disabled copies of `String$query`, `rlIpArpInspectAssignedListName$query`, `Default$query`, `arpVlanTable$endQuery` in the bind form are always posted).
- Delete VLAN: `POST API/arp_vlan_settings.htm`: per i `rlIpArpInspectEnableVlanTag$repeat?i=<vid>`, `String$repeat?i=OK`, `rlIpArpInspectEnableVlanRowStatus$repeat?i=6`, `arpVlanTable$endRepeat?i=OK`.
- Fields: VLAN ID 1-4094 (key); List Name (dropdown, no "none" option — unassign only by deleting the VLAN row, inferred).
- Gotchas: two-step (add VLAN, then edit to bind list). Per help, packets not matching the list are checked against the DHCP snooping binding DB if snooping is enabled on that VLAN — so DAI without a static list relies on DHCP Snooping (global + VLAN) bindings.

### DAI Trusted Interfaces (classic: ... > Dynamic ARP Inspection (DAI) > Trusted Interfaces; help "Trusted Interfaces", DynamicARPInspection(DAI)TrustedInterfaces.html)
Page `arp_inspection_trustedInt` (Tags; View By Ports/LAGs).
- Read: `GET API/arp_inspection_trustedInt.htm?[ArpInspectionTrustedInterfaceList]Filter:((ifIndex >= <start>) && (ifIndex < <start+count>))` (ports range from StartingPortPerModuleArr/NumberOfPortPerModuleArr, LAG range from trunkFirstIndex/NumberOfTrunks; classic first loads unfiltered, then re-routes filtered). Rows `ifIndex`, `rlIpArpInspectTrustedPortRowStatus` (VT `ArpInterface` = rlIpArpInspectTrustedPortTable); presence = trusted.
- Read edit: `GET API/arp_inspection_trustedInt_e.htm?Query:ifIndex=<ifIndex>`.
- Write: `POST API/arp_inspection_trustedInt_e.htm?Query:ifIndex=<ifIndex>`:
  - Trust Enabled: `ifIndex$add=<ifIndex>`, `ArpInterface$endAdd=OK` (no row-status sent).
  - Trust Disabled: `ifIndex$query=<ifIndex>`, `rlIpArpInspectTrustedPortRowStatus$query=6`, `ArpInterface$endQuery=OK`.
- Fields: Port/LAG; Trust Status 1=Enabled / 2=Disabled. Default untrusted.
- Gotchas: separate table from DHCP-snooping trust (help text wrongly says it is the DHCP Snooping trust mode) — configure both on uplinks. Different write pattern from trusted_table (`$add` vs `$query`+`$endAdd`).

### IP Source Guard
No UI exists. Grep of the whole classic tree for `source.?guard|ipsg|SrcGuard|rlIpSourceGuard|SRC_Guard` (case-insensitive) finds nothing; only "guard" hits are STP BPDU/root guard. No API template, page JS, menu node or help page. Platform param `SRC_Guard.supported=FALSE`. Do not implement.

---

## 7. Diagnostics, statistics, RMON, routing tables, sFlow, PoE

Sources: `classic/js/Pages/<page>.js`, `classic/API/<page>[_a|_e].htm`, `classic/js/metadata.js`, `classic/js/tree_Items.js`, `classic/documentation/*.html`, `js/views.js`, `js/components/serverManager.js`, `js/components/tabManager.js`, `tpl/tabGraphTemplate.htm`, `polling/projectFunctions.js`.

### Common mechanics (read first)

- **Menu gating** (`tree_Items.js`, `globalParameters.js`):
  - `Conditions.SystemMode.L3Mode = globalParameters.displayRouter`. `polling/projectFunctions.js` sets `displayRouter = true` if hostparam `rlDependendFeaturesEnabled` is empty, otherwise `displayRouter = (value.charAt(0) == '1')`. So L3 means "L2+ / static routing" mode is on.
  - When L3Mode is false, `ipv4_routes_table`, `udp_relay_table`, `ipv6_routes_table`, `router_advertisement` and `ipv6_prefixes` are replaced by `systemModeLinkFunc(node)`. That is a clone of `systemModeLink` (metadata.js:2900) with the same Title and SystemName, `GetDataURI: "ipv4_routes_table.htm"` and `NotEditable`. It renders the text "This feature is not supported beacause <L2+> mode is disabled. To enable <L2+>, click here. This operation will require a system reboot." The link opens System Routing Mode. **`arp_table` is always shown**, because both branches of its ternary are `arp_table`. `ipv6_neighbors` (under Switch Management) is not gated.
  - `Conditions.POE_Supported = globalParameters.poeSupported` (hostparam `poe.supported`) gates the "Power Over Ethernet (POE)" accordion. `Conditions.sflowSupported` (hostparam `sflow.supported`) gates the "sFlow" accordion. **Both are FALSE on the X1018**, so those pages are hidden.
  - `rmon_logs` and `events_table` have `ShowInNav: false`, so `tabManager` hides their tabs. They open only as modals from links on `alarms_table`.
- **Refresh Rate** (`tpl/tabGraphTemplate.htm`): a `<select id="slctRefreshRate_<id>">` with options `0` No Refresh, `15` 15 sec, `30` 30 sec, `60` 60 sec. `TabManager.SetLoadInterval(sec)` re-runs the page's GET every N seconds while that tab is current. The default is No Refresh. Pages that have it: stat_etherlike, rmon_stats, sum_utilize, cpu_utilization_chart.
- **Table/Graph toggle**: stat_etherlike and rmon_stats have a "Tabular"/"Graphical" toggle and a measure dropdown. The graph is a flot bar chart: x = interface, y = the selected counter (y max is at least 10).
- **"Reset All Counters" button** (`resetCounter`, astutetablegenerator.js:616): calls `MetaData.ResetCounter()` and wcd-POSTs the result to the page's `GetDataURI`.
- **wcd POST XHR**: timeout 3000 ms and synchronous. On a transport error with no `node.OnPostError`, the classic UI calls `logoff()`.
- **json2xml gotcha**: a JS **number** value serialises to an empty element. `json2xml_rec(5)` iterates `for (f in 5)` and produces nothing, so `<interfaceType></interfaceType>`. Only strings are emitted. ARP Add hits this.
- **Tags edit read URI**: `GetEditDataURI.replace("(&query)", "Query:<col>=<val>@<col2>=<val2>")`. Column names have their `$...` suffix stripped. Values are raw (not URL-encoded). When there are multiple key sections, each is prefixed by `[section]`.
- **Tags POST target**: the URI before `?`. Body = `$("form",".divData").serialize()` with `+` changed to `%2B`. That is **every enabled input** of the fetched template. Inputs in `_e.htm` templates that have no `disabled` attribute are therefore always sent with their server-provided values.
- **Remove pattern for Tags tables (RMON tables)**: for the k-th selected row (k = 1..n, counting **selected rows, not table row numbers**), the page enables `<Pkey>$repeat?k = <key value>`, `<status>$repeat?k = 4` (or `6` for RowStatus tables) and `<Table>$endRepeat?k = OK`.

---

### Integrated Cable Test (classic: Statistics and Diagnostics > Diagnostics > Integrated Cable Test; help "Integrated Cable Test", DiagnosticsIntegratedCableTest.html)

- **Read:** `GET wcd?{CableTestPortList}`. Bulk list with one Entry per (port, testType).
  - Entry fields: `interfaceName, testType, status, resultVal, resultUnits, alarmLevel, testDate`.
  - The UI groups entries by `interfaceName`. Fields `status`, `resultUnits` and `alarmLevel` are read but not shown.
- **Start a test (per port):** each row has a "Test" link that calls `integrated_cable_test.Test('<interfaceName>')`.
  - `POST wcd?{CableTestPortList}` with body:
    `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration><CableTestPortList action="set"><Entry><interfaceName>gi1/0/3</interfaceName><testType>2</testType></Entry></CableTestPortList></DeviceConfiguration>`
  - The POST is **synchronous**. The UI does not poll. As soon as the POST returns, it does one `GET wcd?{CableTestPortList&interfaceName=gi1/0/3}`. The classic code leaves the name un-encoded; encode `/` as `%2F` to be safe.
  - Success is `ActionStatus/statusCode == 0`. The UI then shows a dialog: "Successfully completed Integrated Cable Test: Port / Test Result / Cable Fault Distance / Last Update / Approximate Cable Length".
  - On failure (statusCode != 0) it shows "Unable to run Integrated Cable Test for <port>. Recommended Response Action: Make sure an optical cable is plugged in the switch and in the node." The text says "optical" but this is a copy-paste error.
  - Duration: the test must finish inside the classic 3 s XHR timeout, otherwise the classic UI logs off. That implies the switch completes the TDR test inside the POST (inferred). A new UI should allow a longer timeout, around 10–15 s, and should not log off on timeout.
- **Result interpretation by testType** (names inferred from the RADLAN rlPhyTest MIB and the JS usage):

| testType | meaning | resultVal → label |
|---|---|---|
| 2 | cable status / "Test Result" | 1 Four Pair Cable, 2 Two Pair Cable (both = OK), 3 No Cable, 4 Open Cable, 5 Short Cable, 6 Bad Cable, 7 Impedance Mismatch, other "Uknown Result" (missing → "Uknown Test Result") |
| 3 | cable fault distance | displayed as `resultVal + ' M'` (metres) |
| 4 | approximate cable length | 1 "Less than 50m", 2 "Between 50-80m", 3 "Between 80-110m", 4 "Between 110-140m", 5 "More than 140m"; missing → "Unknown length" |
| any other | the UI takes `testDate` from it as "Last Update" (last such entry wins) | |

- `testDate` format: `DDMMYYYY HH:MM:SS`, parsed from the first 8 characters. Displayed as `DD-Mon-YYYY HH:MM:SS`. The month names include "June"/"July".
- **Table columns:** Port, Test Result, Cable Fault Distance, Last Update, Cable Length.
- **Gotchas (from help):**
  - TDR works on copper only, cables up to 120 m.
  - The port must be **down** for the cable test. The exception is the approximate cable length, which requires the link up at 1 Gbps.
  - Help mentions a "Optical Transceiver Qualification" column that the JS does not render.

### Optical Transceiver Diagnostics (classic: Statistics and Diagnostics > Diagnostics > Optical Transceiver Diagnostics; help DiagnosticsOpticalTransceiverDiagnostics.html)

- **Read:** `GET wcd?{Standard802_3List&interfaceType=1}{CableTestPortList}`. Read-only; no writes are used, even though SetDataURI is `wcd?{CableTestPortList}`.
- **Row selection:** a port appears only if its `Standard802_3List.mediaType` is `2` (Fiber) or `4` (ComboF) and it has at least one CableTestPortList entry.
  - mediaType values: 1 copper, 2 Fiber, 3 ComboC, 4 ComboF (from PortConfiguration.js).
- **Columns, from CableTestPortList entries by testType.** Any missing cell shows "N/A".

| testType | column | conversion |
|---|---|---|
| 25 | Transceiver Qualification | 1 "Dell Qualified Transceiver", 2 "Generic Unqualified Transceiver", else N/A |
| 5 | Temperature (in C) | raw |
| 6 | Voltage (in V) | resultVal / 1,000,000 (µV → V) |
| 7 | Current (in mA) | resultVal / 1000 (µA → mA) |
| 8 | Output Power (in mW) | 10^((resultVal/1000)/10) (resultVal is milli-dBm → mW) |
| 9 | Input Power (in mW) | same as 8 |
| 12 | Transmitter Fault | classic: `resultVal ? 'False' : 'True'` |
| 11 | Loss of Signal | `resultVal == 0 ? 'False' : 'True'` |
| 10 | Data Ready | classic: `resultVal ? 'False' : 'True'` |

- **Gotchas:**
  - Classic truncates numbers to 2 decimals with `substring(0, indexOf('.')+3)`. When the value has no `.`, this keeps only the first 2 characters (bug). A new UI should use toFixed.
  - Data Ready and Tx Fault use JS truthiness on a string, so "0" and "1" both display False (bug). The probable correct mapping is 1/non-zero = True, as with LOS (inferred).
  - Help lists Tx Fault values as True / False / No Signal (N/S).
  - Values are only meaningful for SFF-8472 DDM-capable SFPs.

### Identify (classic: Statistics and Diagnostics > Diagnostics > Identify; help DiagnosticsIdentify.html)

- **Read:** `GET API/diagnostics_identify.htm` (Tags). Hidden inputs: `rlPhdPhyLedTimeout$scalar`, `rlPhdPhyLedStackUnit$scalar`, `restoreUrl`, `errorCollector`, `mibError`.
- **Write:** `POST API/diagnostics_identify.htm` with `rlPhdPhyLedStackUnit$scalar=1&rlPhdPhyLedTimeout$scalar=<sec>`, plus the enabled `restoreUrl` / `errorCollector`. There is no terminator.
- **UI:**
  - Checkbox "Identify Switch" (not bound to data). Checking it enables the timeout box and the Apply button.
  - Text "Identify Switch LED Timeout (sec)", Integer 0–255. Its initial value comes from `rlPhdPhyLedTimeout$scalar`.
  - If the box is unchecked, nothing is sent.
- **Gotchas:**
  - Fire-and-forget: the LED blinks for `timeout` seconds.
  - The page is not gated in the tree, even though platform `LED.supported` is FALSE. Whether the X1018 has a locator LED is unverified (inferred).
  - metadata has `GetDataURI` twice and no SetDataURI. Posting goes to `diagnostics_identify.htm`.

### Interface Counters (classic: Statistics and Diagnostics > Statistics > Interface Counters; help StatisticsInterfaceCounters.html)

- **Read:**
  - Ports: `GET wcd?{StatisticsList&interfaceType=1}{Standard802_3List&interfaceType=1}`.
  - LAGs ("View By" = LAGs): `wcd?{StatisticsList&interfaceType=2}{Standard802_3List&interfaceType=2}`.
- **No writes.** There is no clear button and no refresh-rate control (`refreshrate: 0`).
- **StatisticsList Entry fields:** `interfaceName, interfaceType, interfaceID`, plus the counters below. Counters are cumulative since the last clear or boot.

| field | column | unit |
|---|---|---|
| receivePacketByteCount | Total Bytes (Octets) Received | bytes |
| receiveUnicastPacketCount | Unicast Packets Received | pkts |
| receiveMulticastPacketCount | Multicast Packet Received | pkts |
| receiveBroadcastPacketCount | Broadcast Packet Received | pkts |
| packetErrorCount | Error Received | pkts |
| transmitPacketByteCount | Total Bytes (Octets) Transmitted | bytes |
| transmitUnicastPacketCount | Unicast Packets Transmitted | pkts |
| transmitMulticastPacketCount | Multicast Packet Transmitted | pkts |
| transmitBroadcastPacketCount | Broadcast Packet Transmitted | pkts |

- **Interface Status:**
  - Ports: `Standard802_3List.linkState` 1 Up, 2 Down, 6 Not present.
  - LAGs: the client-side `portsStatusArr[interfaceID]`, from the global poller.
- **Gotcha:** clearing is done from Etherlike or RMON Statistics. `GlobalStatisticsSetting/clearInterfaceStatistics=1` clears all interface counters (inferred to affect this page too).

### Etherlike Statistics (classic: Statistics and Diagnostics > Statistics > Etherlike Statistics; help StatisticsEtherlikeStatistics.html)

- **Read:**
  - Initial: `GET wcd?{EtherlikeStatisticsList&interfaceType=1}`.
  - After the View By filter is changed: `GET wcd?{EtherlikeStatisticsList}` (all types). Rows are filtered client-side: `interfaceType == "1"` for Ports, `"2"` for LAGs.
- **Reset All Counters:** `POST wcd?{EtherlikeStatisticsList&interfaceType=1}` with
  `<DeviceConfiguration><GlobalStatisticsSetting action="set"><clearInterfaceStatistics>1</clearInterfaceStatistics></GlobalStatisticsSetting></DeviceConfiguration>`
  This is global, for all interfaces.
- **Fields** (Entry: `interfaceName, interfaceType, interfaceID`, plus):

| field | column | meaning (help) |
|---|---|---|
| frameCheckSequenceErrorCount | Frame Check Sequence (FCS) Errors | frames failing FCS (default graph measure) |
| singleCollisionFrameCount | Single Collision Frames | |
| lateCollisionCount | Late Collisions | collisions after 512 bits |
| excessiveCollisionCount | Excessive Collisions | (not in help) |
| internalMACReceiveErrorCount | "Internal MAC Transmit Errors" | classic labels a Receive counter as Transmit; help text describes receive |
| oversizePacketCount | Oversized Packets | |
| receivePauseFrameCount | Received Pause Frames | |
| transmitPauseFrameCount | Transmitted Pause Frames | |

- Has Refresh Rate and the Table/Graph toggle.

### Utilization Summary (classic: Statistics and Diagnostics > Statistics > Utilization Summary; help StatisticsUtilizationSummary.html)

- **Read (Tags, two-step):**
  1. `GET API/sum_utilize.htm`. If `restoreUrl` comes back empty, the UI immediately re-GETs with a filter:
  2. `GET API/sum_utilize.htm?[sumCounterTable]Filter:((ifIndex >= S) && (ifIndex < S+N))`.
     - Ports: S = `StartingPortPerModuleArr[firstPresentModule]`, N = ports in that module.
     - LAGs: S = `trunkFirstIndex`, N = `NumberOfTrunks`.
     - The literal spaces are URL-encoded by the browser.
- **Template inputs:**
  - Scalar: `sysUpTime$scalar` (in 1/100 s).
  - Per row: `ifIndex, rlPhdPortsIfIndexName, rlPhdPortsModuleNumber, ifOperStatus, ifInOctets, ifOutOctets, ifInUcastPkts, ifOutUcastPkts, ifInNUcastPkts, ifOutNUcastPkts, ifInErrors, ifOutErrors, ifSpeed, ifHCInOctets, ifHCOutOctets, ifHighSpeed` (`$repeat?N`).
  - serverManager rewrites `ifSpeed$repeat?=10` to 10000000000, i.e. 10 G, because ifSpeed saturates.
- **No writes.**
- **Columns:** Interface (ifIndex → name), Interface Status, % Interface Utilization, % Unicast Received, % Non Unicast Packets Received, % Error Packets Received.
  - `ifOperStatus` labels: 1 Up, 2 Down, 3 Testing, 4 Unknown, 5 Dormant, 6 Not Present, 7 Lower Layer Down, else "Bad Value".
- **Computation (client-side deltas between successive polls):**
  - Δ is taken per counter. dt = Δ`sysUpTime` × 0.01 s.
  - octets = (ΔHCInOctets + ΔHCOutOctets) / 2.
  - pkts = (ΔInUcast + ΔOutUcast + ΔInNUcast + ΔOutNUcast) / 2.
  - bits = pkts × 160 + octets × 8. The 160 bits cover the preamble and inter-frame gap.
  - util% = ceil(bits / (ifSpeed × dt) × 100 × 100) / 100, clamped to 0..100.
  - Shows "---" in these cases: first load, oper status not Up, ifSpeed 0, refresh rate 0, or any negative delta.
  - %Unicast = ΔInUcast / (ΔInUcast + ΔInNUcast), falling back to the Out counters when In is 0. %NonUnicast is the same with NUcast. %Errors = ΔInErrors / (ΔInUcast + ΔInNUcast + ΔInErrors). All are rounded integers.
- **Gotchas:**
  - Needs a Refresh Rate other than 0, otherwise every percentage is "---".
  - Classic masks a negative HC-octet delta with `&0x7FFFFFFF` (a wrap bug). Use 64-bit wrap-safe arithmetic.
  - Help text wrongly describes the CPU Utilization page.

### RMON Statistics (classic: Statistics and Diagnostics > Monitoring (RMON) > Statistics; help Monitoring(RMON)Statistics.html)

- **Read:**
  - Initial: `GET wcd?{RMONStatistics&interfaceType=1}`.
  - After View By changes: `wcd?{RMONStatistics}`, with client-side filtering on `interfaceType` (1 Ports, 2 LAGs).
  - The XML is a container `RMONStatistics` that holds section `InterfaceStatisticsList` (dataSource `container: "RMONStatistics"`).
- **Reset All Counters:** `POST wcd?{RMONStatistics&interfaceType=1}`, body `<GlobalStatisticsSetting action="set"><clearInterfaceStatistics>1</clearInterfaceStatistics></GlobalStatisticsSetting>`. Same as Etherlike; global.
- **Fields** (Entry: `interfaceName, interfaceType, interfaceID`, plus). Counts are since the last clear.

| field | column |
|---|---|
| receivePacketByteCount | Received Bytes (Octets) (default graph measure "Received Byte (Octets)") |
| receivePacketCount | Received Packets |
| receiveBroadcastPacketCount | Broadcast Packets Received |
| receiveMulticastPacketCount | Multicast Packets Received |
| CRCAlignErrorCount | CRC Align Error (64–1518 B with bad FCS/alignment) |
| undersizePacketCount | Undersized Packets (<64 B, well-formed) |
| oversizePacketCount | Oversized Packets (>1518 B, well-formed) |
| dropEventCount | (read, not shown) |
| fragmentCount | Fragments |
| jabberCount | Jabbers |
| collisionCount | Collisions |
| frameOf64BytesCount | Frames of 64 Bytes |
| frameOf65To127BytesCount | Frames of 65 to 127 Bytes |
| frameOf128To255BytesCount | Frames of 128 to 255 Bytes |
| frameOf256To511BytesCount | Frames of 256 to 511 Bytes |
| frameOf512To1023BytesCount | Frames of 512 to 1023 Bytes |
| frameOf1024To1518BytesCount | Frames of 1024 to MAX Octets |

- Has Refresh Rate and the Table/Graph toggle.

### CPU Utilization (classic: Statistics and Diagnostics > Monitoring (RMON) > CPU Utilization; help Monitoring(RMON)CPUUtilization.html)

- **Read:** `GET API/cpu_utilization_chart.htm`. One hidden input, `rlCpuUtilDuringLastSecond`. It has no `$scalar` suffix and is read-only. Value = CPU % over the last second (0–100).
- **No writes.** There is no enable/disable control and no interval setting in this firmware's UI. Help mentions "Reset Counters", but no such button exists.
- **Polling:** only via Refresh Rate (0 / 15 / 30 / 60 s). Each poll appends one sample to a client-side ring of **20 points**. The chart is a flot line, x "Samples (Seconds)" 0–20, y "Percent of Utilization" 0–100, step 10.
  - With No Refresh you see a single point.
  - `resetLocalData: true` clears the history when the page is re-entered (inferred).
- **Gotcha:** the x-axis label says seconds, but the spacing is the refresh rate (≥15 s). A new UI can poll faster, for example every 1–5 s; the endpoint is cheap (inferred).

### History Control (classic: Statistics and Diagnostics > Monitoring (RMON) > History Control; help Monitoring(RMON)HistoryControl.html)

- **Read:** `GET API/history_control_table.htm`.
  - Rows `historyControlIndex, historyControlDataSource, historyControlInterval, historyControlBucketsRequested, historyControlBucketsGranted, historyControlOwner, historyControlStatus` (`$repeat?N`).
  - Plus `String$select`, `Default$select`, `His_Control_Tab$endRepeat?N`.
  - `historyControlDataSource` is an OID `1.3.6.1.2.1.2.2.1.1.<ifIndex>`. The display takes the last arc and maps ifIndex to an interface name.
- **Columns:** History Entry, Interface, Sampling Interval, Sampling Requested, Current Number of Samples (= BucketsGranted), Owner.
- **Add:** GET `API/history_control_table_a.htm` (no query), then POST to the same URL with these enabled fields:
  `historyControlIndex$add=<next free index>`, `historyControlDataSource$add=1.3.6.1.2.1.2.2.1.1.<ifIndex>`, `historyControlInterval$add=<1-3600, default 1800>`, `historyControlBucketsRequested$add=<1-50, default 50>`, `String$select=OK`, `historyControlOwner$query=<0-160 chars>` (note: the `$query` name is used in the add form), `Default$select=OK`, `historyControlStatus$add=2` (createRequest), `His_Control_Tab$endAdd=OK`.
  - Next free index = the first gap in 1, 2, 3, … over existing indices.
  - Interface Type radio Port/LAG chooses the interface dropdown (values are ifIndex).
- **Edit:** `GET API/history_control_table_e.htm?Query:historyControlIndex=<n>`, then `POST API/history_control_table_e.htm`.
  - None of the `_e` inputs are disabled, so all are sent: `His_Control_Tab$query, historyControlIndex$query, historyControlDataSource$query, String$select, historyControlOwner$query, Default$select, historyControlBucketsRequested$query, historyControlBucketsGranted$query, historyControlInterval$query, historyControlStatus$query, His_Control_Tab$endQuery`, plus the `$VT` inputs.
  - Edited values are overwritten in place. `historyControlDataSource$query` gets the `1.3.6.1.2.1.2.2.1.1.` prefix added.
  - The JS also sets `historyControlStatus$add`/`His_Control_Tab$endAdd`, but those do not exist in `_e`, so it is a no-op.
  - Editable: Interface, Sampling Interval (1–3600), Max Samples (1–50), Owner (0–160). Current Number of Samples is display-only.
- **Delete:** `POST API/history_control_table.htm` with `historyControlIndex$repeat?k=<idx>&historyControlStatus$repeat?k=4&His_Control_Tab$endRepeat?k=OK`, for k = 1..n selected.
- **Gotcha:** RMON EntryStatus values: 1 valid, 2 createRequest, 4 invalid (delete).

### History Table (classic: Statistics and Diagnostics > Monitoring (RMON) > History Table; help Monitoring(RMON)HistoryTable.html)

- **Read (two-step):**
  1. `GET API/history_ether.htm`. This returns the select `historyControlIndex$select` (options = existing control indexes).
  2. If `restoreUrl` is empty, the UI re-GETs `API/history_ether.htm?[His_Control_Tab]Query:historyControlIndex=<idx>[Hist_Ether_Tab]Filter:(etherHistoryIndex=<idx>)` for the first index. "View By" picks another idx.
- **Row fields** (`$repeat?N`): `etherHistoryIndex, etherHistorySampleIndex, etherHistoryDropEvents, etherHistoryOctets, etherHistoryPkts, etherHistoryBroadcastPkts, etherHistoryMulticastPkts, etherHistoryCRCAlignErrors, etherHistoryUndersizePkts, etherHistoryOversizePkts, etherHistoryFragments, etherHistoryJabbers, etherHistoryCollisions, etherHistoryUtilization`.
  - `etherHistoryIntervalStart` exists in the VT but is not repeated.
- **Columns:** Sample Number, Dropped Events, Received Bytes (Octets), Received Packets, Broadcast Packets, Multicast Packets, CRC Align Errors, Undersized Packets, Oversize Packets, Fragments, Jabbers, Collisions, Utilization.
- **Utilization:** raw value is in hundredths of a percent. Display = value / 100; any non-zero value below 1 shows as 1.
- Values are per-sample deltas over the control entry's interval (RMON semantics).
- **No writes.** If no control entries exist, the table is empty.

### Threshold and Events / Alarms (classic: Statistics and Diagnostics > Monitoring (RMON) > Threshold and Events; help Monitoring(RMON)ThresholdandEvents.html)

- **Read:** `GET API/alarms_table.htm`.
  - Alarm rows `alarmIndex, alarmVariable, alarmValue, alarmSampleType, alarmRisingThreshold, alarmRisingEventIndex, alarmFallingThreshold, alarmFallingEventIndex, alarmStartupAlarm, alarmInterval, String, alarmOwner, Default, alarmStatus` (`$repeat?N`), plus `alarmsTable$endRepeat?N`.
  - Event list (second repeat group, `$repeat1?N`): `eventIndex, eventDescription`, used to label events as "idx - description".
- **Links above the table:**
  - "Configure Events Control" opens `events_table` in a modal.
  - "Events Log" opens `rmon_logs` in a modal.
- **Columns:** Entry, Interface, Counter Name, Counter Value (`alarmValue`), Sample Type, Rising Threshold, Rising Event, Falling Threshold, Falling Event, Startup Event, Owner.
- **alarmVariable** = `<counterOID>.<ifIndex>`. Counter Name is found by stripping the last arc and looking it up in the 48-entry table (`metadata.js alarms_table.AlarmsObjIdArr` / `AlarmsNamesArr`):
  - ifTable `1.3.6.1.2.1.2.2.1.{10,11,16,17}` and ifXTable `1.3.6.1.2.1.31.1.1.1.{2,3,4,5}`: Rx/Tx octets, ucast, mcast, bcast.
  - dot3Stats `1.3.6.1.2.1.10.7.2.1.{3,4,8,13,16}`: FCS, Single Collision, Late Collisions, Oversize, Internal MAC Rx Err.
  - dot3Pause `1.3.6.1.2.1.10.7.10.1.{3,4}`: Rx / Tx pause.
  - GVRP `1.3.6.1.4.1.89.64.4.1.{1..12}`: Join Empty/Empty/Leave Empty/Join In/Leave In/Leave All Rx/Tx.
  - `1.3.6.1.4.1.89.64.5.1.{1,2,3,5,6}`: Invalid Protocol ID / Attribute Type / Value / Length / Event.
  - RMON etherStats `1.3.6.1.2.1.16.1.1.1.{4..19}`: octets, pkts, bcast, mcast, CRC/Align, undersize, oversize, fragments, jabbers, collisions, 64 / 65–127 / 128–255 / 256–511 / 512–1023 / 1024–max frames.
  - Copy the exact arrays from metadata.js; they are in our meta_scope.txt.
- **Enums:**
  - `alarmSampleType`: 1 Absolute, 2 Delta.
  - `alarmStartupAlarm`: 1 Rising Alarm, 2 Falling Alarm, 3 Rising and Falling.
- **Add:** GET `API/alarms_table_a.htm`, then POST `API/alarms_table_a.htm` with these enabled fields:
  `alarmIndex$add=<next free>`, `alarmVariable$add=<OID>.<ifIndex>`, `alarmSampleType$add` (default 1), `alarmRisingThreshold$add` (0–2147483647, default 100), `alarmRisingEventIndex$add`, `alarmFallingThreshold$add` (0–2147483647, default 20), `alarmFallingEventIndex$add`, `alarmStartupAlarm$add` (default 3), `alarmInterval$add` (seconds, 0–2147483647, default 100), `String$add=OK`, `alarmOwner$add` (0–160), `Default$add=OK`, `alarmStatus$add=2`, `alarmsTable$endAdd=OK`.
  - Validation: at least one event must exist. Otherwise the alert says "You need to select a Rising Event ... define a new event in the Events screens".
- **Edit:** `GET API/alarms_table_e.htm?Query:alarmIndex=<n>`, then `POST API/alarms_table_e.htm`.
  - The `$query` inputs are not disabled, so all are sent: `alarmsTable$query, alarmIndex$query, alarmVariable$query, alarmSampleType$query, alarmRisingThreshold$query, alarmRisingEventIndex$query, alarmFallingThreshold$query, alarmFallingEventIndex$query, alarmStartupAlarm$query, alarmInterval$query, String$query=OK, alarmOwner$query, Default$query=OK, alarmStatus$query=1, alarmsTable$endQuery=OK`.
  - All fields are editable, including interface and counter.
- **Delete:** `POST API/alarms_table.htm` with `alarmIndex$repeat?k=<idx>&alarmStatus$repeat?k=4&alarmsTable$endRepeat?k=OK`.

### Events Control (classic: modal from Threshold and Events > "Configure Events Control"; title "Configure Events Control", Add "Add Events Control", Edit "Edit Events Control")

- **Read:** `GET API/events_table.htm`.
  - Scalars `sysUpTime`, `rndManagedTime` (HHMMSS), `rndManagedDate` (DDMMYY).
  - Rows `eventIndex, String$communityrepeat, eventCommunity, Default$communityrepeat, eventDescription, eventType, eventLastTimeSent, String$communityrepeat1, eventOwner, Default$communityrepeat1, eventStatus` (`$repeat?N`), plus `eventsTable$endRepeat?N`.
- **Columns:** Event Entry, Community, Event Type, Date and Time, Owner, Description.
  - `eventType`: 1 None, 2 Log, 3 Trap(s), 4 Log and Trap.
  - Date and Time: `eventLastTimeSent` is in sysUpTime ticks (1/100 s). time = (rndManagedDate + rndManagedTime) − sysUpTime×10 ms + ticks×10 ms (`ticksToDateAndTime`, globalFunctions.js:951). 0 means blank. Two-digit years: 70–99 → 19xx, else 20xx.
- **Add:** POST `API/events_table_a.htm` with:
  `eventIndex$add=<next free>`, `String$communityadd=OK`, `eventCommunity$add` (0–127, default "Default Community"), `Default$communityadd=OK`, `eventType$add` (default 1), `String$owneradd=OK`, `eventOwner$add` (0–160), `Default$owneradd=OK`, `eventDescription$add` (0–127, default "Default Description"), `eventStatus$add=2`, `eventsTable$endAdd=OK`.
  - Classic sets the two community wrappers via `Util.getControlData("OK")`, which yields an empty value (bug). Send `OK`.
- **Edit:** `GET API/events_table_e.htm?Query:eventIndex=<n>`, then POST `API/events_table_e.htm` with enabled:
  `eventIndex$query`, edited fields (`eventCommunity$query`, `eventType$query`, `eventOwner$query`, `eventDescription$query`), `String$communityquery=OK`, `Default$communityquery=OK`, `String$descriptionquery=OK`, `Default$descriptionquery=OK`, `String$ownerquery=OK`, `Default$ownerquery=OK`, `eventStatus$query=1`, `eventTable$endQuery=OK`.
  - In `_e` the section name is `eventTable`, not `eventsTable`. Date and Time is display-only.
- **Delete:** POST `API/events_table.htm` with `eventIndex$repeat?k=<idx>`, `eventStatus$repeat?k=4`, and a terminator.
  - Classic sets `eventTable$endRepeat?k=OK`, but the template input is named **`eventsTable$endRepeat?k`**, so classic sends no terminator (likely broken). Send `eventsTable$endRepeat?k=OK` (inferred).
- **Gotcha:** deleting an event that an alarm references is not prevented client-side.

### Events Log (classic: modal from Threshold and Events > "Events Log"; title "Events Log")

- **Read:** `GET API/rmon_logs.htm`.
  - Scalars `sysUpTime, rndManagedTime, rndManagedDate`.
  - Rows `logEventIndex, logIndex, logTime, logDescription` (`$repeat?N`).
- **Columns:** Event Number, Log Number, Date and Time (`logTime` ticks converted as for events), Description.
- **Read-only.** There is no clear action.

### sFlow Receivers Settings — UNSUPPORTED on X1018 (classic: Network Administration > sFlow > sFlow Receivers Settings; help sFlowsFlowReceiversSettings.html)

- **Read:** `GET API/sflow_receivers_settings.htm`.
  - Rows `sFlowRcvrIndex, sFlowRcvrAddress, sFlowRcvrPort, sFlowRcvrMaximumDatagramSize, sFlowRcvrOwner, sFlowRcvrTimeout` (`$repeat?N`, where N = receiver index), plus `sFlowRcvrVT$endRepeat?N`.
  - A row counts as configured when Owner is not empty/blank and Timeout != 0.
- **Add:** POST the same page, enabling for the chosen index i: `sFlowRcvrIndex$repeat?i`, `sFlowRcvrAddress$repeat?i`, `sFlowRcvrPort$repeat?i` (1–65535, default 6343), `sFlowRcvrMaximumDatagramSize$repeat?i` (0–2147483647, default 1400), `sFlowRcvrOwner$repeat?i=6c6f63616c` (hex "local"), `sFlowRcvrTimeout$repeat?i=2147483647`.
  - Classic does not enable `sFlowRcvrVT$endRepeat?i` (possible bug).
- **Delete:** `sFlowRcvrOwner$repeat?i=` (empty), `sFlowRcvrTimeout$repeat?i=0`, `sFlowRcvrVT$endRepeat?i=OK`.
  - Classic uses `configuredFieldArray[k]` instead of the selected key, so it deletes the wrong receiver (bug).

### sFlow Interface Settings — UNSUPPORTED (classic: Network Administration > sFlow > sFlow Interface Settings)

- **Read:** `GET API/sflow_interface_settings.htm`.
  - `sFlowFsTable` rows: `sFlowFsDataSource, sFlowFsInstance, sFlowFsReceiver, sFlowFsPacketSamplingRate, sFlowFsMaximumHeaderSize`.
  - `sFlowCpTable` rows: `sFlowCpDataSource, sFlowCpInstance, sFlowCpReceiver, sFlowCpInterval`.
  - `sFlowRcvrTable` rows: `sFlowRcvrIndex, sFlowRcvrOwner, sFlowRcvrTimeout`.
  - Row index = ifIndex. DataSource OID ends with the ifIndex.
- **Columns:** Interface; Flow Sampling Rate ("1/N", or "Disabled" if 0); Max Header Size; Counters Interval (sec, or "Disabled"); Receiver Index Sampling / Counters ("-" if 0).
- **Add (index = ifIndex i):**
  - Always enabled: `sFlowFsDataSource$repeat?i`, `sFlowCpDataSource$repeat?i`, `sFlowFsInstance$repeat?i`, `sFlowCpInstance$repeat?i`.
  - Flow sampling enabled: `sFlowFsPacketSamplingRate` (1024–1073741823), `sFlowFsReceiver`, `sFlowFsMaximumHeaderSize` (20–256, default 128). When disabled: rate=0, receiver=0.
  - Counter sampling enabled: `sFlowCpInterval` (15–86400), `sFlowCpReceiver`. When disabled: both 0.
  - At least one sampling type must be enabled, and a receiver must exist.
- **Delete:** enable `sFlowFs{DataSource,Instance}`, set `sFlowFsReceiver=0`, `sFlowFsTableVT$endRepeat?i`; the same for `sFlowCp*` / `sFlowCpTableVT$endRepeat?i`.

### sFlow Statistics — UNSUPPORTED (classic: Network Administration > sFlow > sFlow Statistics)

- **Read:** `GET API/sflow_statistics.htm`.
  - `rlsFlowStatisticsTable` rows: `rlsFlowDataSource, rlsFlowStatisticsSampledPackets, rlsFlowStatisticsDatagramSent`.
  - Plus `sFlowFsTable` / `sFlowCpTable` receiver columns. Rows are shown only where a Fs or Cp receiver != 0.
  - Columns: Interface, Packets Sampled, Datagrams Sent To Receiver.
- **Clear:** POST `API/sflow_statistics.htm` with `rlsFlowStatisticsReset$scalar=2`.

### ARP Table (classic: Network Administration > Route Settings > IPv4 Route Settings > ARP Table; help IPv4RouteSettingsARP.html; always visible)

- **Read:** `GET wcd?{ARPList}{ARPGlobalSetting}`.
  - `ARPList` entries: `interfaceID` (ifIndex), `interfaceType`, `interfaceName`, `IPAddress`, `physicalAddress`, `status`.
  - `ARPGlobalSetting`: `timeout`, `deleteTableType`.
- **Edit read:** `GET wcd?{ARPList&interfaceID=..&interfaceType=..&IPAddress=..&physicalAddress=..&interfaceName=..}{ARPGlobalSetting}` (values encodeURIComponent'd).
- **Columns:** Interface, IP Address, MAC Address, Status. `status`: 1 Other, 2 Invalid, 3 Dynamic, 4 Static.
- **Add (static):** POST `wcd?{ARPList}{ARPGlobalSetting}` with
  `<ARPList action="set"><ARPEntry><interfaceID>ifIndex</interfaceID><interfaceType>(1 Port|2 LAG|3 VLAN)</interfaceType><interfaceName>name with first space removed, e.g. VLAN1</interfaceName><IPAddress>a.b.c.d</IPAddress><physicalAddress>xx:xx:xx:xx:xx:xx</physicalAddress><status>4</status></ARPEntry></ARPList>`
  - Classic passes interfaceType as a JS number, so it goes out as an **empty element**. Send the string.
  - The action is `set`, not `add`.
- **Edit:** `<ARPList action="set"><ARPEntry>` with interfaceID, interfaceType, interfaceName and IPAddress taken from the edit read, `physicalAddress` (editable, MAC), and `status` (3 Dynamic / 4 Static).
  - The Status radio is disabled when the entry is already Static (4). Only dynamic → static is possible.
- **Delete:** `<ARPList action="delete"><ARPEntry><interfaceID/><interfaceType/><IPAddress/><physicalAddress/><interfaceName/></ARPEntry>...</ARPList>`, one ARPEntry per selected row with all 5 keys as read.
- **Settings** (gear button, "ARP Global Settings"): POST `<ARPGlobalSetting action="set"><timeout>1-40000000</timeout><deleteTableType>0|1|2|3</deleteTableType></ARPGlobalSetting>`.
  - `timeout` is the ARP Entry Age Out in seconds. The default is not in the sources.
  - `deleteTableType` is a one-shot "Clear ARP Table Entries" action: 0 No Action, 1 All, 2 Dynamic, 3 Static.
  - Note `SaveSettings` builds `set` as an object, not an array; json2xml handles both.
- **Gotcha:** capacity per help: X1018 in L2 holds about 1K entries; in L2+ only 128.

### IPv4 Routes Table (classic: Network Administration > Route Settings > IPv4 Route Settings > IPv4 Routes Table; help IPv4RouteSettingsIPv4RoutesTable.html; L3Mode only, else systemModeLink)

- **Read:** `GET API/ipv4_routes_table.htm`.
  - `ipCidrRouteTable` rows (the full FIB): `ipCidrRouteDest, ipCidrRouteMask, ipCidrRouteTos, ipCidrRouteNextHop, ipCidrRouteType, ipCidrRouteProto, ipCidrRouteMetric1`.
  - `rlInetStaticRouteTable` rows (static config): `rlInetStaticRouteDest, rlInetStaticRoutePfxLen, rlInetStaticRouteNextHop, rlInetStaticRouteIfIndex, rlInetStaticRouteType, rlInetStaticRouteOwner, rlInetStaticRoutePathCost, rlInetStaticRouteRowStatus`, plus `rlInetStaticRouteRowStatus$default`.
  - Terminators: `IP_Cidr_Route_Table$endRepeat?N`, `IP_Route_Table$endRepeat?N`, `IP_Route_Table$default`.
- **Columns** (from ipCidrRouteTable):
  - Destination IPv4 Prefix.
  - Prefix Length (mask → bits).
  - Next Hop (blank if 0.0.0.0).
  - Route Type: `ipCidrRouteType` 2 Reject, 3 Local, 4 Remote; dest 0.0.0.0 shows "Default".
  - Route Owner: type 2 "Rejected", 3 "Directly Connected", 4 then by `ipCidrRouteProto` 3 Static, 8 RIP; dest 0.0.0.0 shows "Default".
  - Metric (`ipCidrRouteMetric1`).
- **Row actions:** checkbox and Edit are enabled only for rows that match a static route on dest, prefix and next hop. Default route 0.0.0.0 rows are excluded.
- **Add:** GET `API/ipv4_routes_table_a.htm`, then POST `API/ipv4_routes_table_a.htm`. No inputs are disabled, so all are sent: `IP_Route_Table, rlInetStaticRouteTable`, the `$VT` inputs, and:
  - `rlInetStaticRouteDest$Add`: destination **with host bits zeroed by the mask**.
  - `rlInetStaticRoutePfxLen$Add`: prefix length. The UI accepts either a Network Mask or a Prefix Length (0–32) via radio `rdoMaskPrefix`.
  - `rlInetStaticRouteType$Add`: 2 Reject or 4 Remote (default 4).
  - `rlInetStaticRouteNextHop$Add`: required IP, not 0.0.0.0, for Remote; `0.0.0.0` for Reject.
  - `rlInetStaticRouteIfIndex$add=0`: note the **lowercase** `$add`.
  - `rlInetStaticRoutePathCost$Add`: Metric 1–255, default 1.
  - `rlInetStaticRouteRowStatus$Add=4` (createAndGo).
  - `IP_Route_Table$endAdd`.
  - Note the capital `$Add` on every field except IfIndex.
  - For Reject, Next Hop and Metric are disabled in the UI.
- **Edit (metric only):** `GET API/ipv4_routes_table_e.htm?[IP_Route_Table]Query:rlInetStaticRouteDest=<d>@rlInetStaticRoutePfxLen=<n>@rlInetStaticRouteNextHop=<nh>@rlInetStaticRouteIfIndex=0`, then POST `API/ipv4_routes_table_e.htm` (inputs not disabled) with:
  `rlInetStaticRouteDest$query`, `rlInetStaticRoutePfxLen$query`, `rlInetStaticRouteType$query`, `rlInetStaticRouteNextHop$query` (from read), `rlInetStaticRoutePathCost$query=<1-255>`, `rlInetStaticRouteRowStatus$query=1`, `rlInetStaticRouteIfIndex$query=0`, `IP_Route_Table$endQuery`.
  - Metric is disabled for Reject routes.
- **Delete:** POST `API/ipv4_routes_table.htm` with, for k = 1..n:
  `rlInetStaticRouteDest$repeat?k`, `rlInetStaticRoutePfxLen$repeat?k`, `rlInetStaticRouteNextHop$repeat?k`, `rlInetStaticRouteIfIndex$repeat?k=0`, `rlInetStaticRouteRowStatus$repeat?k=6` (destroy).
  - Classic enables the terminator under the wrong name `IP_Route_Table$endRepeat$repeat?k`. The real input is `IP_Route_Table$endRepeat?k`. Send the real name with `OK` (inferred).
- **Help:** max metric 255, default static metric 1, DHCP default-route metric 253.

### IPv4 Static Route Table (legacy; `ipv4_static_route_table`, title "IPv4 Routes Table"; **not in the menu tree**)

- `GET API/ipv4_static_route_table.htm`: the same two tables as above. In this template the `rlInetStaticRoute*$repeat` inputs are not disabled.
- The edit URI `ipv4_static_route_table.htm?Query:(&query)` shows Dest / NextHop / Type spans and a Metric (1–255) field bound to `ipCidrRouteMetric1$repeat?`. There is no custom Save.
- Superseded by ipv4_routes_table. Document only; no need to reimplement separately.

### IPv6 Routes Table (classic: Network Administration > Route Settings > IPv6 Route Settings > IPv6 Routes Table; help IPv6RouteSettingsIPv6RoutesTable.html; L3Mode only)

- **Read:** `GET wcd?{IPv6RouteList}`.
  - Entry fields: `destinationIPv6Address, destinationPrefixLength, nextHopIPv6Address, interfaceName, interfaceType, interfaceID, routeType, metric, lifeTime, isPointToPoint`.
- **Add read:** `wcd?{IPv6InterfaceList}{IPv6RouteList}`. The interface dropdown uses text = `interfaceName`, value = `interfaceID`.
- **Edit read:** `wcd?{IPv6RouteList}` (whole list); the dialog fills from the row keys.
- **Columns:**
  - Destination IPv6 Prefix, Prefix Length.
  - Next Hop: shows "Directly Connected" if nexthop is `::`, empty, or the destination ends with `::`, and routeType is 4 or 5.
  - Interface.
  - Route Type: 1 Other, 2 ICMP, 3 Static, 4 Connected, 5 Local, 6/7 ND.
  - Metric.
  - Life-Time: `4294967295` shows Infinite; missing shows Undefined. Otherwise classic shows the interface name (bug); the value is seconds (inferred).
- **Add:** POST `<IPv6RouteList action="add"><Entry>...</Entry></IPv6RouteList>`.
  - Next Hop Type Global (radio `rdoNextHopType` = 1): `destinationIPv6Address`, `destinationPrefixLength` (0–128), `nextHopIPv6Address`, `interfaceName` (text of the interface dropdown, even though it is disabled for Global), `metric` (1–65535, default 1), `isPointToPoint=2`.
  - Link Local (2): same, but `nextHopIPv6Address = <nh>%<interfaceName>` and no `interfaceName` element.
- **Edit (metric only):** `<IPv6RouteList action="edit"><Entry><destinationIPv6Address/><destinationPrefixLength/><isPointToPoint>2</isPointToPoint><nextHopIPv6Address>(…%ifname if it contains "fe80")</nextHopIPv6Address><interfaceName/><metric/></Entry>`.
  - Note the action is **`edit`**, not `set`.
- **Delete:** `<IPv6RouteList action="delete"><Entry>` with the same 6 elements. Classic deletes **only the first selected row** (bug).
- "Directly Connected" rows cannot be selected.

### IPv6 Neighbors (classic: Switch Management > IPv6 Addressing > IPv6 Neighbors; help IPv6AddressingIPv6Neighbors.html; not mode-gated)

- **Read:** `GET wcd?{IPv6NeighborList}`.
  - Entry: `interfaceName, interfaceType, interfaceID, IPv6Address, MACAddress, type, state, isRouter`.
- **Edit read:** `wcd?{IPv6NeighborList&interfaceName=..&IPv6Address=..}`.
- **Add read:** `wcd?{IPv6InterfaceList}`. The interface dropdown is filled by `interfaceManager.fillIPv6`.
- **Columns:**
  - Interface, IPv6 Address, MAC Address.
  - Type: 1 Other, 2 Invalid, 3 Dynamic, 4 Static, 5 Local.
  - State: 0 Unreachable, 1 Reachable, 2 Stale, 3 Delay, 4 Probe, 5 Invalid, 6 Unknown, 7 Incomplete.
  - Router: 1 Yes, else No; "N/A" when Type is Static.
- **Add:** `<IPv6NeighborList action="set"><NeighborEntry><interfaceName>…</interfaceName><IPv6Address>…</IPv6Address><MACAddress>xx:xx:xx:xx:xx:xx</MACAddress><type>4</type></NeighborEntry></IPv6NeighborList>`.
  - interfaceName is the selected text with its first space removed.
  - IPv6 must be unicast, max 45 characters.
- **Edit:** the type radio offers Static=4 / Dynamic=3.
  - Dynamic → Dynamic sends nothing.
  - Otherwise one POST carries `<IPv6NeighborList action="delete"><NeighborEntry>{interfaceName (span text, **space kept**), IPv6Address, MACAddress, type}</NeighborEntry></IPv6NeighborList>` followed by `<IPv6NeighborList action="set"><NeighborEntry>{interfaceName (space removed), IPv6Address, MACAddress, type}</NeighborEntry></IPv6NeighborList>`.
  - MAC is editable only for Static. The Dynamic radio is disabled when the entry is Static.
- **Delete:** `<IPv6NeighborList action="delete"><NeighborEntry><interfaceName/><IPv6Address/></NeighborEntry>...`. Dynamic rows cannot be selected.
- **Help:** max 64 neighbors; removing an IPv6 interface removes its neighbors.

### PoE Parameters — UNSUPPORTED on X1018 (classic: Network Administration > Power Management > Power Over Ethernet (POE) > PoE Parameters; help PowerOverEthernet(POE)PoEParameters.html)

- **Read:** `GET wcd?{PoEPSEUnitList}{PoEGlobalSetting}`.
  - `PoEPSEUnitList` entry [0]: `unitID, operStatus` (1 On, 2 Off, 3 Faulty), `nominalPower` (W), `consumptionPower` (W), `usageThreshold` (%), `trapsEnable` (1 Enabled, 2 Disabled), `externalPowerSupply`.
  - `PoEGlobalSetting`: `powerLimitMode` (0 Port Limit, 5 Class Limit).
- **Save:** POST `<PoEPSEUnitList action="set"><UnitEntry><unitID/><operStatus/><nominalPower/><consumptionPower/><usageThreshold>1-99</usageThreshold><trapsEnable>1|2</trapsEnable></UnitEntry></PoEPSEUnitList><PoEGlobalSetting action="set"><powerLimitMode>0|5</powerLimitMode></PoEGlobalSetting>`.

### PoE Interface Settings — UNSUPPORTED (classic: … > Power Over Ethernet (POE) > Interface Settings)

- **Read:** `GET wcd?{PoEPSEInterfaceList}{PoEGlobalSetting}`.
  - Entry: `interfaceName, interfaceID, unitID, adminEnable` (1 Auto, 2 Never), `detectionStatus` (1 Disabled, 2 Searching, 3 Delivering Power, 4 Fault, 5 Test, 6 Other Fault), `poweredDevice` (0–24 chars), `powerPriority` (1 Critical, 2 High, 3 Low), `powerClassification` (1–5 = Class 0–4), `absentCounter, invalidSignatureCounter, powerDeniedCounter, overLoadCounter, shortCounter, outputVoltage, outputCurrent, outputPower`, `powerLimit` (mW; displayed /1000 W), `timeRangeName`.
  - The edit read also includes `supportPoEPlus` (1 = PoE+).
- **Edit read:** `wcd?{PoEPSEInterfaceList&interfaceName=gi1%2F0%2Fn}`.
- The Power Limit column and field appear only when `powerLimitMode == 0` (Port Limit).
- **Save:** `<PoEPSEInterfaceList action="set"><Interface><interfaceName/><adminEnable/><powerPriority/><poweredDevice/>[<powerLimit>W*1000 as string</powerLimit>]</Interface></PoEPSEInterfaceList>`.
  - powerLimit range: 0–15.4 W, or 0–30 W if PoE+.

---

### Summary of gotchas

1. **Cable test is a synchronous POST, with no polling.**
   - Send `CableTestPortList set Entry{interfaceName, testType=2}`, then re-read `CableTestPortList&interfaceName=`. Results come as separate entries per testType: 2 status, 3 fault distance in m, 4 length class.
   - The classic 3 s POST timeout logs the user off on a slow test. Use a longer timeout.
   - The port must be down for TDR; the length test needs a 1G link.
2. **Counter clear is global.**
   - `GlobalStatisticsSetting/clearInterfaceStatistics=1`, from both Etherlike and RMON Statistics. Interface Counters has no clear button.
   - Counters are cumulative. Utilization Summary computes % client-side from deltas, needs at least 2 polls, and the classic version only works with a refresh rate set.
3. **RMON tables are RomPager forms with EntryStatus 1/2/4.**
   - Add uses `$add`, edit `$query`, delete `$repeat?k`. Terminators are `$endAdd`, `$endQuery` and `$endRepeat?k`. The `String$*` / `Default$*` wrappers must be `OK`.
   - Classic has name mismatches: events delete uses `eventTable` vs the real `eventsTable`; IPv4 route delete uses `$endRepeat$repeat?k`. Use the template's names.
4. **Units.**
   - Optical: milli-dBm → mW, µV → V, µA → mA.
   - etherHistoryUtilization is in 1/100 %.
   - sysUpTime and event/log times are in 1/100 s ticks.
   - PoE powerLimit is in mW.
   - CPU is % over the last second, polled only at 15/30/60 s, with a 20-sample client buffer.
5. **Mode gating.**
   - IPv4/IPv6 route pages exist only in L2+ (`rlDependendFeaturesEnabled` first char '1'); otherwise a "requires L2+ mode, reboot" stub.
   - ARP and IPv6 Neighbors are always present.
   - PoE and sFlow are hidden (supported = FALSE).
