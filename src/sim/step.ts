import { cleanup, runBolts, runDefenders, runEnemies } from "./combat";
import type { GameConfig } from "./config";
import { applyAnswer } from "./economy";
import type { Command, SimEvent } from "./events";
import { placeDefender, removeDefender } from "./placement";
import type { SimState } from "./types";
import { endLevel, runWaves } from "./waves";

function applyCommand(state: SimState, config: GameConfig, events: SimEvent[], cmd: Command): void {
  switch (cmd.type) {
    case "pause":
      if (!state.paused) {
        state.paused = true;
        events.push({ type: "paused" });
      }
      return;
    case "resume":
      if (state.paused) {
        state.paused = false;
        events.push({ type: "resumed" });
      }
      return;
    case "setCalm":
      state.calm = cmd.calm;
      return;
  }
  // Gameplay commands are ignored while paused or after the level ends.
  if (state.paused || state.result !== "playing") return;
  switch (cmd.type) {
    case "placeDefender":
      placeDefender(state, config, events, cmd.kind, cmd.lane, cmd.col);
      return;
    case "removeDefender":
      removeDefender(state, config, events, cmd.lane, cmd.col);
      return;
    case "answer":
      applyAnswer(state, config, events, cmd.result);
      return;
    case "skip":
      state.stats.skipped += 1;
      events.push({ type: "skipped" });
      return;
  }
}

/**
 * Advance the simulation by one fixed tick (1/60 s). Mutates `state` and returns what happened.
 * Order is fixed so results are reproducible: commands → waves → defenders → bolts → enemies → cleanup → lose check.
 */
export function step(state: SimState, config: GameConfig, commands: readonly Command[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (const cmd of commands) applyCommand(state, config, events, cmd);
  if (state.paused || state.result !== "playing") return events;

  runWaves(state, config, events);
  if (state.result === "playing") {
    runDefenders(state, config, events);
    runBolts(state, config, events);
    runEnemies(state, config, events);
    cleanup(state, config, events);
    if (state.lives <= 0) endLevel(state, events, "lost");
  }
  state.tick += 1;
  return events;
}
