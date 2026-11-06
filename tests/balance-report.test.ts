// Balance report. Not part of the normal test run. Use:  $env:REPORT=1; npx vitest run tests/balance-report.test.ts
import { it } from "vitest";
import { realConfig } from "./helpers";
import { playWithBot } from "./bot-play";

it.skipIf(!process.env.REPORT)("balance report", () => {
  const config = realConfig();
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const rows: string[] = [];
  for (const level of config.levels) {
    for (const acc of [0.3, 0.4, 0.5, 0.6, 0.7, 0.9]) {
      const res = seeds.map((s) => playWithBot(config, level.id, acc, s));
      const wins = res.filter((r) => r.result === "won").length;
      const lives = res.reduce((a, r) => a + r.lives, 0) / res.length;
      const bank = res.reduce((a, r) => a + r.energy, 0) / res.length;
      const defenders = res.reduce((a, r) => a + r.defenders.length, 0) / res.length;
      const reached = res.reduce((a, r) => a + r.wave.index + 1, 0) / res.length;
      rows.push(
        `${level.id} acc ${acc}: win ${wins}/10, lives ${lives.toFixed(1)}, wave ${reached.toFixed(1)}, ` +
          `unspent ${bank.toFixed(0)}, defenders ${defenders.toFixed(1)}`,
      );
    }
  }
  console.log("\n" + rows.join("\n"));
});
