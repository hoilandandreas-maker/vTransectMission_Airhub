# AirHub Waypoint Creator

> **Live site:** the repository root **is** the app. Open `index.html` (or the deployed
> site root) and you land directly in the planner — there is no landing page, no switcher
> hub, just the mission planning tool.

A single, offline-capable tool for planning drone missions. It merges two earlier
generators — a circular-orbit (multi-ring) photogrammetry planner and a vertical-transect
planner — into one app with a mission-type switcher, eight mission types, an interactive
Leaflet map, a live side-profile, and a full set of planning power-features. It is dressed
in the **AirHub design system**: a dark teal-navy tonal stack, Inter typography, hairline
borders, and Lucide icons.

The shipped `index.html` is a **self-contained bundle**. Leaflet, the Lucide icon set, and
the Inter font family are embedded directly in the file, so the interface loads and runs
with no network connection. The only thing that needs the network is the OpenStreetMap
basemap imagery; without it the map still works, just without tiles. Every tool runs
entirely client-side and exports a `mission.json` consumable by AirHub's mission runner —
no login, no backend.

## Mission types

| Category | Type | What it plans |
| --- | --- | --- |
| Line | **Vertical transect** | A↔B zig-zag that climbs in steps then descends on a staggered offset; first waypoint locks heading with `rotateYaw`. |
| Line | **Corridor** | Symmetric offset lanes that follow a polyline (roads, pipelines, shorelines). |
| Line | **Polygon perimeter** | A closed boundary loop at a fixed altitude, optionally inset inward, heading toward the centroid or fixed. |
| Line | **Facade / wall scan** | Boustrophedon rows across a wall, offset from an A–B baseline by a standoff distance, camera facing the surface. |
| Inspection | **Circular orbit** | One or more rings around a point of interest, each with its own altitude, radius, and gimbal pitch; POI / tangent / fixed heading; optional nadir pass. |
| Inspection | **Spiral / helix** | A continuous climb-and-rotate around a point of interest over a set number of turns. |
| Mapping | **Grid survey** | A lawnmower lane pattern over a polygon, lane spacing derived from sensor footprint and side overlap, nadir capture. |
| Mapping | **Double grid** | A crosshatch — the grid pattern run twice at perpendicular axes for richer 3-D reconstruction. |

## Features

- **One switcher, shared chrome** — pick a mission type; the left panel reflows to that
  type's parameters while the map, stats, validation, and export stay in place.
- **Interactive map** — click to set points (A / B / POI / center) or to drop polygon and
  polyline corners; drag any marker to adjust. The basemap is tinted into the AirHub palette.
- **Side profile** — an altitude-versus-distance profile (ascent and descent shaded
  separately) for the types that vary altitude; a top-down note for the flat-altitude ones.
- **Live stats** — waypoint count, photo count, segment count, ground distance, estimated
  flight time, and maximum altitude, recomputed on every edit.
- **Validation and safety** — out-of-range altitude or speed, and an optional geofence
  radius, are flagged inline before you export.
- **Presets** — per-type starting points (for example *Cliff face* and *Bridge* for
  transect, *Tower* and *Building* for orbit, *Detailed* and *Overview* for grid).
- **Undo / redo** — the whole mission state is snapshotted, so undo spans field edits, type
  switches, and map-vertex edits alike.
- **Import / export settings** — save the full mission state to a JSON file and reload it
  later; legacy orbit-app settings files are migrated on import.
- **Camera, safety, and metadata** — sensor preset and capture trigger, altitude/speed
  limits and geofence, and operator/site/date/notes, all shared across mission types.
- **Three export formats** — AirHub mission JSON, KML, and CSV, with copy, preview, and
  download.

## Using it

Open `index.html` in any modern browser — double-click the file or serve the folder; no
build step or server is required to *run* it. Then:

1. Choose a mission type from the switcher.
2. Set its geometry on the map (click to place or drop corners; drag to fine-tune).
3. Adjust the type parameters, flight, camera, safety, and metadata as needed.
4. Read the waypoint count, stats, and any validation messages.
5. Pick an export format and use **Download** (or **Preview** to inspect first).

All processing is local; nothing leaves the browser.

## Building

The shipped `index.html` is generated — never hand-edit it. Edit the readable source in
`src/`, then rebuild:

