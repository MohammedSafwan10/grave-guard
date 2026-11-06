import { expect, test, type Page } from "@playwright/test";

type Gg = { gg: { battle: { fastForward(s: number): void; state: { energy: number; enemies: unknown[]; tick: number } } | null } };

/** Headless browsers render slowly, so the test skips game time forward instead of waiting. */
const fastForward = (page: Page, seconds: number) =>
  page.evaluate((s) => (window as unknown as Gg).gg.battle?.fastForward(s), seconds);

async function answerCorrectly(page: Page) {
  const prompt = (await page.locator(".book-question").textContent()) ?? "";
  const m = prompt.match(/(\d+) × (\d+)/);
  const want = m ? String(Number(m[1]) * Number(m[2])) : "";
  const texts = await page.locator(".answer-text").allTextContents();
  await page.keyboard.press(String(Math.max(0, texts.indexOf(want)) + 1));
  await page.waitForTimeout(900);
}

test("title → level 1 → answer, place defenders, fight a wave", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Moonbloom Hollow/ })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "e2e-shots/01-title.png" });

  await page.getByRole("button", { name: /Moonbloom Hollow/ }).click();
  await expect(page.locator(".book-question")).not.toBeEmpty();
  for (let i = 0; i < 4; i++) await answerCorrectly(page);
  await expect(page.locator(".energy-value")).not.toHaveText("150");

  const box = await page.locator("#scene").boundingBox();
  if (!box) throw new Error("no canvas");
  const at = (fx: number, fy: number) => [box.width * fx, box.height * fy] as const;
  for (const [key, fx, fy] of [
    ["w", 0.3, 0.42],
    ["w", 0.3, 0.52],
    ["w", 0.3, 0.62],
    ["q", 0.18, 0.52],
  ] as const) {
    await page.keyboard.press(key);
    await page.mouse.click(...at(fx, fy));
    await page.waitForTimeout(150);
  }
  await page.keyboard.press("w");
  await page.mouse.move(...at(0.42, 0.42));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "e2e-shots/02-placing.png" });
  await page.keyboard.press("Escape");

  await fastForward(page, 22);
  await page.waitForTimeout(600);
  await page.screenshot({ path: "e2e-shots/03-wave-1.png" });
  const tick = await page.evaluate(() => (window as unknown as Gg).gg.battle?.state.tick ?? 0);
  expect(tick).toBeGreaterThan(60 * 22);

  await fastForward(page, 6);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "e2e-shots/04-wave-1-later.png" });

  expect(errors, errors.join("\n")).toEqual([]);
});
