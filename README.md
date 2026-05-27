# AirHub Mission Generator — Design System

This project ships **one product**: a self-contained, client-side HTML tool that lets a drone operator generate a vertical-transect mission and export it as `mission.json`. No login, no backend, no DOC dashboard — just the tool and its visual system.

> **The whole product** is `ui_kits/mission_generator/index.html`. Everything else in this project (tokens, preview cards, SKILL.md) exists to keep that file consistent and to make future tools in the same family look + feel identical.

## The app

`ui_kits/mission_generator/index.html` — opens in any browser, runs entirely client-side.

- Pick **Point A** and **Point B** (the inspection line endpoints).
- Pick a **POI** — the asset the drone faces (flare stack, wind turbine, bridge). Click the map to set it.
- Set altitude range + ascent step.
- The tool generates a zig-zag pattern: ascending pass between A↔B, then descending offset pass interleaved between ascent levels.
- Heading auto-locks perpendicular to A↔B, oriented toward the POI.
- Map + side-profile visualisation update live.
- **Download `mission.json`** — a takeoff → waypoint sequence → landing schema consumable by AirHub's mission runner.

The mission-generation math was lifted **unchanged** from the user's original tool (`_source/vertical_transect_generator_original.html`). Only the visual layer is new.

## Sources

- **Figma file** — `AirHub` (1 page, 301 nodes). Extracted to `_fig/Airhub/`. The reference frame defined the colors / type / token system.
- **Original mission tool** — preserved at `_source/vertical_transect_generator_original.html`.
- **No backend, no codebase, no auth.** Static HTML only.

---

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

---

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

---

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

### Icons used in the mission generator

| Where | Lucide name |
|---|---|
| Download button | `download` |
| Recalc heading button | `compass` |

---

## Index — what's in this project

```
/
├── README.md                      ← you are here
├── SKILL.md                       ← agent-skills entry point
├── colors_and_type.css            ← all tokens + base styles
├── assets/
│   ├── logo-airhub.svg            ← wordmark (placeholder — flag for swap)
│   └── logo-airhub-mark.svg       ← mark only
├── preview/                       ← Design System tab cards
│   ├── colors-surfaces.html
│   ├── colors-accent.html
│   ├── colors-semantic.html
│   ├── colors-text.html
│   ├── type-scale.html
│   ├── type-label.html
│   ├── spacing-scale.html
│   ├── radii.html
│   ├── borders.html
│   ├── elevation.html
│   ├── motion.html
│   ├── component-buttons.html
│   ├── component-badges.html
│   ├── component-inputs.html
│   ├── component-map-widget.html
│   └── brand-logo.html
├── ui_kits/mission_generator/     ← THE APP
│   ├── README.md
│   └── index.html
├── _source/                       ← original tool (do not edit)
│   └── vertical_transect_generator_original.html
└── _fig/Airhub/                   ← raw Figma extraction (do not edit)
```

---

## Next steps for iteration

1. Replace `assets/logo-airhub.svg` with the real AirHub logo.
2. Add additional mission patterns if needed (horizontal grid, orbit, ladder).
3. Confirm the `mission.json` schema matches the AirHub mission runner expectations.
4. Verify accent blue against the live AirHub dashboard if applicable.
