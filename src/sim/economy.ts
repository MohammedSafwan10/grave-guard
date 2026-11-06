import type { GameConfig } from "./config";
import type { EnergyCause, SimEvent } from "./events";
import { secToTicks, type AnswerResult, type SimState } from "./types";

/** The only way energy changes. Every change emits an event with its cause. */
export function addEnergy(
  state: SimState,
  events: SimEvent[],
  delta: number,
  cause: EnergyCause,
  where?: { lane: number; col: number },
): void {
  if (delta === 0) return;
  const next = state.energy + delta;
  if (next < 0) throw new Error(`Energy would go negative (${state.energy} + ${delta}, ${cause})`);
  state.energy = next;
  if (delta > 0) state.stats.energyEarned += delta;
  events.push({ type: "energyChanged", delta, energy: next, cause, ...where });
}

/** Energy for a correct answer at the given streak (streak already includes this answer).
 * Soul Lanterns amplify answers instead of producing energy on their own, so knowledge stays the only income. */
export function answerReward(config: GameConfig, streak: number, fast: boolean, lanterns = 0): number {
  const r = config.rules;
  const lantern = config.defenders.lantern;
  const bonus = Math.min(r.streakMax, r.streakStep * Math.max(0, streak - 1));
  return r.correctEnergy + bonus + (fast ? r.fastBonus : 0) + Math.min(lanterns, lantern.maxCounted) * lantern.answerBonus;
}

export function lanternCount(state: SimState): number {
  return state.defenders.filter((d) => d.kind === "lantern").length;
}

export function applyAnswer(state: SimState, config: GameConfig, events: SimEvent[], result: AnswerResult): void {
  if (result.correct) {
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.stats.correct += 1;
    const gain = answerReward(config, state.streak, result.fast, lanternCount(state));
    addEnergy(state, events, gain, "answer");
    events.push({ type: "answered", result, energyGained: gain, streak: state.streak });
    events.push({ type: "streakChanged", streak: state.streak });
    if (result.boss) {
      const lich = state.enemies.find((e) => e.shield);
      if (lich) {
        lich.shield = false;
        lich.shieldReturnTick = state.tick + secToTicks(config.enemies[lich.kind].shieldReturnSec ?? 20);
        events.push({ type: "shieldBroken", id: lich.id });
      }
    }
    if (!state.bellUnlocked && state.streak >= config.defenders.bell.unlockStreak) {
      state.bellUnlocked = true;
      events.push({ type: "bellUnlocked" });
    }
  } else {
    const hadStreak = state.streak > 0;
    state.streak = 0;
    state.stats.wrong += 1;
    state.stats.missed.push(result.questionId);
    state.hasteUntil = state.tick + secToTicks(config.rules.hasteSec);
    events.push({ type: "answered", result, energyGained: 0, streak: 0 });
    if (hadStreak) events.push({ type: "streakChanged", streak: 0 });
    events.push({ type: "hasteStarted", untilTick: state.hasteUntil });
  }
}
