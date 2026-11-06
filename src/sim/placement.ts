import type { GameConfig } from "./config";
import { addEnergy } from "./economy";
import type { RejectReason, SimEvent } from "./events";
import { newId } from "./state";
import { secToTicks, type Defender, type DefenderKind, type SimState } from "./types";

export function defenderAt(state: SimState, lane: number, col: number): Defender | undefined {
  return state.defenders.find((d) => d.lane === lane && d.col === col);
}

/** Why this placement is not allowed, or null if it is. The UI uses this for tile highlights. */
export function placementProblem(
  state: SimState,
  config: GameConfig,
  kind: DefenderKind,
  lane: number,
  col: number,
): RejectReason | null {
  const r = config.rules;
  if (state.result !== "playing") return "notPlaying";
  if (!Number.isInteger(lane) || !Number.isInteger(col) || lane < 0 || lane >= r.lanes || col < 0 || col >= r.cols)
    return "offBoard";
  if (col === r.cols - 1) return "spawnColumn";
  if (defenderAt(state, lane, col)) return "occupied";
  if (kind === "bell" && !state.bellUnlocked) return "locked";
  if (state.energy < config.defenders[kind].cost) return "cantAfford";
  return null;
}

export function placeDefender(
  state: SimState,
  config: GameConfig,
  events: SimEvent[],
  kind: DefenderKind,
  lane: number,
  col: number,
): void {
  const problem = placementProblem(state, config, kind, lane, col);
  if (problem) {
    events.push({ type: "placementRejected", kind, lane, col, reason: problem });
    return;
  }
  const t = state.tick;
  const defs = config.defenders;
  let hp = Infinity;
  let nextActionTick = t;
  let expiresTick: number | null = null;
  switch (kind) {
    case "lantern":
      hp = defs.lantern.hp;
      break;
    case "gargoyle":
      hp = defs.gargoyle.hp;
      nextActionTick = t + secToTicks(0.5);
      break;
    case "coffin":
      hp = defs.coffin.hp;
      break;
    case "rune":
      expiresTick = t + secToTicks(defs.rune.lifetimeSec);
      break;
    case "bell":
      hp = defs.bell.hp;
      nextActionTick = t + secToTicks(2);
      break;
  }
  addEnergy(state, events, -defs[kind].cost, "place", { lane, col });
  const id = newId(state);
  state.defenders.push({ id, kind, lane, col, hp, maxHp: hp, nextActionTick, expiresTick });
  events.push({ type: "defenderPlaced", id, kind, lane, col });
}

export function removeDefender(
  state: SimState,
  config: GameConfig,
  events: SimEvent[],
  lane: number,
  col: number,
): void {
  const d = defenderAt(state, lane, col);
  if (!d || state.result !== "playing") return;
  state.defenders = state.defenders.filter((x) => x !== d);
  for (const e of state.enemies) if (e.biting === d.id) e.biting = null;
  addEnergy(state, events, Math.floor(config.defenders[d.kind].cost * config.rules.refundRatio), "refund", {
    lane,
    col,
  });
  events.push({ type: "defenderRemoved", id: d.id, kind: d.kind, lane, col });
}
