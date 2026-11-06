import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createState, DEFENDER_KINDS, step, type Command, type GameConfig, type SimEvent, type SimState } from "../src/sim";
import { realConfig } from "./helpers";

const config = realConfig();
const TICKS = 60 * 60 * 3; // 3 minutes of play

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      type: fc.constant("placeDefender" as const),
      kind: fc.constantFrom(...DEFENDER_KINDS),
      lane: fc.integer({ min: -1, max: 5 }),
      col: fc.integer({ min: -1, max: 9 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant("removeDefender" as const),
      lane: fc.integer({ min: 0, max: 4 }),
      col: fc.integer({ min: 0, max: 8 }),
    }),
  },
  {
    weight: 6,
    arbitrary: fc.record({
      type: fc.constant("answer" as const),
      result: fc.record({ questionId: fc.constant("q"), correct: fc.boolean(), fast: fc.boolean(), boss: fc.boolean() }),
    }),
  },
  { weight: 1, arbitrary: fc.constant<Command>({ type: "skip" }) },
  { weight: 1, arbitrary: fc.constant<Command>({ type: "pause" }) },
  { weight: 1, arbitrary: fc.constant<Command>({ type: "resume" }) },
);

const scriptArb = fc.record({
  seed: fc.integer(),
  levelId: fc.constantFrom(...config.levels.map((l) => l.id)),
  commands: fc.array(fc.tuple(fc.integer({ min: 0, max: TICKS - 1 }), commandArb), { maxLength: 250 }),
});
type Script = { seed: number; levelId: string; commands: [number, Command][] };

/** Play a script. `onStep` sees the state before and after every step. Pauses are lifted at the end of the script window. */
function play(cfg: GameConfig, script: Script, onStep?: (before: SimState, after: SimState, events: SimEvent[]) => void) {
  const state = createState(cfg, script.levelId, { seed: script.seed });
  const byTick = new Map<number, Command[]>();
  for (const [t, c] of script.commands) byTick.set(t, [...(byTick.get(t) ?? []), c]);
  const log: SimEvent[] = [];
  for (let i = 0; i < TICKS; i++) {
    const before = onStep ? structuredClone(state) : state;
    const cmds = byTick.get(i) ?? [];
    const events = step(state, cfg, i === TICKS - 1 ? [...cmds, { type: "resume" }] : cmds);
    onStep?.(before, state, events);
    log.push(...events);
    if (state.result !== "playing") break;
  }
  return { state, log };
}

const runs = { numRuns: 40 };

describe("simulation properties", () => {
  it("P1: energy is never negative and every change has an event with a cause", () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        play(config, script, (before, after, events) => {
          expect(after.energy).toBeGreaterThanOrEqual(0);
          const explained = events
            .filter((e) => e.type === "energyChanged")
            .reduce((sum, e) => sum + (e.type === "energyChanged" ? e.delta : 0), 0);
          expect(after.energy - before.energy).toBe(explained);
        });
      }),
      runs,
    );
  });

  it("P2: same seed and commands give the same game", () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        const a = play(config, script);
        const b = play(config, script);
        expect(b.state).toEqual(a.state);
        expect(b.log).toEqual(a.log);
      }),
      { numRuns: 15 },
    );
  });

  it("P3 + P4: one defender per tile, and nothing at 0 HP survives a tick", () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        play(config, script, (_b, after) => {
          const tiles = after.defenders.map((d) => `${d.lane},${d.col}`);
          expect(new Set(tiles).size).toBe(tiles.length);
          expect(after.defenders.every((d) => d.hp > 0)).toBe(true);
          expect(after.enemies.every((e) => e.hp > 0)).toBe(true);
          expect(after.defenders.every((d) => d.col >= 0 && d.col < config.rules.cols - 1)).toBe(true);
        });
      }),
      runs,
    );
  });

  it("P5: lives only drop on a gate breach, and the level ends exactly at 0 lives or after the last wave", () => {
    fc.assert(
      fc.property(scriptArb, (script) => {
        play(config, script, (before, after, events) => {
          const breaches = events.filter((e) => e.type === "gateBreached").length;
          expect(before.lives - after.lives).toBe(Math.min(breaches, before.lives));
          const ended = events.filter((e) => e.type === "levelEnded");
          expect(ended.length).toBeLessThanOrEqual(1);
          if (after.lives === 0) expect(after.result).toBe("lost");
          if (after.result === "won") {
            expect(after.wave.index).toBe(after.wave.count - 1);
            expect(after.enemies).toHaveLength(0);
          }
          if (before.result === "playing" && after.result !== "playing") expect(ended).toHaveLength(1);
        });
      }),
      runs,
    );
  });
});
