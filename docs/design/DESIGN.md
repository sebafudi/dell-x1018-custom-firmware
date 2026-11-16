---
name: x1018
description: The switch's own web UI, where the front panel of real jacks, coloured by VLAN, is the workspace.
colors:
  ground: "#15171b"
  raised: "#1c1f24"
  raised-2: "#23272d"
  hairline: "#30353d"
  edge: "#59606b"
  ink: "#eceef1"
  muted: "#a9b0ba"
  muted-strong: "#c9ced6"
  inverse: "#15171b"
  plate: "#353a42"
  jack: "#08090b"
  led-off: "#454a52"
  pending-ink: "#eceef1"
  ground-light: "#f4f5f7"
  raised-light: "#ffffff"
  raised-2-light: "#eceef1"
  hairline-light: "#dde0e5"
  edge-light: "#9aa1ab"
  ink-light: "#16181b"
  muted-light: "#5b636e"
  muted-strong-light: "#3c434c"
  inverse-light: "#ffffff"
  plate-light: "#cfd3d9"
  jack-light: "#1a1c20"
  led-off-light: "#8b929b"
  pending-ink-light: "#16181b"
  link-green: "#3ddc84"
  slow-amber: "#ffb020"
  fault-red: "#ff6b6b"
  label-on-colour: "#15171b"
  label-on-jack: "#eceef1"
  vlan-blue: "#3aa8ff"
  vlan-coral: "#ff7a68"
  vlan-green: "#66cc63"
  vlan-lilac: "#b08af5"
  vlan-yellow: "#f5c400"
  vlan-orange: "#ff9f1c"
  vlan-teal: "#2ec4b6"
  vlan-pink: "#f472b6"
  vlan-sky: "#7dd3fc"
  vlan-lime: "#a3e635"
  vlan-sand: "#e8a87c"
  vlan-slate: "#94a3b8"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.4
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  subtitle:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  silkscreen:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: "13px"
  port-number:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "18px"
    fontFeature: "tnum"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  led: "1px"
  square: "2px"
  plate: "3px"
  popover: "4px"
  pill: "9px"
  toggle: "10px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  gutter: "28px"
  slot: "43px"
  label-column: "196px"
  inspector: "360px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "0 12px"
    height: "32px"
  button-hover:
    backgroundColor: "{colors.raised-2}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.inverse}"
    rounded: "{rounded.plate}"
    padding: "0 12px"
    height: "32px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.fault-red}"
    rounded: "{rounded.plate}"
    padding: "0 12px"
    height: "32px"
  button-small:
    rounded: "{rounded.plate}"
    padding: "0 9px"
    height: "26px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "0 10px"
    height: "36px"
  vlan-badge-untagged:
    backgroundColor: "{colors.vlan-blue}"
    textColor: "{colors.label-on-colour}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    size: "28px"
  vlan-badge-small:
    rounded: "{rounded.plate}"
    size: "22px"
  vlan-badge-tagged:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    size: "28px"
  vlan-square:
    backgroundColor: "{colors.vlan-blue}"
    rounded: "{rounded.square}"
    size: "11px"
  matrix-cell:
    backgroundColor: "{colors.vlan-blue}"
    rounded: "{rounded.square}"
    size: "18px"
  port-plate:
    backgroundColor: "{colors.plate}"
    rounded: "{rounded.plate}"
    height: "52px"
  port-number-chip:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    size: "22px"
  lens-tab:
    textColor: "{colors.muted}"
    height: "44px"
  lens-tab-active:
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "0 8px 0 4px"
    height: "28px"
  toggle:
    backgroundColor: "{colors.led-off}"
    rounded: "{rounded.toggle}"
    width: "36px"
    height: "20px"
  toggle-on:
    backgroundColor: "{colors.link-green}"
  top-bar:
    backgroundColor: "{colors.raised}"
    height: "52px"
    padding: "0 20px 0 24px"
  inspector:
    backgroundColor: "{colors.ground}"
    width: "360px"
    padding: "20px 24px 12px"
  pending-tray:
    backgroundColor: "{colors.raised}"
    padding: "14px 24px 0"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.inverse}"
    rounded: "{rounded.plate}"
    padding: "10px 14px"
---

# Design System: x1018

## Overview

**Creative North Star: "The Switch Is the Interface"**

