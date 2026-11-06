# Review of current Kiro build — 2026-11-06

Scope: snapshot review while Claude is actively editing. No gameplay source was changed by this review.

## Confirmed issues

1. High: duplicate answer rewards. src/app/battle.ts:188-198 only locks the book immediately
   for wrong answers. Correct submissions stay unlocked until a later sim tick. Repeated
   synchronous button clicks enqueue multiple rewards for the same question. Browser test
   submitted the same correct option ten times; HUD reached 600 from 150 and streak x10.
   Lock input synchronously on submission and associate rewards with a unique question
   attempt; cover rapid clicks and keyboard input in a browser-level test.

2. Medium: quiz timers advance during pause. src/app/battle.ts:177-198 uses wall-clock
   setTimeout for question transitions and skip availability without suspending these timers
   in togglePause. Browser reproduction: answer, immediately Escape, wait 2.6 seconds;
   prompt changed from 11 x 11 to 6 x 6 while .battle.paused remained true. Freeze and
   restore the remaining quiz delays and active answer elapsed time on pause/resume.

3. Visual: desktop screenshot shows tiny unit illustrations in shop cards, spellbook title
   overlapping the top wooden decoration, and a large dark ground area around a relatively
   small board. Recheck card percentage sizing, parchment content bounds and board framing
   against docs/concept/concept_main.png before calling this visually polished.

4. Test reliability: npm test returned 40 pass, 1 fail (timeout), 1 skip. Failing test:
   tests/sim-properties.test.ts P3 + P4. Rerunning that file with --testTimeout=20000 still
   timed out. No invariant counterexample was returned, so this is not evidence the
   simulation invariant itself is false. Investigate test workload/shrinking and record a
   deterministic seed; do not mark the suite green.

## Passing evidence

- npm run build: passed (TypeScript plus Vite production build).
- npm run lint: passed.
- Browser boot, level start, quiz rendering and reward feedback work.
- Existing architecture separates deterministic sim, quiz, render, UI and audio.
- Asset pipeline includes WebP output and art/audio manifests.
- .kiro specs/steering and LICENSE exist.

## Remaining scope / caveats

This is 2.5D: painted unit sprites on a 3D battlefield, as documented by the current plan,
not fully modeled 3D units. There is currently no .git repository in this workspace.
Public GitHub submission and runtime deployment remain future work.
No full level, mobile layout, performance, audio quality or release-readiness claim was
verified in this review. Browser launch through Playwright failed EBUSY, so direct Chrome
DevTools browser tools were used for reproduction instead. Screenshot was inspected at:
C:/Users/Thumbeja/AppData/Local/Temp/chrome-devtools-mcp-QXKduQ/screenshot.png.

Suggested order: fix duplicate scoring, fix pause semantics, make property suite stable,
repair desktop layout, then playtest full win/lose/retry and mobile.

