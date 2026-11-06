import { createState, step, type GameConfig } from "../src/sim";
import { createBot } from "../src/sim/bot";

const MAX_TICKS = 60 * 60 * 15;

/** Play a whole level with the reference bot. */
export function playWithBot(cfg: GameConfig, levelId: string, accuracy: number, seed: number, answerEverySec = 6) {
  const state = createState(cfg, levelId, { seed });
  const bot = createBot(cfg, { accuracy, answerEverySec, seed });
  while (state.result === "playing" && state.tick < MAX_TICKS) step(state, cfg, bot(state));
  return state;
}