The UI is the switch's own front panel, drawn as the hardware looks: sixteen RJ45 jacks in two rows of eight, two SFP cages after a gap, LNK/ACT LEDs where the chassis has them. Each plate is painted in the colour of the VLAN it carries untagged, so the panel answers "what is plugged in where, and which network is it on" before a word is read. Everything else hangs off that panel: the VLAN matrix lines up under it column for column, and the inspector on the right acts on whatever is selected. There is no controller dashboard: no sidebar, no stat tiles, no boxed cards.

The world is dark by default (a near-black ground with one raised step and hairlines), with a derived light theme. Colour is spent on two things only: VLAN identity, in friendly saturated hues where every VLAN keeps its own colour everywhere, and device state, in LED green, amber and red. Chrome is ink-on-ground and stays quiet. Areas are separated by whitespace and a single hairline, never by nested boxes. Meaning is shown with visual keys (a filled square, an outlined square, a dashed ring with a plus) rather than explanatory sentences, and every key is printed once in a one-line legend above the panel.

Density is that of an instrument: 13 px system text with tabular numerals, 43 px port slots, 46 px matrix rows. Change is drawn in place as a future state (dashed ring, plus or minus badge) and collects in a tray until one Apply sends it.

**Key Characteristics:**
- Front panel of realistic jacks is the primary surface; it is never replaced by a list or tiles.
- Filled means untagged, outlined means tagged, dashed means leaving: on plates, badges, squares and matrix cells alike.
- One VLAN, one colour, in every place the VLAN appears.
- Ink is the only "brand" colour: primary buttons, selection outlines, the active lens and the pointer pill are all ink.
- No containers inside containers: whitespace and one hairline per boundary.
- One 16 px line-icon set; meaning carried by keys, not prose.

## Colors

Near-black, low-chroma neutrals carry the chrome; saturation is reserved for VLAN identity and LED state.

### Primary
- **Panel Ink** (ink / ink-light): the text colour, and the only accent of the chrome. Fills the primary button, outlines the selection, underlines the active lens, fills the pointer pill, draws focus rings. Paired with **Inverse** (inverse / inverse-light) for text set on an ink fill.
- **Pending Ink** (pending-ink / pending-ink-light): the same value as ink, kept as its own token because it means "future state": every dashed ring and every +/− badge is drawn in it.

### Secondary: the VLAN palette
Twelve friendly hues, assigned per VLAN ID first come, first served and remembered in the browser; VLAN 1 is always **Uplink Blue** (vlan-blue). In assignment order: **Uplink Blue** (vlan-blue), **Coral** (vlan-coral), **Leaf Green** (vlan-green), **Lilac** (vlan-lilac), **Signal Yellow** (vlan-yellow), **Tangerine** (vlan-orange), **Teal** (vlan-teal), **Pink** (vlan-pink), **Sky** (vlan-sky), **Lime** (vlan-lime), **Sand** (vlan-sand), **Slate** (vlan-slate). The same values serve both themes. Text on a VLAN fill is always **Label on Colour** (label-on-colour), a fixed near-black, in both themes.

### Tertiary: device state
- **Link Green** (link-green): LNK LED at 1 Gb/s, the ACT LED blink, a toggle that is on, the session ring, traffic bars.
- **Slow Amber** (slow-amber): LNK LED at 10/100, stale-data and signed-out states, inline warnings, the risk line in the tray, the session-expiring banner (with label-on-colour text).
- **Fault Red** (fault-red): danger buttons, form errors, error and higher log severities. In the light theme it is `#c62828` so it reads as text on the light ground.
- **Warning Text** (`--warn`): `#ffb020` dark / `#8a5300` light, for warning lines, risk lines, stale freshness and warning log severities. The amber LED stays `#ffb020` in both themes; text never uses the LED tone on a light ground.
- **Error Toast** (`--toastbad` `#c62828`): the error toast background, white text (AA), in both themes.
- QoS queue grids use a grey ramp (`#7d8590` → `#eceef1`, queue 1 → 4), never VLAN hues: colour keeps meaning "this VLAN".

