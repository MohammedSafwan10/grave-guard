import { describe, expect, it } from "vitest";
import { playWithBot } from "./bot-play";
import { realConfig } from "./helpers";

const config = realConfig();
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// The reference bot answers every 6 s and places defenders with simple rules. Real players do better,
// so these are floors: a 70% student should comfortably beat the game, a 40% student should struggle at the end.
describe("balance", () => {
  for (const [i, level] of config.levels.entries()) {
    const needed = i === config.levels.length - 1 ? 9 : 10;
    it(`${level.id}: a 70% bot wins at least ${needed}/10`, () => {
      const results = SEEDS.map((seed) => playWithBot(config, level.id, 0.7, seed));
      const wins = results.filter((s) => s.result === "won").length;
      const report = results.map((s) => `${s.result}(lives ${s.lives}, wave ${s.wave.index + 1})`).join(" ");
      expect(wins, report).toBeGreaterThanOrEqual(needed);
    });
  }

  it("the last level is a real challenge: a 40% bot loses at least half the time", () => {
    const last = config.levels[config.levels.length - 1]!;
    const losses = SEEDS.map((seed) => playWithBot(config, last.id, 0.4, seed)).filter((s) => s.result === "lost").length;
    expect(losses).toBeGreaterThanOrEqual(SEEDS.length / 2);
  });
});
