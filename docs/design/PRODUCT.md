# Product

## Platform

web

## Users

One owner-administrator running a Dell EMC X1018 (16 × 1 GbE + 2 SFP) as the core switch of a home / small-office LAN.
They are technical (they rebuilt the firmware to ship this UI) but are not a full-time network engineer.
They use the UI at a desk, in three situations:
- **Quick status glance**: is everything up, what is plugged in where, are there errors.
- **Config sessions** of 10+ minutes: ports and VLAN membership, maintenance, and advanced features (STP, LAG, QoS, ACLs, IGMP, mirroring).
- **Troubleshooting**: something on the network is broken; find the port, its link, errors, MAC addresses, neighbours.

Most frequent tasks, all first-class: ports and VLAN membership; who is on which port; maintenance (save, backup, firmware, time, reboot); advanced features.
Phone use is not a primary situation, but the UI must still work at narrow widths.

## Product Purpose

Replace Dell's classic switch web UI with a fast, task-oriented one that is served by the switch itself from a rebuilt firmware image.
Success: every setting the classic UI offers is reachable; a common task is completed from the screen where the need is noticed, without bouncing between pages;
navigation never waits on the switch; the user always knows whether what they see is fresh or cached, and how old it is.

## Positioning

The only UI for this switch designed around its real constraint: a very slow management CPU (~1 s per request, worse under load, 4.7–24 s for some reads, 8 s login).
It hides that latency through caching, idle-time serialized prefetch, batching and optimistic, verified writes, instead of blocking overlays.

## Operating Context

- Served from the switch (firmware 3.0.1.9, path prefix `/cs<8 hex>`, per build); the shell is `config/log_off_page.htm` (no-cache), assets are content-hashed and cached until 2094.
- The switch is live: port 1 is the uplink to the user's LAN. Mistakes can cut the user off from their own network.
- Data comes from the switch's wcd XML API and RomPager form pages (`webui/README.md`).
- The classic UI remains available at `<prefix>/home.htm` as an escape hatch, sharing the session; an open classic tab slows every request 5–10×.

## Capabilities and Constraints

- Vanilla JS/CSS, no dependencies, no CDNs, no web fonts from outside; the gzipped bundle stays small (currently ~16 KB).
- Requests are serialized; batching sections in one request costs about the same as one section. No tight polling.
- `AdminUserSetting` (4.7 s, returns password hashes) and bulk `VLANInterfaceISList` (24 s) are read only on explicit demand, never in prefetch.
- Web sessions expire after a short idle period; re-login takes ~8 s. The UI keeps sessions alive while in use and recovers without losing work.
- Writes apply to the running config immediately; persisting needs an explicit save to startup config.
- Dangerous actions (anything that can cut connectivity, management-access changes, users/passwords, firmware, reboot, save) need clear warnings and confirmation.

## Brand Commitments

Name shown in the UI: the switch's own system name (currently `x1018`), model "Dell Networking X1018". No Dell branding or logo imitation is required.

Standing preferences the owner stated during the direction rounds (2026-11-16):
- Dark mode by default, light mode optional.
- Colour coding with friendly, clear colours; every VLAN has its own colour.
- No containers inside containers.
- Safe fonts: the system UI stack, no display, pixel or serif faces.
- Show meaning visually (icons, keys, before → after) rather than in explanatory sentences, and make every icon's meaning clear.
- The front panel should look like the real hardware: RJ45 jacks without pins, LEDs where the switch has them, meaning what they mean on the switch.

## Evidence on Hand

- Live switch data via the dev proxy (`python3 -I webui/dev.py`).
- Classic UI source for feature reference: the `EWS_FILE` section of Dell's image (`tools/firmware-re/repack_ros.py extract`); menu tree and field help in its `documentation/`.
- API notes: `webui/README.md`, `docs/classic-webui-map.md`, `docs/classic-api/`.

## Product Principles

1. **Never make the user wait on the switch.** Show cached data at once, labelled with its age, and refresh behind it.
2. **Act where you notice.** Every common task is available on the screen where the need shows up; no page-hopping workflows.
3. **Protect the uplink.** The UI knows which port the user reaches it through and treats changes to it as dangerous.
4. **Plain words first, standard terms second.** "Untagged (access) VLAN" rather than "PVID"; short help where a setting is not obvious.
5. **Complete, but ranked.** Everything the switch can do is reachable; the frequent tasks are one step away, the rare ones are tidy but out of the way.

## Accessibility & Inclusion

No product-specific requirement beyond a solid floor: keyboard operable, visible focus, sufficient contrast in light and dark themes, reduced motion respected.