### Neutral
- **Ground** (ground / ground-light): page, inspector, sheets.
- **Raised** (raised / raised-light): top bar, pending tray, input fields, popovers. **Raised 2** (raised-2 / raised-2-light): hover fill, active settings-nav item, kbd keys.
- **Hairline** (hairline / hairline-light): every divider, table rule and section boundary. **Edge** (edge / edge-light): control borders (buttons, inputs, segmented controls), scrollbars.
- **Muted** (muted / muted-light): secondary text, labels, legends, column heads. **Muted Strong** (muted-strong / muted-strong-light): port names in the silkscreen, settings-nav items at rest.
- **Plate** (plate / plate-light): a port plate with no VLAN colour, port-number chips. **Jack** (jack / jack-light): RJ45 openings, tagged-VLAN pips, the on-plate chips (text on them is **Label on Jack**, label-on-jack). **LED Off** (led-off / led-off-light): unlit LEDs, a toggle that is off.

### Named Rules
**The One VLAN, One Colour Rule.** A VLAN's colour comes from the shared assignment (`vcol.of(id)`) wherever it appears (plate, badge, square, matrix row, table cell, legend). Never pick a VLAN colour locally.

**The Ink Accent Rule.** The chrome has no hue of its own. Selection, primary action, active tab and focus are ink; if something needs a colour to be noticed, it is either a VLAN or a device state.

**The Neutral Until Configured Rule.** An unlinked port on VLAN 1 with no tagged VLANs stays plate grey; a plate takes its VLAN colour once it is linked, on another VLAN, carries tagged VLANs, or its VLAN is the one being edited.

## Typography

**Body Font:** the system UI stack (-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif)
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, monospace, for MAC addresses and clock/address readouts only.

**Character:** the operating system's own face, two weights (400 and 600), tabular numerals throughout so counters, port numbers and ages never jitter. No display, pixel or serif faces, and nothing loaded from outside the switch.

### Hierarchy
- **Display** (600, 22px): the sign-in heading only. The switch name in the top bar is 600 at 17px (15px on phones).
- **Headline** (600, 19px): the inspector title ("Port 7", "Ports 17–18", "VLAN 20"). Settings section titles use 600 at 18px.
- **Title** (600, 16px): area headings ("Front panel"), sheet titles.
- **Subtitle** (600, 14px): sub-headings inside a sheet or section, the tray heading, VLAN names in the matrix, lens tabs (400 at rest, 600 active).
- **Body** (400, 13px, 1.4): everything else; notes capped at 68ch.
- **Label** (400, 12px): field labels, legends, column heads, freshness lines, hints; always muted.
- **Silkscreen** (400, 11.5px / 13px, up to two lines, clamped): port names printed beside the jacks, in muted-strong; a pending name shows in ink italic.
- **Port number** (600, 15px / 18px): the number next to each jack (12px on phones).
- Badges and pips: 600 at 12px (11px small); kbd 600 at 11px.

### Named Rules
**The Two Weights Rule.** 400 and 600 only. Emphasis is weight or ink, never size jumps, colour or underline.

**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on the root; never turn it off for numbers that update.

## Layout

The workspace is one row: the main area (padding 20px 28px 40px) and a 360px inspector after one hairline. Above them sit two sticky bands: the 52px top bar on raised, and the 44px lens tabs on ground, each closed by a hairline.

**The shared grid.** The front panel and the VLAN matrix are built on one CSS grid: a 196px label column, sixteen 43px slots, a 16px gap, and two more slots for the SFP ports. Each panel column is a two-slot subgrid holding a top port (odd) and a bottom port (even), so matrix columns for ports 1 and 2 sit exactly under the 1/2 column of the panel. The panel's rows are: top silkscreen, 52px plate, 8px gap, 52px plate, bottom silkscreen. Silkscreen is centred, the number against the jack and the name beyond it, so top labels stack upward and bottom labels stack downward.

**The matrix.** 46px rows with a hairline under each; even rows get a quiet 3.5% ink wash; the row of the VLAN being edited gets an 11% wash of its own colour and an ink outline on its badge. A 2px line at 55% of the VLAN's colour runs through the row behind the cells. Dashed guides at 10% ink run between port pairs, one per panel column. The column header row (30px) carries the port numbers and, in the label column corner, the untagged/tagged key.

**Rhythm.** Spacing steps are 4, 6, 8, 12, 16, 20, 24 and 28px. Inspector sections are separated by a hairline and 12px padding; settings blocks by a hairline and 14/18px padding; the first block under a heading has no hairline.

