# Tasks: Core Game Loop

- [x] 1. Project setup
  - Vite + TypeScript strict, Three.js, Vitest, fast-check, zod, Playwright, ESLint + Prettier
  - `npm run dev|test|build|e2e` scripts; MIT LICENSE; README with how to run
  - Folder skeleton from the tech steering doc
  - _Requirements: 8.1_

- [x] 2. Data and schemas
  - [x] 2.1 `defenders.json`, `enemies.json` from the balance steering doc, with zod schemas
  - [x] 2.2 `levels.json` with level 1 hand-authored (6 waves)
  - [x] 2.3 Built-in pack `times-tables.json` (60 questions with explanations)
  - _Requirements: 3, 4, 6.1, 2_

- [x] 3. Simulation core
  - [x] 3.1 Seeded RNG, state factory, command queue, fixed tick runner, event collector
  - [x] 3.2 Placement, removal, refund, rejection reasons
  - [x] 3.3 Energy: answers, streak bonus, fast bonus, haste, skip
  - [x] 3.4 Wave director: breather, spawning, clearing, banners via events
  - [x] 3.5 Enemy movement, blocking, biting; Wraith fly-over; calm mode
  - [x] 3.6 Defenders: lantern answer bonus, gargoyle bolts, coffin wall, salt rune slow + expiry, bell unlock + pulse
  - [x] 3.7 Bolts and damage: armour, deaths, cleanup
  - [x] 3.8 Lives, gate breach, win/lose, `levelEnded` stats
  - [x] 3.9 Lich shield, boss question flag, shield return
  - _Requirements: 1, 2, 3, 4, 5, 6, 7_

- [x] 4. Tests for the simulation
  - [x] 4.1 Unit tests per rule
  - [x] 4.2 Property tests P1–P5
  - [x] 4.3 Balance bot test (70% bot wins all 3 levels, 40% bot loses level 3)
  - _Requirements: 7.2, 1.6, 2.6_

- [x] 5. Quiz hook
  - [x] 5.1 `createQuiz`: no-repeat window, mistake-weighted topics, timing → `AnswerResult`
  - [x] 5.2 Unit + property tests (never repeats within 10, always returns a valid question)
  - _Requirements: 2, 5.2_

- [ ] 6. Asset loading
  - [ ] 6.1 Load manifests, textures and audio buffers with progress; retry screen on failure
  - _Requirements: 8.1_

- [ ] 7. Scene
  - [x] 7.1 Camera, fog, moonlight, background layers, gate foreground
  - [x] 7.2 Board tiles + grass strips, pointer picking, valid-tile highlight and ghost preview
  - [ ] 7.3 `SpriteUnit` with manifest sizing/anchor, contact shadow, hit flash, pooling
  - [x] 7.4 Idle motion per unit type, Bone Knight step-bob, interpolation between ticks
  - [ ] 7.5 Instanced bolts, lantern point lights
  - _Requirements: 8.1, 8.2, 8.3, 1.4_

- [x] 8. UI overlay
  - [x] 8.1 HUD plaques: wave, energy, lives
  - [x] 8.2 Shop cards: price, selected, unaffordable, locked Bell
  - [x] 8.3 Spellbook: question, 4 answers, keys 1–4, skip after 3 s, correct/wrong feedback, boss marker
  - [x] 8.4 Wave banner, pause, win/lose panels (simple), auto-pause on tab hide
  - _Requirements: 8.4, 2.5, 2.7, 6.2, 7.3_

- [ ] 9. Audio
  - [ ] 9.1 Audio context unlock, SFX bus with variants + pitch jitter, music loop and boss crossfade, volume settings
  - _Requirements: 8.5_

- [ ] 10. Playable check
  - [x] 10.1 Playwright smoke test + screenshot
  - [ ] 10.2 Performance check: 60 fps during wave 6 of level 1
  - [x] 10.3 Play it; tune numbers in JSON; update `game-balance.md`
  - _Requirements: 8.6, 6_
