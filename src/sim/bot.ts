import type { GameConfig } from "./config";
import type { Command } from "./events";
import { defenderAt, placementProblem } from "./placement";
import { createRng, nextFloat, type Rng } from "./rng";
import { secToTicks, type DefenderKind, type SimState } from "./types";

export interface BotOptions {
  /** Chance of answering correctly. */
  accuracy: number;
  /** Seconds between answers (a real student takes ~4-8 s). */
  answerEverySec: number;
  seed: number;
}

/**
 * A simple scripted player. Used to prove every level is beatable at 70% accuracy,
 * and later for the title-screen demo. Deliberately not clever: real players should do better.
 */
export function createBot(config: GameConfig, opts: BotOptions) {
  const rng: Rng = createRng(opts.seed ^ 0x5eed);
  const answerEvery = secToTicks(opts.answerEverySec);
  const thinkEvery = 30;
  let nextAnswer = answerEvery;
  let n = 0;

  function tryPlace(state: SimState, kind: DefenderKind, lane: number, cols: number[]): Command | null {
    for (const col of cols) {
      if (placementProblem(state, config, kind, lane, col) === null) return { type: "placeDefender", kind, lane, col };
    }
    return null;
  }

  function decide(state: SimState): Command | null {
    const lanes = config.rules.lanes;
    const count = (kind: DefenderKind, lane?: number) =>
      state.defenders.filter((d) => d.kind === kind && (lane === undefined || d.lane === lane)).length;
    const threat = (lane: number) =>
      state.enemies.filter((e) => e.lane === lane).reduce((a, e) => a + e.hp, 0);

    // 1. Any lane with ghosts and no gargoyle gets one.
    for (let lane = 0; lane < lanes; lane++) {
      if (threat(lane) > 0 && count("gargoyle", lane) === 0) {
        const c = tryPlace(state, "gargoyle", lane, [1, 2, 3]);
        if (c) return c;
      }
    }
    // 2. Lanes with more ghosts than one gargoyle can handle get a second one.
    for (let lane = 0; lane < lanes; lane++) {
      if (threat(lane) > 150 && count("gargoyle", lane) < 2) {
        const c = tryPlace(state, "gargoyle", lane, [1, 2, 3]);
        if (c) return c;
      }
    }
    // 3. Economy: up to 4 lanterns in column 0, once every lane is covered.
    const covered = [...Array(lanes).keys()].every((lane) => count("gargoyle", lane) > 0);
    if (covered && count("lantern") < 4) {
      for (const lane of [2, 1, 3, 0, 4]) {
        if (!defenderAt(state, lane, 0)) {
          const c = tryPlace(state, "lantern", lane, [0]);
          if (c) return c;
        }
      }
    }
    // 3. Bell once unlocked.
    if (state.bellUnlocked && count("bell") === 0) {
      const c = tryPlace(state, "bell", 2, [0, 4, 5]);
      if (c) return c;
    }
    // 4. Coffin in front of lanes with heavy enemies.
    for (let lane = 0; lane < lanes; lane++) {
      if (state.enemies.some((e) => e.lane === lane && (e.kind === "boneKnight" || e.kind === "lich")) && count("coffin", lane) === 0) {
        const c = tryPlace(state, "coffin", lane, [5, 6, 4]);
        if (c) return c;
      }
    }
    // 5. More gargoyles where the threat is highest, otherwise spread evenly.
    const order = [...Array(lanes).keys()].sort((a, b) => threat(b) - threat(a) || count("gargoyle", a) - count("gargoyle", b));
    for (const lane of order) {
      if (count("gargoyle", lane) < 4) {
        const c = tryPlace(state, "gargoyle", lane, [1, 2, 3, 4, 5]);
        if (c) return c;
      }
    }
    return null;
  }

  /** Commands for this tick. */
  return function play(state: SimState): Command[] {
    const cmds: Command[] = [];
    if (state.result !== "playing" || state.paused) return cmds;
    if (state.tick >= nextAnswer) {
      nextAnswer = state.tick + answerEvery;
      const boss = state.enemies.some((e) => e.shield);
      const correct = nextFloat(rng) < opts.accuracy;
      cmds.push({
        type: "answer",
        result: { questionId: `bot-${n++}`, correct, fast: correct && nextFloat(rng) < 0.3, boss },
      });
    }
    if (state.tick % thinkEvery === 0) {
      const c = decide(state);
      if (c) cmds.push(c);
    }
    return cmds;
  };
}
