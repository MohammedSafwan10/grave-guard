import type { GameConfig } from "./config";
import { createRng } from "./rng";
import { secToTicks, type SimState } from "./types";

export interface SimOptions {
  seed: number;
  calm?: boolean;
}

export function createState(config: GameConfig, levelId: string, opts: SimOptions): SimState {
  const level = config.levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`Unknown level "${levelId}"`);
  return {
    levelId,
    tick: 0,
    rng: createRng(opts.seed),
    nextId: 1,
    paused: false,
    calm: opts.calm ?? false,
    energy: config.rules.startEnergy,
    lives: config.rules.lives,
    streak: 0,
    bestStreak: 0,
    bellUnlocked: false,
    hasteUntil: 0,
    wave: {
      index: 0,
      count: level.waves.length,
      status: "breather",
      statusUntil: secToTicks(config.rules.firstBreatherSec),
      queue: [],
      announced: false,
    },
    defenders: [],
    enemies: [],
    bolts: [],
    stats: { correct: 0, wrong: 0, skipped: 0, missed: [], kills: 0, energyEarned: 0 },
    result: "playing",
  };
}

export function newId(state: SimState): number {
  return state.nextId++;
}
