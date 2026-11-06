import { test } from "@playwright/test";

test.skip(!process.env.DEBUG_E2E, "debug only");

test("debug: does the sim advance?", async ({ page }) => {
  page.on("console", (m) => console.log("console:", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("pageerror:", e.message, e.stack));
  await page.goto("/");
  await page.getByRole("button", { name: /Moonbloom Hollow/ }).click({ timeout: 30_000 });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => {
      const b = (window as unknown as { gg: { battle: { state: { tick: number; paused: boolean; result: string; energy: number } } | null } }).gg.battle;
      return b ? { tick: b.state.tick, paused: b.state.paused, result: b.state.result, energy: b.state.energy, hidden: document.hidden } : null;
    });
    console.log(JSON.stringify(s));
  }
});
