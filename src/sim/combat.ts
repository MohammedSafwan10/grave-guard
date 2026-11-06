import type { GameConfig } from "./config";
import type { SimEvent } from "./events";
import { newId } from "./state";
import { DT, secToTicks, type Defender, type Enemy, type SimState } from "./types";

const onBoard = (config: GameConfig, e: Enemy): boolean => e.x <= config.rules.spawnX + 0.01;

/** Lantern income, gargoyle shots, bell pulses, rune slow and expiry. */
export function runDefenders(state: SimState, config: GameConfig, events: SimEvent[]): void {
  const defs = config.defenders;
  const t = state.tick;
  for (const d of [...state.defenders]) {
    switch (d.kind) {
      case "lantern":
        // Passive: boosts answer rewards (see economy.ts).
        break;
      case "gargoyle":
        // The timer stays "ready" while the lane is empty, so it shoots the moment a ghost shows up.
        if (t >= d.nextActionTick && state.enemies.some((e) => e.lane === d.lane && e.x > d.col && onBoard(config, e))) {
          const id = newId(state);
          const x = d.col + 0.35;
          state.bolts.push({ id, lane: d.lane, x, damage: defs.gargoyle.damage, speed: defs.gargoyle.boltSpeed });
          events.push({ type: "boltFired", id, from: d.id, lane: d.lane, x });
          d.nextActionTick = t + secToTicks(defs.gargoyle.fireEverySec);
        }
        break;
      case "bell":
        if (t >= d.nextActionTick && state.enemies.some((e) => onBoard(config, e))) {
          events.push({ type: "bellRang", id: d.id, lane: d.lane, col: d.col });
          for (const e of state.enemies) damageEnemy(e, defs.bell.pulseDamage, "bell", events);
          d.nextActionTick = t + secToTicks(defs.bell.pulseEverySec);
        }
        break;
      case "rune":
        if (d.expiresTick !== null && t >= d.expiresTick) {
          state.defenders = state.defenders.filter((x) => x !== d);
          events.push({ type: "runeExpired", id: d.id, lane: d.lane, col: d.col });
          break;
        }
        for (const e of state.enemies) {
          if (e.lane !== d.lane || config.enemies[e.kind].flies || Math.abs(e.x - d.col) >= 0.5) continue;
          if (e.slowUntil <= t) events.push({ type: "enemySlowed", id: e.id });
          e.slowUntil = t + secToTicks(defs.rune.slowSec);
        }
        break;
      case "coffin":
        break;
    }
  }
}

function damageEnemy(e: Enemy, amount: number, source: "bolt" | "bell", events: SimEvent[]): number {
  if (e.shield || e.hp <= 0) return 0;
  e.hp -= amount;
  events.push({ type: "enemyHit", id: e.id, damage: amount, source });
  return amount;
}

export function runBolts(state: SimState, config: GameConfig, events: SimEvent[]): void {
  const keep = [];
  for (const b of state.bolts) {
    b.x += b.speed * DT;
    let target: Enemy | undefined;
    for (const e of state.enemies) {
      if (e.lane !== b.lane || e.hp <= 0 || e.x - 0.25 > b.x || e.x < b.x - 1) continue;
      if (!target || e.x < target.x) target = e;
    }
    if (target) {
      const armor = config.enemies[target.kind].boltArmor ?? 1;
      const dealt = damageEnemy(target, b.damage * armor, "bolt", events);
      events.push({ type: "boltHit", id: b.id, enemyId: target.id, damage: dealt, blocked: target.shield });
    } else if (b.x <= config.rules.cols) {
      keep.push(b);
    }
  }
  state.bolts = keep;
}

function blockerFor(state: SimState, config: GameConfig, e: Enemy): Defender | undefined {
  const flies = config.enemies[e.kind].flies === true;
  let best: Defender | undefined;
  for (const d of state.defenders) {
    if (d.lane !== e.lane || d.kind === "rune" || (flies && d.kind === "coffin")) continue;
    const gap = e.x - d.col;
    if (gap <= 0 || gap > config.rules.blockReach) continue;
    if (!best || d.col > best.col) best = d;
  }
  return best;
}

export function enemySpeed(state: SimState, config: GameConfig, e: Enemy): number {
  const r = config.rules;
  let speed = config.enemies[e.kind].speed;
  if (state.tick < state.hasteUntil) speed *= r.hasteMult;
  if (state.tick < e.slowUntil) speed *= config.defenders.rune.slowFactor;
  if (state.calm) speed *= r.calmSpeedMult;
  return speed;
}

export function runEnemies(state: SimState, config: GameConfig, events: SimEvent[]): void {
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    if (!e.shield && e.shieldReturnTick !== null && state.tick >= e.shieldReturnTick) {
      e.shield = true;
      e.shieldReturnTick = null;
      events.push({ type: "shieldRestored", id: e.id });
    }
    const blocker = blockerFor(state, config, e);
    if (blocker) {
      e.biting = blocker.id;
      const bite = config.enemies[e.kind].biteDps * DT;
      blocker.hp -= bite;
      events.push({ type: "defenderHit", id: blocker.id, damage: bite });
    } else {
      e.biting = null;
      e.x -= enemySpeed(state, config, e) * DT;
    }
  }
}

/** Removes dead units and ghosts that reached the gate. Runs after all damage for the tick. */
export function cleanup(state: SimState, config: GameConfig, events: SimEvent[]): void {
  const deadDefenders = state.defenders.filter((d) => d.hp <= 0);
  if (deadDefenders.length) {
    state.defenders = state.defenders.filter((d) => d.hp > 0);
    for (const d of deadDefenders) {
      events.push({ type: "defenderDestroyed", id: d.id, kind: d.kind, lane: d.lane, col: d.col });
      for (const e of state.enemies) if (e.biting === d.id) e.biting = null;
    }
  }
  const alive = [];
  for (const e of state.enemies) {
    if (e.hp <= 0) {
      state.stats.kills += 1;
      events.push({ type: "enemyKilled", id: e.id, kind: e.kind, lane: e.lane, x: e.x });
    } else if (e.x < config.rules.gateX) {
      state.lives = Math.max(0, state.lives - 1);
      events.push({ type: "gateBreached", id: e.id, kind: e.kind, lane: e.lane, lives: state.lives });
    } else {
      alive.push(e);
    }
  }
  state.enemies = alive;
}
