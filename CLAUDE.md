# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**AirHub Mission Generator** — static, client-side drone-mission planning tools that export a
`mission.json` consumable by AirHub's mission runner. **No backend, no auth, no dashboard** —
every tool opens in any browser and runs entirely client-side.

`index.html` at the repo root is a navigation hub that links to each tool.

## Tools

| Tool | Path | What it is |
| --- | --- | --- |
| **AirHub Waypoint Creator** | `AirHubWaypointCreator/` | The flagship: one switcher, **eight** mission types (vertical transect, corridor, polygon, facade, orbit, spiral, grid, double grid), interactive Leaflet map + live side-profile. |
| **Vertical Transect Generator** | `vertical-transect/` | The original single-purpose tool: an A↔B zig-zag that climbs in altitude steps then descends on a staggered offset, heading locked perpendicular toward a POI. |

## Layout & build

- `index.html` — navigation hub.
- `vertical-transect/index.html` — self-contained single-file tool.
- `AirHubWaypointCreator/`
  - `src/app.html`, `src/app.js` — authored source.
  - `_donor/vtransect_index.html` — **build input** read by the bundler (see below). It is
    byte-identical to `vertical-transect/index.html` on purpose; **do not delete it** — the
    build depends on it.
  - `build/bundle.mjs` — the bundler; `build/vendor_head.html` — vendored head assets.
  - `package.json` — `npm run build` → `node build/bundle.mjs` produces the self-contained app.
- `README.md` — the **canonical design system**; keep tools visually consistent with it.

```bash
cd AirHubWaypointCreator
npm run build        # node >=18; emits the self-contained tool
```

## Conventions

- Tools must stay **fully client-side** — open-in-browser, no backend/login. Output is always a
  takeoff → waypoints → landing `mission.json`.
- The mission-generation math was lifted unchanged from the original vertical-transect tool;
  treat it as load-bearing — change geometry deliberately and verify the exported `mission.json`.
- Follow the README design system (colors/type/tokens) for any new UI so tools stay consistent.
- `graphify-out/` (if present) is generated knowledge-graph output — not part of the app; safe to delete.
