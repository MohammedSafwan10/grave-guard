---
inclusion: fileMatch
fileMatchPattern: ["src/sim/**", "src/quiz/**", "src/data/**", "tests/**"]
---

# Game balance (current numbers)

The source of truth is `src/data/*.json` (levels come from `tools/gen_data.mjs`). Update this file when they change.
Units: distance in **tiles**, time in **seconds**, the board is **5 lanes × 9 columns**. Column 0 is next to the gate.

## Economy

Answering correctly is the **only** income. No defender makes energy on its own; that broke the economy in the balance report.

| Rule                | Value                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| Starting energy     | 150                                                                         |
| Correct answer      | +30                                                                         |
| Streak bonus        | +5 per streak step after the first, max +20                                 |
| Fast answer (< 5 s) | +10                                                                         |
| Soul Lantern bonus  | +5 per lantern on the board for each correct answer, max 4 lanterns counted |
| Wrong answer        | +0, streak resets, all ghosts get **Haste** (speed ×1.5) for 6 s            |
| Skip question       | allowed after 3 s, no penalty, no energy, streak kept                       |
| Lives               | 3. A ghost passing x = −0.6 (the gate) costs 1 life and is removed          |

## Defenders

| Defender     | Cost | HP   | Behaviour                                                                                  |
| ------------ | ---- | ---- | ------------------------------------------------------------------------------------------ |
| Soul Lantern | 50   | 300  | Answer amplifier: +5 energy per correct answer (max 4 lanterns count)                      |
| Gargoyle     | 50   | 300  | Fires a bolt down its lane every 1.4 s, 20 damage, bolt speed 6, only if an enemy is ahead |
| Iron Coffin  | 50   | 2000 | Wall. Blocks walkers.                                                                      |
| Salt Rune    | 75   | —    | Trap. Enemies on it: slowed 50% for 3 s. Lasts 30 s                                        |
| Banshee Bell | 150  | 300  | **Unlocked at a 3-answer streak** for this level. Every 20 s: 60 damage to every enemy     |

- One defender per tile. Placing costs energy immediately. Removing refunds 50%.
- Defenders cannot be placed in column 8 (spawn column). Walkers bite within 0.6 tiles.

## Enemies

| Enemy       | HP   | Speed (tiles/s) | Bite   | Special                                                                             |
| ----------- | ---- | --------------- | ------ | ----------------------------------------------------------------------------------- |
| Wisp        | 100  | 0.35            | 20 dps | —                                                                                   |
| Shade       | 60   | 0.8             | 15 dps | Fast                                                                                |
| Bone Knight | 260  | 0.25            | 25 dps | Armour: takes 50% damage from bolts                                                 |
| Wraith      | 140  | 0.4             | 20 dps | Flies over Coffins and Salt Runes, still hit by bolts                               |
| Lich (boss) | 1500 | 0.15            | 50 dps | Shielded until a **boss question** is answered correctly. Shield returns every 20 s |

- Enemies spawn at x = 8.9. Calm mode multiplies all enemy speed by 0.7.

## Levels and waves

- 3 levels × 6 waves. First breather 15 s, then 10 s between waves.
- Wave budget: level 1 starts at 4 and grows ×1.25 per wave; level 2 starts at 6, ×1.32; level 3 starts at 11, ×1.45, density 1.5.
- The Lich arrives in level 3, wave 6, lane 2, at 6 s.

## Balance targets (checked by `tests/balance.test.ts`)

- A bot answering 70% correctly every 6 s wins 10/10 on levels 1–2 and at least 9/10 on level 3.
- A 40% bot loses at least 5/10 on level 3, so knowledge matters.

## Must always be true (property tests check these)

1. Energy is never negative and only changes for a cause: answer, place or refund.
2. Same seed + same command list → identical end state.
3. A tile never holds more than one defender.
4. Every level is beatable by the 70% reference bot.
5. HP never goes up (no heals exist) and an entity at 0 HP is removed the same tick.
