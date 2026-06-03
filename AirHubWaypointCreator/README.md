# AirHub Waypoint Creator

A single, offline-capable tool for planning drone missions. It merges two earlier
generators — a circular-orbit (multi-ring) photogrammetry planner and a vertical-transect
planner — into one app with a mission-type switcher, eight mission types, an interactive
Leaflet map, a live side-profile, and a full set of planning power-features. It is dressed
in the **AirHub design system** (the "Vtransect" look): a dark teal-navy tonal stack, Inter
typography, hairline borders, and Lucide icons.

The shipped `index.html` is a **self-contained bundle**. Leaflet, the Lucide icon set, and
the Inter font family are embedded directly in the file, so the interface loads and runs
with no network connection. The only thing that needs the network is the OpenStreetMap
basemap imagery; without it the map still works, just without tiles.

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
there are no npm dependencies). It prints an `[bundle] OK` line and runs a round-trip
self-test that re-extracts the template and decodes all twelve embedded assets.

## How the bundle works

```
index.html              # SHIPPED self-contained bundle (generated + committed)
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
