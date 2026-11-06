# Requirements: Core Game Loop

## Introduction
The playable heart of Grave Guard: a 5×9 lane board, defenders, enemies, waves, Soul Energy earned from quiz
answers, lives, and win/lose. This spec covers the deterministic simulation (`src/sim`), the minimal quiz
hook it needs (`src/quiz`), and a first playable presentation with the real art (`src/render`, `src/ui`).
Rich VFX, the AI forge, the report card and menus have their own specs.
Balance numbers come from `.kiro/steering/game-balance.md` via `src/data/*.json`.

## Requirement 1: Board and placement
**User story:** As a player, I want to place defenders on a clear grid, so that I can plan my defense.

**Acceptance criteria**
1. The board SHALL have 5 lanes and 9 columns; column 0 is next to the gate and column 8 is the spawn column.
2. WHEN the player selects an affordable shop card and then an empty tile in columns 0–7 THEN the system SHALL place that defender and subtract its cost in the same tick.
3. IF the tile is occupied, in column 8, or the player cannot afford the defender THEN the system SHALL reject the placement, change nothing, and emit `placementRejected` with a reason.
4. WHILE a shop card is selected THE system SHALL highlight every valid tile and show a ghost preview under the pointer.
5. WHEN the player removes a defender THEN the system SHALL refund 50% of its cost (rounded down).
6. A tile SHALL never hold more than one defender.

## Requirement 2: Soul Energy from answers
**User story:** As a student, I want correct answers to give me energy, so that learning is how I win.

**Acceptance criteria**
1. The level SHALL start with 150 energy.
2. WHEN the player answers correctly THEN the system SHALL add 30 energy plus the streak bonus (+5 per streak step after the first, max +20) plus +10 if answered in under 5 s, plus +5 for each Soul Lantern on the board (max 4 counted).
3. WHEN the player answers wrongly THEN the system SHALL add no energy, reset the streak, and apply Haste (enemy speed ×1.5) for 6 s.
4. WHEN the player skips a question after at least 3 s THEN the system SHALL show the next question with no reward and no penalty, and the streak SHALL be kept.
5. A new question SHALL appear immediately after each answer or skip; the simulation SHALL keep running the whole time.
6. Energy SHALL never be negative.
7. WHEN the player answers with keys 1–4 THEN the system SHALL treat it as clicking that answer.

## Requirement 3: Defenders
**User story:** As a player, I want defenders with different jobs, so that I make real choices.

**Acceptance criteria**
1. Soul Lantern SHALL produce no energy by itself; it adds +5 energy to every correct answer while it stands (max 4 lanterns counted), so answering stays the only income.
2. Gargoyle SHALL fire a bolt down its lane every 1.4 s for 20 damage, only when an enemy is ahead of it in that lane.
3. Iron Coffin SHALL block walking enemies and has 2000 HP.
4. Salt Rune SHALL slow enemies standing on its tile by 50% for 3 s and disappear after 30 s.
5. Banshee Bell SHALL be locked until the player reaches a 3-answer streak in this level; once unlocked it stays unlocked for the level. Every 20 s it SHALL deal 60 damage to every enemy on the board.
6. WHEN a defender reaches 0 HP THEN the system SHALL remove it in the same tick and emit `defenderDestroyed`.

## Requirement 4: Enemies
**User story:** As a player, I want enemies that behave differently, so that each wave asks for a new plan.

**Acceptance criteria**
1. Enemies SHALL spawn at column 8.9 of the lane given by the wave script and move toward the gate.
2. WHEN a walking enemy reaches a defender in its lane THEN it SHALL stop and bite that defender at its bite rate until the defender is destroyed.
3. Wraith SHALL pass over Iron Coffins and Salt Runes without stopping or being slowed.
4. Bone Knight SHALL take 50% damage from bolts.
5. WHEN an enemy passes the gate (position < 0) THEN the system SHALL remove it, subtract 1 life and emit `gateBreached`.
6. WHEN an enemy reaches 0 HP THEN the system SHALL remove it in the same tick and emit `enemyKilled`.

## Requirement 5: The Lich boss
**User story:** As a player, I want a boss that tests my knowledge, so that the finale feels special.

**Acceptance criteria**
1. The Lich SHALL spawn with an active shield that makes it immune to damage.
2. WHILE the Lich's shield is active THE spellbook SHALL show a boss question, marked as one.
3. WHEN the player answers the boss question correctly THEN the shield SHALL break and energy SHALL be awarded as for a normal correct answer.
4. WHEN 20 s pass after the shield breaks THEN the shield SHALL return and a new boss question SHALL appear.

## Requirement 6: Waves, levels, win and lose
**User story:** As a player, I want clear waves and a clear goal, so that I know how I'm doing.

**Acceptance criteria**
1. Each level SHALL have 6 waves defined in `src/data/levels.json`; the MVP ships 3 levels.
2. Before the first wave the system SHALL wait 15 s, and between waves 10 s, and SHALL show a "Wave X / 6" banner.
3. The player SHALL start each level with 3 lives.
4. WHEN lives reach 0 THEN the level SHALL end in defeat.
5. WHEN the last wave is fully spawned and no enemies remain THEN the level SHALL end in victory.
6. WHEN a level ends THEN the system SHALL emit `levelEnded` with result, accuracy, answers, and the list of missed questions.

## Requirement 7: Determinism and control
**User story:** As a developer, I want the simulation to be predictable, so that we can test and balance it.

**Acceptance criteria**
1. The simulation SHALL advance in fixed 1/60 s ticks, independent of frame rate.
2. The simulation SHALL use only a seeded RNG; the same seed and the same timed command list SHALL produce an identical final state.
3. The player SHALL be able to pause; WHILE paused no ticks run and the question is hidden (no thinking time for free).
4. Calm mode SHALL multiply enemy speed by 0.7.

## Requirement 8: First playable presentation
**User story:** As a judge, I want the first build to already look like the concept art, so that the game feels real.

**Acceptance criteria**
1. The scene SHALL use the real assets from `public/assets/` with the layering in the art-direction steering.
2. Every defender and enemy SHALL be a camera-facing sprite sized by its manifest aspect and placed by its anchor, with a contact shadow.
3. Units SHALL have code-driven idle motion (bob, breathe) and a hit flash.
4. HUD SHALL show wave, energy and lives; the shop SHALL show 5 cards with price and locked/unaffordable states; the spellbook SHALL show the question and 4 answers.
5. Sounds from `public/assets/audio/` SHALL play for answer right/wrong, placement, shooting, hits, deaths, gate damage, wave start; battle music SHALL loop.
6. The game SHALL hold 60 fps on the target laptop during a full wave.
