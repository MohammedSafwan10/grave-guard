import type { AnswerResult, DefenderKind, EnemyKind } from "./types";

export type EnergyCause = "answer" | "place" | "refund";
export type RejectReason = "occupied" | "spawnColumn" | "offBoard" | "cantAfford" | "locked" | "notPlaying";

/** Everything the sim tells the outside world. Render, UI and audio only listen to these. */
export type SimEvent =
  | { type: "energyChanged"; delta: number; energy: number; cause: EnergyCause; lane?: number; col?: number }
  | { type: "defenderPlaced"; id: number; kind: DefenderKind; lane: number; col: number }
  | { type: "defenderRemoved"; id: number; kind: DefenderKind; lane: number; col: number }
  | { type: "placementRejected"; kind: DefenderKind; lane: number; col: number; reason: RejectReason }
  | { type: "defenderHit"; id: number; damage: number }
  | { type: "defenderDestroyed"; id: number; kind: DefenderKind; lane: number; col: number }
  | { type: "runeExpired"; id: number; lane: number; col: number }
  | { type: "boltFired"; id: number; from: number; lane: number; x: number }
  | { type: "boltHit"; id: number; enemyId: number; damage: number; blocked: boolean }
  | { type: "enemySpawned"; id: number; kind: EnemyKind; lane: number }
  | { type: "enemyHit"; id: number; damage: number; source: "bolt" | "bell" }
  | { type: "enemyKilled"; id: number; kind: EnemyKind; lane: number; x: number }
  | { type: "enemySlowed"; id: number }
  | { type: "gateBreached"; id: number; kind: EnemyKind; lane: number; lives: number }
  | { type: "shieldBroken"; id: number }
  | { type: "shieldRestored"; id: number }
  | { type: "hasteStarted"; untilTick: number }
  | { type: "bellRang"; id: number; lane: number; col: number }
  | { type: "bellUnlocked" }
  | { type: "answered"; result: AnswerResult; energyGained: number; streak: number }
  | { type: "skipped" }
  | { type: "streakChanged"; streak: number }
  | { type: "waveStarting"; index: number; count: number; inTicks: number }
  | { type: "waveStarted"; index: number; count: number }
  | { type: "waveCleared"; index: number }
  | { type: "paused" }
  | { type: "resumed" }
  | {
      type: "levelEnded";
      result: "won" | "lost";
      correct: number;
      wrong: number;
      skipped: number;
      accuracy: number;
      missed: string[];
      kills: number;
    };

export type Command =
  | { type: "placeDefender"; kind: DefenderKind; lane: number; col: number }
  | { type: "removeDefender"; lane: number; col: number }
  | { type: "answer"; result: AnswerResult }
  | { type: "skip" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "setCalm"; calm: boolean };
