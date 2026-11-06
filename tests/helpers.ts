import { loadGameConfig } from "../src/sim/load";
import { createState, step, type Command, type GameConfig, type SimEvent, type SimState } from "../src/sim";
import type { EnemyKind } from "../src/sim/types";

export const realConfig = (): GameConfig => loadGameConfig();

/** Real numbers, but a tiny custom level: one wave, spawning immediately.
 * With no spawns given, one ghost arrives in the far future so the level doesn't end instantly. */
export function testConfig(
  spawns: { atSec: number; lane: number; kind: EnemyKind }[] = [{ atSec: 9999, lane: 0, kind: "wisp" }],
): GameConfig {
  const base = loadGameConfig();
  return {
    ...base,
    rules: { ...base.rules, firstBreatherSec: 0, breatherSec: 0 },
    levels: [{ id: "test", name: "Test", waves: [{ spawns }] }],
  };
}

export function newGame(config: GameConfig, seed = 1, levelId = "test"): SimState {
  return createState(config, levelId, { seed });
}

/** Run n ticks. Commands are sent on the first tick. Returns every event. */
export function run(state: SimState, config: GameConfig, n: number, first: Command[] = []): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...step(state, config, i === 0 ? first : []));
  return all;
}

export const ofType = <T extends SimEvent["type"]>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

export const correct = (boss = false, fast = false): Command => ({
  type: "answer",
  result: { questionId: "q", correct: true, fast, boss },
});
export const wrong = (): Command => ({ type: "answer", result: { questionId: "q", correct: false, fast: false, boss: false } });
