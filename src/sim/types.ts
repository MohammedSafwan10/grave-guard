import type { DEFENDER_KINDS, ENEMY_KINDS } from "./config";
import type { Rng } from "./rng";

export type DefenderKind = (typeof DEFENDER_KINDS)[number];
export type EnemyKind = (typeof ENEMY_KINDS)[number];

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const secToTicks = (sec: number): number => Math.round(sec * TICK_HZ);

export interface Defender {
  id: number;
  kind: DefenderKind;
  lane: number;
  col: number;
  /** Infinity for the Salt Rune, which can't be bitten. */
  hp: number;
  maxHp: number;
  /** Tick of the next action (income, shot, pulse) or expiry for runes. */
  nextActionTick: number;
  expiresTick: number | null;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  lane: number;
  x: number;
  hp: number;
  maxHp: number;
  slowUntil: number;
  /** Defender id currently being bitten, or null when moving. */
  biting: number | null;
  shield: boolean;
  shieldReturnTick: number | null;
}

export interface Bolt {
  id: number;
  lane: number;
  x: number;
  damage: number;
  speed: number;
}

export interface Spawn {
  tick: number;
  lane: number;
  kind: EnemyKind;
}

export type WaveStatus = "breather" | "spawning" | "clearing" | "done";

export interface AnswerResult {
  questionId: string;
  correct: boolean;
  /** Answered within the fast-bonus window. */
  fast: boolean;
  /** This was a boss (shield) question. */
  boss: boolean;
}

export interface SimState {
  levelId: string;
  tick: number;
  rng: Rng;
  nextId: number;
  paused: boolean;
  calm: boolean;
  energy: number;
  lives: number;
  streak: number;
  bestStreak: number;
  bellUnlocked: boolean;
  hasteUntil: number;
  wave: {
    index: number;
    count: number;
    status: WaveStatus;
    statusUntil: number;
    queue: Spawn[];
    /** The "wave starting" banner for the current breather has been sent. */
    announced: boolean;
  };
  defenders: Defender[];
  enemies: Enemy[];
  bolts: Bolt[];
  stats: {
    correct: number;
    wrong: number;
    skipped: number;
    missed: string[];
    kills: number;
    energyEarned: number;
  };
  result: "playing" | "won" | "lost";
}
