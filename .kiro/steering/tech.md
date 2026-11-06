---
inclusion: always
---

# Tech rules

## Stack
- **Vite + TypeScript (strict)**, plain DOM for UI (no React), **Three.js** for the scene.
- **Vitest** for unit tests, **fast-check** for property-based tests, **Playwright** for screenshot smoke tests.
- AI question forge: one serverless function `api/forge.ts` (Vercel) calling **Amazon Bedrock**. Keys only in env vars.
- Package manager: npm. Node 22+.

## Architecture (keep these boundaries)
```
src/
  sim/      pure game logic. No Three.js, no DOM, no Math.random, no Date. Fixed 60 Hz ticks, seeded RNG.
  quiz/     question packs, picking, streaks, scoring. Pure, no DOM.
  render/   Three.js scene. Reads sim state, never changes it.
  ui/       DOM overlay (HUD, spellbook, shop, menus). Sends commands, never edits state directly.
  audio/    Web Audio playback + procedural sounds. Reacts to sim events.
  data/     JSON: defenders, enemies, waves, levels, question packs.
  app/      wiring: game loop, asset loading, screens.
```
- The sim is driven only by **commands** (`placeDefender`, `answerQuestion`, ...) and **ticks**.
  It emits **events** (`enemyKilled`, `energyChanged`, ...). Render, UI and audio only listen.
- This makes the sim deterministic: same seed + same commands = same result. Tests depend on it.
- Game numbers live in `src/data/*.json`, never hard-coded in logic.

## Code style
- Small files, one job each. Named exports. No default exports.
- No `any`. Validate all external data (JSON packs, AI output, URL-shared packs) with a schema at the boundary.
- Prefer plain functions and data over classes, except for long-lived render objects.
- Comments explain why, not what.

## Assets
- Load only from `public/assets/` using `art-manifest.json` and `audio-manifest.json`.
- Never edit files in `assets-src/`. Rebuild with `python tools/build_art.py` / `python tools/build_audio.py`.
- Size sprites with the manifest's `aspect`; place them with its `anchor`.

## Performance budget
- 60 fps on a mid-range laptop with integrated graphics at 1080p.
- Max ~150 sprites + 500 particles on screen. Use instancing / pooling for projectiles and particles.
- First playable screen in under 3 s on a normal connection. Lazy-load music and the boss assets.

## Security
- Never put API keys in client code. The forge function rate-limits per IP and caps input size (20k chars).
- Treat user notes and AI output as untrusted text: render with `textContent`, never `innerHTML`.

## Commands
- `npm run dev` dev server · `npm test` unit + property tests (single run) · `npm run build` production build
- `npm run e2e` Playwright smoke + screenshots