**Responsive.**
- At 1100px and below the inspector becomes a bottom sheet (max 52vh, edge-coloured top border, close button), the tray inside it is capped at 22vh, and the main area gets bottom padding so content can scroll clear of it. Top-bar labels marked secondary drop out; search becomes an icon.
- At 760px the Settings sheet stacks its section list above the section.
- At 560px (phones) the same 2 × 9 panel stays, shrunk: 42px label column, 17px slots, 8px SFP gap, 40px plates, smaller jacks and LEDs, silkscreen names hidden, on-plate chips hidden, matrix cells 13px, VLAN names and counts hidden, and the label column sticky on horizontal scroll. Activity and the theme switch leave the top bar (both stay in search).

## Elevation & Depth

Flat by default, with tonal layering: ground, then raised, then raised-2 for hover. Areas never get a shadow. Shadows exist only on things that float over the workspace, and on the hardware drawing itself.

### Shadow Vocabulary
- **Side sheet** (`box-shadow: -12px 0 32px rgba(0,0,0,.35)`): Settings, Activity and confirm sheets sliding in from the right over a 45% black scrim.
- **Bottom sheet** (`box-shadow: 0 -12px 32px rgba(0,0,0,.35)`): the inspector at narrow widths.
- **Popover** (`box-shadow: 0 16px 40px rgba(0,0,0,.45)`): the search palette; the re-sign-in card uses `0 12px 32px rgba(0,0,0,.4)`.
- **Toast** (`box-shadow: 0 6px 20px rgba(0,0,0,.3)`).
- **Sticky action bar** (`box-shadow: 0 -8px 12px -8px rgba(0,0,0,.35)`): the Apply/Discard row at the foot of the tray, when the list scrolls under it.
- **Hardware**: jack openings are recessed (`inset 0 2px 3px rgba(0,0,0,.6)`); lit LEDs glow in their own colour (`0 0 7px`, 5px in legends) with a 1px dark bezel.

### Named Rules
**The Float-Only Shadow Rule.** A shadow means "this is over the workspace". Nothing that sits in the page flow gets one.

## Shapes

Small, near-square corners: 3px for anything you click or that stands for a VLAN (buttons, inputs, plates, badges, chips), 2px for squares and matrix cells, 1px for LEDs and pips, 4px for floating cards. Full rounding is reserved for the pointer pill (9px) and the toggle (10px). Borders are 1px: hairline for structure, edge for controls. Outlines are the state language: 2px solid ink at 2px offset for selection, 2px muted for hover, 1.5px dashed pending-ink for a pending change. Tagged is drawn as a 2px inset ring of the VLAN colour on a transparent fill; leaving is a dashed border in the VLAN colour.

## Components

### Buttons
Quiet, outlined, compact.
- **Shape:** gently squared (3px), 32px tall, 12px side padding, 7px icon gap; small variant 26px / 9px / 12px text; icon-only variant 32px square.
- **Default:** transparent with an edge border; hover fills raised-2.
- **Primary:** ink fill, inverse text, weight 600; hover darkens slightly (brightness .92). One primary per action row (Apply, Save, Add VLAN).
- **Danger:** fault-red text and a red-tinted edge border; used for destructive confirms and Remove.
- **Ghost:** no border; sheet close buttons and tray undo.
- **Labels** are verbs with counts where it helps: "Apply 5 changes", "Save 3 changes", "Discard", "Apply anyway". A button that opens a sheet ends in an ellipsis ("Spanning tree settings…").

### Lens tabs
Icon plus word, 14px, muted at rest, ink and 600 with a 2px ink underline when active, 24px apart (18px at narrow widths), horizontally scrollable. Lenses: Link, VLANs, Traffic, Errors, Devices, Spanning tree, LAG.

### VLAN badges and squares
- **Badge:** a 28px (22px small) square in the VLAN colour with the VLAN ID in 600 label-on-colour text. Tagged: transparent with a 2px inset ring of the colour and ink text.
- **Square:** 11px, 2px corners; filled untagged, ringed tagged, dashed leaving. Used in legends, counts and the matrix key.
- **Port-number chip:** 22px plate-grey square with the port number, used wherever a port is named in a visual (tray, inspector).

