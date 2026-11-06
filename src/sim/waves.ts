import type { GameConfig } from "./config";
import type { SimEvent } from "./events";
import { newId } from "./state";
import { secToTicks, type Enemy, type EnemyKind, type SimState } from "./types";

export function spawnEnemy(
  state: SimState,
  config: GameConfig,
  events: SimEvent[],
  kind: EnemyKind,
  lane: number,
): Enemy {
  const def = config.enemies[kind];
  const enemy: Enemy = {
    id: newId(state),
    kind,
    lane,
    x: config.rules.spawnX,
    hp: def.hp,
    maxHp: def.hp,
    slowUntil: 0,
    biting: null,
    shield: def.boss === true,
    shieldReturnTick: null,
  };
  state.enemies.push(enemy);
  events.push({ type: "enemySpawned", id: enemy.id, kind, lane });
  return enemy;
}

/** Breather → spawning → clearing → next wave (or victory). */
export function runWaves(state: SimState, config: GameConfig, events: SimEvent[]): void {
  const w = state.wave;
  const level = config.levels.find((l) => l.id === state.levelId);
  if (!level) return;

  if (w.status === "breather") {
    if (!w.announced) {
      w.announced = true;
      events.push({
        type: "waveStarting",
        index: w.index,
        count: w.count,
        inTicks: w.statusUntil - state.tick,
      });
    }
    if (state.tick >= w.statusUntil) {
      const wave = level.waves[w.index];
      w.queue = (wave?.spawns ?? []).map((s) => ({
        tick: state.tick + secToTicks(s.atSec),
        lane: s.lane,
        kind: s.kind,
      }));
      w.status = "spawning";
      events.push({ type: "waveStarted", index: w.index, count: w.count });
    }
  }

  if (w.status === "spawning") {
    while (w.queue.length > 0 && (w.queue[0]?.tick ?? Infinity) <= state.tick) {
      const s = w.queue.shift();
      if (s) spawnEnemy(state, config, events, s.kind, s.lane);
    }
    if (w.queue.length === 0) w.status = "clearing";
  }

  if (w.status === "clearing" && state.enemies.length === 0) {
    events.push({ type: "waveCleared", index: w.index });
    if (w.index >= w.count - 1) {
      w.status = "done";
      endLevel(state, events, "won");
    } else {
      w.index += 1;
      w.status = "breather";
      w.statusUntil = state.tick + secToTicks(config.rules.breatherSec);
      w.announced = false;
    }
  }
}

export function endLevel(state: SimState, events: SimEvent[], result: "won" | "lost"): void {
  if (state.result !== "playing") return;
  state.result = result;
  const s = state.stats;
  const answered = s.correct + s.wrong;
  events.push({
    type: "levelEnded",
    result,
    correct: s.correct,
    wrong: s.wrong,
    skipped: s.skipped,
    accuracy: answered === 0 ? 0 : s.correct / answered,
    missed: [...s.missed],
    kills: s.kills,
  });
}