```sh
npm run build      # = node build/bundle.mjs
```

The build needs only Node 18 or newer (it uses `zlib` and `fs` from the standard library;
there are no npm dependencies). It prints a `[bundle] OK` line and runs a round-trip
self-test that re-extracts the template and decodes all twelve embedded assets.

## How the bundle works

```
index.html              # SHIPPED self-contained bundle (generated + committed)
.nojekyll               # serve files verbatim on GitHub Pages (skip Jekyll)
src/
  app.html              # readable markup + styles; references the 12 asset UUIDs;
                        #   carries the <!-- @inject:js --> marker
  app.js                # the entire application (one module, no dependencies)
build/
  bundle.mjs            # reassembles src/ into index.html (the build script)
  vendor_head.html      # the document head (fonts + Leaflet CSS + vendor <script> tags)
_donor/
  vtransect_index.html  # asset source of truth: the original bundle whose embedded
                        #   asset manifest (Leaflet, Lucide, Inter, marker images) is reused
```

The embedded assets live in a `<script type="__bundler/manifest">` block as gzip + base64
data. A small loader runs on load, decodes each asset to a `blob:` URL, substitutes those
URLs into the page template, and swaps in the result. `build/bundle.mjs` reuses the donor's
loader and manifest verbatim and only swaps in the new template (`vendor_head.html` +
`src/app.html` with `src/app.js` inlined), asserting that every asset UUID is still
referenced and that the file round-trips before writing.

`src/app.js` is organized as one module: geo helpers, camera models, a unified waypoint
shape, a mission registry (each type declares its fields, defaults, geometry, waypoint
builder, map drawing, validation, and summary), the map controller, the side profile, the
exporters, the stats and validation, the dynamic panel renderer, the render loop, and the
history / settings / modal plumbing. Adding a ninth mission type is a matter of registering
one more entry.

## Third-party assets

The bundle embeds, and this project gratefully uses:

- **Leaflet** (BSD-2-Clause) — the interactive map.
- **Lucide** (ISC) — the icon set.
- **Inter** (SIL Open Font License 1.1) — the typeface.

Basemap imagery is © OpenStreetMap contributors and is fetched at runtime, not embedded.

---

# Design system

The rest of this document is the **design system** that keeps the app visually consistent.

## Content Fundamentals

Copy in this tool is **operational, calm, and precise** — the tone of an air-traffic controller. Users are working pilots; clarity beats personality.

- **Voice**: imperative + third-person. "Set POI", "Download mission.json", not "Let's plan your flight!"
- **No "you" / "we"** inside the UI.
- **Casing**:
  - Buttons → **Sentence case** ("Download mission.json", "Recalc heading")
  - Eyebrow labels above sections + form fields → **ALL CAPS** with +4–6% tracking ("POINT A · START", "LATITUDE", "ASCENT STEP (M)")
  - Status badges → **Title Case** single word
- **Units always shown**: `100 m`, `12 kts`, `58 min`, `192.93°`. Space between number and unit. SI units. Decimal degrees for coordinates.
- **Coordinates** are shown to 7 decimal places of lat/lon (≈1 cm precision) — the precision pilots expect.
- **Status copy is single-word** wherever a badge will fit; expand only in a tooltip.
- **No emoji.** Anywhere. Status is communicated with colored dots + text.
- **Numbers right-aligned** in key/value rows; `font-variant-numeric: tabular-nums` on every column of values.

| ✅ AirHub style | ❌ Off-brand |
|---|---|
| `Download mission.json` | `Get your flight plan! 🚀` |
| `Mid→POI 245.32°` | `The point of interest is to the south-southwest` |
| `22 passes · heading 192.93°` | `Will fly back and forth 22 times` |

## Visual Foundations

A **dark-only operations interface**, borrowing from cockpit avionics + modern devtools: high information density, restrained color, instant scan-ability.

### Color

