# Grave Guard: Moonbloom Hollow

A cozy-spooky browser lane-defense game for Kiroween 2026. Friendly ghosts walk down 5 lanes toward your gate.
Answer quiz questions in the spellbook to earn Soul Energy, then spend it on defenders. The game never pauses for a question.

## Run it

Needs Node 22+.

```
npm install
npm run dev        # open http://localhost:5173
```

Other commands: `npm test` (unit + property tests), `npm run build` (production build), `npm run e2e` (Playwright smoke + screenshots).

## Controls

| Key          | Action                                                 |
| ------------ | ------------------------------------------------------ |
| 1–4          | Answer the question                                    |
| Q W E R T    | Pick Lantern, Gargoyle, Coffin, Salt Rune, Bell        |
| Click a tile | Place the picked defender (hold Shift to keep placing) |
| Right-click  | Remove a defender (50% refund)                         |
| S            | Skip the question (after 3 s)                          |
| Esc          | Cancel the pick, or pause                              |

## How it is built

- `src/sim`: pure, deterministic game logic (fixed 60 Hz ticks, seeded RNG, commands in, events out).
- `src/quiz`: question packs, picking, streaks.
- `src/render`: Three.js 2.5D scene with painted sprites. `src/ui`: DOM overlay. `src/audio`: Web Audio.
- `.kiro/`: the steering docs and specs this game was built from with Kiro.

Asset credits: see [CREDITS.md](CREDITS.md). License: [MIT](LICENSE).
