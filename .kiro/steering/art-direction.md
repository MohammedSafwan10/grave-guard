---
inclusion: fileMatch
fileMatchPattern: ["src/render/**", "src/ui/**", "src/styles/**", "index.html"]
---

# Art direction

Reference image: #[[file:docs/concept/concept_main.png]]
Match it. If something on screen doesn't look like it belongs in that picture, it's wrong.

## Look

- Cozy spooky storybook. Painterly, soft, polished. Not flat vector, not horror.
- Palette:
  - Night: `#1b1533` (deep indigo), `#2a2050` (violet), `#3d2f6b` (stone shadow)
  - Accents: `#c9b6ff` (lavender), `#f3a6d8` (moonbloom pink)
  - Warm light: `#ffb35c` (lantern amber), `#ffd98a` (gold)
  - Magic: `#5ff0e6` (soul cyan), `#2bb8b0` (deep teal)
  - Parchment: `#f2e3c4`, ink `#3a2a1f`
- Fonts: headings "Cinzel Decorative" or "Cinzel"; body and questions "Nunito" (very readable). Self-host them.

## Scene (2.5D)

- Fixed perspective camera looking down the board at ~35°, slight drift and a small push-in on boss waves.
- Layers back to front: `bg_sky` → `bg_far_hills` → 3D board (stone tiles + grass strips) → sprites → `fg_gate_left` → foreground foliage → DOM UI.
- Lights: cool moonlight from the upper left, warm point lights on every lantern and the gate lantern, cyan glow on soul magic.
- Post-processing: bloom (glows only), soft vignette, subtle film grain. Light fog in the distance.

## Sprites

- Billboards that face the camera. Each one gets a soft contact shadow on the tile.
- Defenders face right, enemies face left. Never mirror the Bone Knight's shield art badly; flip only if it still reads.
- Motion is code-driven, never jittery: ease in/out on everything, idle motion at 0.5–1.5 Hz.
- Hit: 80 ms white flash + small knockback. Death: dissolve into particles of the unit's colour.

## UI

- DOM overlay using the painted frames in `public/assets/ui/`. All text is live HTML, never baked in images.
- Spellbook on the right (~28% width on desktop), shop cards along the bottom, HUD plaques at the top.
- Buttons respond within 1 frame: hover lift, press squash, focus ring in soul cyan for keyboard users.
- Correct answer: button glows teal with a check + energy orbs fly to the gem counter. Wrong: gentle shake + red tint, then show the right answer.