### Front panel
The signature surface.
- **Plate:** 52px tall, 3px corners, filled with the untagged VLAN's colour (plate grey when neutral). Hover brightens 8%. Disabled ports get a diagonal hatch of plate and ground.
- **Jack:** a recessed jack-coloured opening with the latch tab (no pins), facing down on the top row and up on the bottom row. SFP cages are a wider, shallower slot with a light rim.
- **LEDs:** two per jack at the outer edge, left LNK (green 1 Gb/s, amber 10/100, off), right ACT (green blink on traffic, steps, 0.9s). They mean exactly what the chassis LEDs mean.
- **Tagged pips:** up to four 9px jack-coloured squares ringed in each tagged VLAN's colour, in the corner opposite the LEDs.
- **On-plate chips** (jack fill, label-on-jack text): "→ VLAN" shows a pending untagged change as an arrow and a 10px square of the future VLAN (dashed when the port will have none); "L1"-style marks LAG membership in the LAG lens.
- **Your connection:** the plug icon after the port number of the port the browser reaches the switch through.
- **Selection:** 2px solid ink outline at 2px offset; the hovered port gets the same outline in muted. A pending port gets the dashed ring; a pending and selected port keeps the solid ink outline and gains an outer 1.5px pending-ink band beyond a ground gap.
- **Dim:** 45% opacity for ports outside the current question (not in the VLAN being edited; not forwarding in the Spanning tree lens).

### VLAN matrix
Rows of 18px cells, one per port, under the panel. Filled = untagged, inset ring on ground = tagged, empty = not a member (edge ring on hover), dashed = leaving. The pointer column is marked with an outer ink ring on the cell and a filled ink pill on the column number; selected ports get an ink-outlined number. The row label is the badge, the name (14px, 600, ellipsis at 140px) and counts ("■ 18 · −1", "+1 ■") in label size. Clicking a cell cycles not a member → untagged → tagged → not a member as a pending change.

### Pending-state grammar
One grammar for every future state, everywhere:
- **Joins untagged:** filled in the VLAN colour, dashed pending-ink ring, "+" badge.
- **Joins tagged:** outlined in the VLAN colour, dashed ring, "+" badge.
- **Leaves:** dashed outline in the VLAN colour, dashed ring, "−" badge.
- **Badge:** a 12px pending-ink disc (9px on squares) at the top-right corner with a 6px inverse plus or minus drawn in CSS.
- **Plate:** "→ VLAN" on-plate chip plus the dashed ring; a pending name appears at once in the silkscreen, italic.
- **Controls:** a toggle, select or input whose value is pending gets the same dashed ring.
- The legend gains a "Pending" line (joins untagged, joins tagged, leaves) only while something is pending.

### Pending tray
Sits at the foot of the inspector on raised, after a hairline. Heading "N pending changes" with "not applied yet" muted at the right. Rows share one subgrid: a visual column (port chip, + or − or →, before and after badges) and a description column ("Port 17 moves from VLAN 1 to media"), 16px apart, aligned, not wrapping into each other. The undo button overlays the row's right edge on hover or focus, so descriptions use the full width. Risk lines follow in amber with the warning icon. Apply and Discard sit in a sticky row at the bottom. Capped at 46vh (22vh in the bottom sheet).

### Inspector
360px, after one hairline, sticky under the bands. Headline title, a muted sub line of facts with icons, then fields separated by hairlines (label 12px muted above the control). Less frequent per-port settings are collapsible groups: a 42px summary row with icon, 112px bold name, muted one-line summary and a rotating chevron. Port-group edits always become pending changes; they never write directly.

### Inputs / Fields
- **Style:** 36px, raised fill, 1px edge border, 3px corners, 10px side padding; placeholders muted, italic. Selects draw their own two-stroke chevron.
- **Focus:** the global 2px ink outline at 2px offset.
- **Segmented control:** edge-bordered row; the chosen option is filled ink with inverse text.
- **Toggle:** 36 × 20 track, led-off at rest, link-green when on, 16px inverse knob.
- **Error:** fault-red line under the form; empty error lines take no space.

### Chips
28px, hairline border (edge on hover), 3px corners, a small VLAN badge at the left. Used for VLAN lists in the inspector; a removable chip ends in the x icon.

### Tables
Full width, hairline rules, 12px muted column heads in 400, 8 × 10px cells, a quiet 3% ink wash on alternate rows, 6% on hover, 8% on the selected port's row. Numbers right-aligned. VLANs in a cell are small badges. Rows that stand for a port select it on click.

