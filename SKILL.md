---
name: airhub-mission-generator
description: Use this skill to generate the AirHub Mission Generator app, or any companion static-HTML tool that should match its visual language. Contains the full design token system (colors, type, spacing, borders, motion), preview cards demoing each piece, and the production mission generator (vertical transect → mission.json export). Tool is fully client-side — no auth, no backend.
user-invocable: true
---

# AirHub Mission Generator — Design Skill

Read `README.md` for the full Content Fundamentals + Visual Foundations + Iconography sections. The whole product is `ui_kits/mission_generator/index.html` — a single self-contained HTML file that runs the vertical-transect generator + `mission.json` export.

When you build anything new that should sit alongside this tool (a different mission pattern, an export inspector, a config editor, etc), follow these rules:

## Quick rules

- **Dark only.** Surfaces step through `#052230 → #073347 → #0a3d55 → #0d4a67`.
- **One accent**: `#1a7cba` (primary action), `#4eadea` (highlight / focus / POI).
- **Status colors**: `#4ade80` (A / start / OK), `#fb923c` (warning / heading vector), `#f87171` (B / end / error).
- **Inter** at 28 / 20 / 16 / 14 / 12 / 11. SemiBold for H1, Medium for H2/H3/labels.
- **Eyebrow labels**: 11px Medium uppercase +4–6% LS in `--text-muted` (section) or `--text-secondary` (field).
- **Status** = colored dot + sentence-case word in a 4px-radius tinted badge.
- **Hairline borders** (0.5px, 8% white). No drop shadows on cards.
- **No emoji. No gradients. No bounces.** Snappy 120ms/180ms motion only.
- **Units always shown** (`100 m`, `12 kts`, `192.93°`). Coordinates to 7 decimals.
- **Numbers right-aligned** with `font-variant-numeric: tabular-nums`.

## Starting a new tool

1. Copy `colors_and_type.css` into the new file.
2. Use the inputs, buttons, and badge patterns from `ui_kits/mission_generator/index.html` — they're inlined and easy to lift.
3. If you need a map: clone the Leaflet + CSS-filter setup from the mission generator (`filter: hue-rotate(180deg) invert(1) brightness(0.85)…`).
4. No login. No backend. Everything is `<script>` in one file or a tiny set of files alongside.

## What's NOT in scope

- Authentication / user accounts.
- Server-side state / databases.
- The DOC dashboard (mission planner / live ops / flight log / fleet / compliance). Don't recreate these — they were removed when scope tightened.
