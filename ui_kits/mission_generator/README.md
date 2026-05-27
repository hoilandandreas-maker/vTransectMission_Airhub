# AirHub Mission Generator

The whole product. A standalone web tool that generates a vertical-transect drone mission (takeoff → zig-zag waypoints between two points → landing) and exports it as `mission.json`.

- Pure client-side HTML / JS / CSS. No auth, no backend.
- Open `index.html` in any browser.
- Mission math is unchanged from the original tool at `../../_source/vertical_transect_generator_original.html`. Only the visual layer is new.

## File

- `index.html` — the entire app: form sidebar (A / B / POI / altitudes / flight), Leaflet map, SVG side profile, JSON preview, download button.

## Dependencies (CDN)

- `Inter` (Google Fonts)
- `Leaflet` 1.9.4 (map)
- `Lucide` (icons — download + compass)

## Caveats

- Logo is a placeholder — see `../../assets/`.
- The dark map style uses CSS filters over OpenStreetMap tiles; if you want a real dark tile provider (Carto Dark Matter, Mapbox dark) swap the `L.tileLayer` URL.