### Sheets and the settings engine
Settings, Activity, New VLAN and every confirmation open as a side sheet on ground (720px; Settings 1080px) with a 52px header and an icon close button. Settings is a two-column layout: a 230px sticky side with a search field and the section list in groups (Switch, Network, Time, Access and security, Switching, Traffic, Monitoring, Maintenance; group names 12px muted, items icon plus title, active item on raised-2 in 600), and the section on the right (max 760px). A section opens with its icon, an 18px title, the data's age with the clock icon, and a refresh button; then an optional muted intro note; then blocks, forms and tables separated by hairlines. Forms are a single column (max 520px) of label-above fields, toggles as a label-left line, with Apply (disabled until something changes) and Reset. Tables add, edit in place below the table, and remove with a confirm. New sections are written with `defSettings`, per-port groups with `defPortGroup`, and should use the context helpers (`c.block`, `c.note`, `c.kv`, `c.form`, `c.table`) instead of hand-built markup.

### Top bar and status
Switch name, IP (muted), session ring with "Session kept alive", freshness ("Live 13 s", or "VLANs 4 min", amber when stale) with the clock icon (a spinning refresh icon while reading), a flexible gap, then Search with its ⌘K key, the pending count (a dashed square and the number), Save (primary, only when there is something to save), Settings, Activity, and the theme switch.

### Feedback
Toasts sit at the bottom centre: ink with inverse text, or fault-red for errors, 3.5s (8s for errors). Confirmations are sheets, not browser dialogs. The search palette (560px, 12vh from the top) lists ports, VLANs, devices, lenses, settings and actions with their icon and a muted hint at the right.

### Icons
One set: 16px on a 16 × 16 viewBox, 1.5px round-capped and round-joined strokes, no fills, `currentColor`. Each icon has one meaning (vlan, link, traffic, err, dev, tree, lag, shield, leaf, pulse, clock, arrow, pen, plus, minus, search, moon, sun, save, here, x, gear, list, cable, refresh, undo; feature pages add globe, route, book, chipi, xfer, user, key, lock, mcast, phone, bell, funnel). An icon that stands alone carries a title that says what it means. New icons are drawn in the same stroke language and registered once.

### Wording
- Plain words first, the standard term second: "Untagged (access) VLAN", "Fast link (PortFast, edge port)".
- Sentence case everywhere; no all-caps labels.
- Ports are "Port 7" and "Ports 17–18" (en dash); VLANs are "VLAN 20" or their name; quantities use "×" ("16 × RJ45"), signed counts use "+1" and "−1" (true minus).
- Ages are short and spaced: "12 s", "4 min", "3 h", "2 days"; "Live" under a minute.
- Work in progress ends in an ellipsis: "Reading from the switch…", "Working…".
- After a write, say what state it is in: "Applied. Not saved yet." Danger confirms name the consequence in the title ("These changes can cut you off").

## Do's and Don'ts

### Do:
- **Do** draw ports as the hardware looks: plates with recessed jacks, no pins, LEDs only where the chassis has them, with their chassis meaning.
- **Do** take every VLAN colour from the shared assignment, and keep filled = untagged, outlined = tagged, dashed = leaving in every new view.
- **Do** draw any pending change as its future state with the dashed pending-ink ring and a + or − badge, and route per-port edits through the pending tray.
- **Do** separate areas with whitespace and one hairline (`1px solid` hairline token).
- **Do** align anything per-port under the front panel to the shared grid (196px label column, 43px slots, two slots per panel column).
- **Do** show the age of the data next to anything read from the switch, with the clock icon.
- **Do** use the 16px stroke icon set and give every standalone icon a title.
- **Do** build new settings pages from the settings engine's blocks, forms and tables, with notes in muted 13px capped at 68ch.

### Don't:
- **Don't** build a controller dashboard: no sidebar navigation, stat tiles or boxed cards.
- **Don't** put a container inside a container (no bordered card inside a section, no panel inside the inspector).
- **Don't** use VLAN palette colours for anything that is not a VLAN, or invent a colour per screen.
- **Don't** give the chrome a hue: selection, primary action, active tab and focus stay ink.
- **Don't** use web fonts, display, pixel or serif faces, or weights other than 400 and 600.
- **Don't** add a shadow to anything that sits in the page flow.
- **Don't** explain in a sentence what a key, icon or before → after visual can show.
- **Don't** animate anything except the ACT LED blink, the sheet slide-in, small state transitions and the reading spinner; all of it stops under reduced motion.