- **Surfaces are a 4-step tonal stack** of one deep teal-navy hue: `#052230` → `#073347` → `#0a3d55` → `#0d4a67`. Each step is the next layer of elevation. No drop shadows for elevation on chrome — *tone does the work*.
- **One action color**: `#1a7cba` (accent/primary) for primary buttons. `#4eadea` (accent/light) for highlights, links, focused outlines, and the POI marker.
- **Status uses 3 colors**: green `#4ade80` (start point A), orange `#fb923c` (warning, heading vector), red `#f87171` (end point B, errors). Each appears as a small filled circle + sentence-case label inside a tinted badge.
- **No gradients** on UI surfaces. Only color allowed is flat fills + the tonal stack.

### Type

- **Inter** at every weight. SemiBold 600 for H1, Medium 500 for H2/H3/labels, Regular 400 for body + small.
- Eyebrow labels: **11px Medium, +4–6% letter-spacing, uppercase**, in `--text-secondary` (field labels) or `--text-muted` (section titles).
- Numeric data uses Inter with `font-variant-numeric: tabular-nums` — every coordinate, altitude, and heading column should align on the decimal.
- Type sizes: `28 / 20 / 16 / 14 / 12 / 11`. That's the whole scale.

### Spacing & Shape

- **Spacing scale**: 4 / 8 / 12–14 / 24 / 48–64. Field groups use `space-sm` between rows, `space-md` inside cards, `space-lg` between major sections.
- **Corner radii**: 4px badges, 6px buttons/inputs, 8px cards. Never circular pills except for status dots.
- **Borders are HAIRLINE**: 0.5px, `rgba(255,255,255,0.08)` default, `0.15` for emphasis. They define every card, panel, input, and divider.

### Cards & Panels

- Sit on `--bg-elevated` (`#0a3d55`) or `--bg-panel` (`#073347`) for the form sidebar.
- Hairline border + 8px radius. **No drop shadow.**
- Internal padding: 14–20px.

### Backgrounds & Imagery

- The map uses CSS filters (`hue-rotate(180deg) invert(1) brightness(0.85)`) to coerce OpenStreetMap tiles into the AirHub palette. Popups and controls re-invert to read normally.
- The side-profile chart uses faint `rgba(255,255,255,0.05)` gridlines.
- **No full-bleed photography** anywhere.
- **No illustrations, textures, or decorative patterns.**

### Motion

- **Snappy + utilitarian**. 120ms for hover state, 180ms for panel transitions, easing `cubic-bezier(0.16, 0.84, 0.44, 1)`.
- **No bounces, no spring physics.** Linear fades for everything else.
- Inputs always-on (no expanding/collapsing) — pilots need every control visible.

### Hover & Press States

- **Hover**: background shifts one step *up* the tonal stack (`bg-elevated` → `bg-hover`). Color does not change.
- **Press**: 0.97 scale on buttons + remove hover lift. ~90ms.
- **Focus**: 1px outline `accent/light` + 1px box-shadow ring of the same color. Never glow.

### What to avoid

- ❌ Soft drop shadows on cards
- ❌ Rounded pills for anything except status dots
- ❌ Emoji, decorative iconography
- ❌ Gradient backgrounds
- ❌ Centered text in tool UI (it belongs only in empty states)
- ❌ Bounce / spring animations

## Iconography

Single line-icon set with consistent stroke. The Figma frame didn't ship the actual icon assets, so this system standardises on **Lucide** as the substitute — its 1.5px stroke + rounded line-caps + 24px viewBox match the AirHub aesthetic almost exactly.

> **⚠ Substitution flag**: Lucide (CDN). If AirHub has its own icon set, replace it.

### Usage rules

- **Stroke**: 1.5px, rounded line-cap + line-join.
- **Size**: 14–16px in dense UI (badges, inline labels), 18px in buttons, 20px in card headers.
- **Color**: `--text-secondary` at rest, `--text-primary` when active/hovered, `--accent-light` when selected.
- **Always paired with text** in primary actions. Icon-only buttons require a tooltip.
- **Status indicators are NOT icons** — they're 6–8px filled circles in the semantic color.
- **No emoji. No unicode glyphs as icons.** (Exception: `·` as a separator in single-line metadata: `Travel A→B 12.50° · Mid→POI 245.32°`.)

---

## Next steps for iteration

1. Confirm the `mission.json` schema matches the AirHub mission runner expectations.
2. Add additional mission patterns if needed.
3. Verify accent blue against the live AirHub dashboard if applicable.
4. Replace the Lucide icon substitution with the real AirHub icon set if one exists.
