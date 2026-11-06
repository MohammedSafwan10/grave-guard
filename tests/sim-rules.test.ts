import { describe, expect, it } from "vitest";
import { secToTicks, step } from "../src/sim";
import { correct, newGame, ofType, run, testConfig, wrong } from "./helpers";

describe("placement", () => {
  it("places an affordable defender and charges its cost", () => {
    const c = testConfig();
    const s = newGame(c);
    const ev = step(s, c, [{ type: "placeDefender", kind: "gargoyle", lane: 2, col: 3 }]);
    expect(s.defenders).toHaveLength(1);
    expect(s.energy).toBe(c.rules.startEnergy - 50);
    expect(ofType(ev, "defenderPlaced")).toHaveLength(1);
  });

  it.each([
    ["occupied", { lane: 2, col: 3 }],
    ["spawnColumn", { lane: 2, col: 8 }],
    ["offBoard", { lane: 5, col: 0 }],
    ["offBoard", { lane: 0, col: -1 }],
  ] as const)("rejects %s", (reason, at) => {
    const c = testConfig();
    const s = newGame(c);
    step(s, c, [{ type: "placeDefender", kind: "coffin", lane: 2, col: 3 }]);
    const before = structuredClone(s);
    const ev = step(s, c, [{ type: "placeDefender", kind: "lantern", ...at }]);
    expect(ofType(ev, "placementRejected")[0]?.reason).toBe(reason);
    expect(s.defenders).toEqual(before.defenders);
    expect(s.energy).toBe(before.energy);
  });

  it("rejects when you can't afford it, and the locked bell", () => {
    const c = testConfig();
    const s = newGame(c);
    expect(ofType(step(s, c, [{ type: "placeDefender", kind: "bell", lane: 0, col: 0 }]), "placementRejected")[0]?.reason).toBe(
      "locked",
    );
    step(s, c, [{ type: "placeDefender", kind: "gargoyle", lane: 0, col: 0 }]);
    step(s, c, [{ type: "placeDefender", kind: "gargoyle", lane: 1, col: 0 }]);
    step(s, c, [{ type: "placeDefender", kind: "gargoyle", lane: 2, col: 0 }]);
    const ev = step(s, c, [{ type: "placeDefender", kind: "lantern", lane: 3, col: 0 }]);
    expect(ofType(ev, "placementRejected")[0]?.reason).toBe("cantAfford");
    expect(s.energy).toBe(0);
  });

  it("refunds 50% (rounded down) on removal", () => {
    const c = testConfig();
    const s = newGame(c);
    step(s, c, [{ type: "placeDefender", kind: "lantern", lane: 0, col: 0 }]);
    step(s, c, [{ type: "removeDefender", lane: 0, col: 0 }]);
    expect(s.energy).toBe(c.rules.startEnergy - 50 + 25);
    expect(s.defenders).toHaveLength(0);
  });
});

describe("energy from answers", () => {
  it("pays 30, then streak bonus +5 per step up to +20, plus fast bonus", () => {
    const c = testConfig();
    const s = newGame(c);
    const gains: number[] = [];
    for (let i = 0; i < 7; i++) gains.push(ofType(step(s, c, [correct()]), "answered")[0]!.energyGained);
    expect(gains).toEqual([30, 35, 40, 45, 50, 50, 50]);
    const fast = ofType(step(s, c, [correct(false, true)]), "answered")[0]!;
    expect(fast.energyGained).toBe(60);
  });

  it("wrong answer: no energy, streak resets, ghosts get haste", () => {
    const c = testConfig([{ atSec: 0, lane: 0, kind: "wisp" }]);
    const s = newGame(c);
    step(s, c, [correct()]);
    step(s, c, [correct()]);
    const energy = s.energy;
    const ev = step(s, c, [wrong()]);
    expect(s.energy).toBe(energy);
    expect(s.streak).toBe(0);
    expect(ofType(ev, "hasteStarted")).toHaveLength(1);
    const x0 = s.enemies[0]!.x;
    step(s, c);
    expect(x0 - s.enemies[0]!.x).toBeCloseTo((0.35 * c.rules.hasteMult) / 60, 6);
  });

  it("unlocks the bell at a 3-answer streak and keeps it after a miss", () => {
    const c = testConfig();
    const s = newGame(c);
    step(s, c, [correct()]);
    step(s, c, [correct()]);
    expect(ofType(step(s, c, [correct()]), "bellUnlocked")).toHaveLength(1);
    step(s, c, [wrong()]);
    expect(s.bellUnlocked).toBe(true);
  });

  it("skip gives nothing and keeps the streak", () => {
    const c = testConfig();
    const s = newGame(c);
    step(s, c, [correct()]);
    const e = s.energy;
    step(s, c, [{ type: "skip" }]);
    expect(s.energy).toBe(e);
    expect(s.streak).toBe(1);
  });
});

describe("defenders", () => {
  it("each lantern adds +5 to every correct answer, counting up to 4 lanterns", () => {
    const c = testConfig();
    const s = newGame(c);
    s.energy = 1000;
    const place = (lane: number) => step(s, c, [{ type: "placeDefender", kind: "lantern", lane, col: 0 }]);
    const reward = () => ofType(step(s, c, [wrong(), correct()]), "answered")[1]!.energyGained;
    expect(reward()).toBe(30);
    place(0);
    expect(reward()).toBe(35);
    [1, 2, 3, 4].forEach(place);
    expect(reward()).toBe(50);
  });

  it("gargoyle kills a wisp before it reaches the gargoyle", () => {
    const c = testConfig([{ atSec: 0, lane: 2, kind: "wisp" }]);
    const s = newGame(c);
    const ev = run(s, c, secToTicks(30), [{ type: "placeDefender", kind: "gargoyle", lane: 2, col: 1 }]);
    expect(ofType(ev, "enemyKilled")).toHaveLength(1);
    expect(s.defenders[0]!.hp).toBe(300);
    expect(ofType(ev, "boltFired").length).toBe(5); // 100 hp / 20 damage
  });

  it("gargoyle doesn't shoot at an empty lane", () => {
    const c = testConfig([{ atSec: 0, lane: 4, kind: "wisp" }]);
    const s = newGame(c);
    const ev = run(s, c, secToTicks(5), [{ type: "placeDefender", kind: "gargoyle", lane: 2, col: 1 }]);
    expect(ofType(ev, "boltFired")).toHaveLength(0);
  });

  it("bone knight takes half damage from bolts", () => {
    const c = testConfig([{ atSec: 0, lane: 0, kind: "boneKnight" }]);
    const s = newGame(c);
    const ev = run(s, c, secToTicks(3), [{ type: "placeDefender", kind: "gargoyle", lane: 0, col: 1 }]);
    expect(ofType(ev, "enemyHit")[0]?.damage).toBe(10);
  });

  it("coffin blocks a walker, which bites it", () => {
    const c = testConfig([{ atSec: 0, lane: 1, kind: "wisp" }]);
    const s = newGame(c);
    run(s, c, secToTicks(20), [{ type: "placeDefender", kind: "coffin", lane: 1, col: 5 }]);
    const e = s.enemies[0]!;
    expect(e.biting).toBe(s.defenders[0]!.id);
    expect(e.x).toBeGreaterThan(5);
    expect(s.defenders[0]!.hp).toBeLessThan(2000);
  });

  it("wraith flies over coffins", () => {
    const c = testConfig([{ atSec: 0, lane: 1, kind: "wraith" }]);
    const s = newGame(c);
    run(s, c, secToTicks(15), [{ type: "placeDefender", kind: "coffin", lane: 1, col: 5 }]);
    expect(s.enemies[0]!.x).toBeLessThan(5);
    expect(s.defenders[0]!.hp).toBe(2000);
  });

  it("salt rune slows walkers by half, not wraiths, and expires after 30 s", () => {
    const c = testConfig([
      { atSec: 0, lane: 1, kind: "wisp" },
      { atSec: 0, lane: 1, kind: "wraith" },
    ]);
    const s = newGame(c);
    const ev = run(s, c, secToTicks(31), [{ type: "placeDefender", kind: "rune", lane: 1, col: 8 - 1 }]);
    expect(ofType(ev, "enemySlowed").map((e) => e.id)).toEqual([s.enemies.find((e) => e.kind === "wisp")?.id]);
    expect(ofType(ev, "runeExpired")).toHaveLength(1);
    expect(s.defenders).toHaveLength(0);
  });

  it("bell hits every enemy on the board", () => {
    const c = testConfig([
      { atSec: 0, lane: 0, kind: "wisp" },
      { atSec: 0, lane: 4, kind: "wisp" },
    ]);
    const s = newGame(c);
    step(s, c, [correct(), correct(), correct()]);
    s.energy = 1000;
    const ev = run(s, c, secToTicks(3), [{ type: "placeDefender", kind: "bell", lane: 2, col: 0 }]);
    expect(ofType(ev, "bellRang")).toHaveLength(1);
    expect(ofType(ev, "enemyHit").filter((h) => h.source === "bell")).toHaveLength(2);
  });

  it("a destroyed defender is removed the same tick", () => {
    const c = testConfig([{ atSec: 0, lane: 0, kind: "boneKnight" }]);
    const s = newGame(c);
    const ev = run(s, c, secToTicks(60), [{ type: "placeDefender", kind: "lantern", lane: 0, col: 7 }]);
    expect(ofType(ev, "defenderDestroyed")).toHaveLength(1);
    expect(s.defenders).toHaveLength(0);
  });
});

describe("lich boss", () => {
  it("is immune until a boss question is answered, and the shield returns after 20 s", () => {
    const c = testConfig([{ atSec: 0, lane: 2, kind: "lich" }]);
    const s = newGame(c);
    let ev = run(s, c, secToTicks(4), [{ type: "placeDefender", kind: "gargoyle", lane: 2, col: 1 }]);
    expect(ofType(ev, "boltHit").every((h) => h.blocked && h.damage === 0)).toBe(true);
    expect(s.enemies[0]!.hp).toBe(1500);

    ev = step(s, c, [correct(true)]);
    expect(ofType(ev, "shieldBroken")).toHaveLength(1);
    ev = run(s, c, secToTicks(20) + 1);
    expect(s.enemies[0]!.hp).toBeLessThan(1500);
    expect(ofType(ev, "shieldRestored")).toHaveLength(1);
  });

  it("a normal correct answer does not break the shield", () => {
    const c = testConfig([{ atSec: 0, lane: 2, kind: "lich" }]);
    const s = newGame(c);
    step(s, c);
    step(s, c, [correct(false)]);
    expect(s.enemies[0]!.shield).toBe(true);
  });
});

describe("waves, lives, win and lose", () => {
  it("a ghost reaching the gate costs a life; 3 breaches lose the level", () => {
    const c = testConfig([
      { atSec: 0, lane: 0, kind: "shade" },
      { atSec: 0, lane: 1, kind: "shade" },
      { atSec: 0, lane: 2, kind: "shade" },
    ]);
    const s = newGame(c);
    const ev = run(s, c, secToTicks(20));
    expect(ofType(ev, "gateBreached").map((e) => e.lives)).toEqual([2, 1, 0]);
    expect(s.result).toBe("lost");
    expect(ofType(ev, "levelEnded")[0]?.result).toBe("lost");
  });

  it("clearing the last wave wins", () => {
    const c = testConfig([{ atSec: 0, lane: 2, kind: "wisp" }]);
    const s = newGame(c);
    const ev = run(s, c, secToTicks(30), [{ type: "placeDefender", kind: "gargoyle", lane: 2, col: 0 }, correct()]);
    expect(s.result).toBe("won");
    const end = ofType(ev, "levelEnded")[0]!;
    expect(end).toMatchObject({ result: "won", correct: 1, wrong: 0, accuracy: 1, kills: 1 });
  });

  it("pause stops time; gameplay commands are ignored while paused", () => {
    const c = testConfig([{ atSec: 0, lane: 2, kind: "wisp" }]);
    const s = newGame(c);
    step(s, c);
    step(s, c, [{ type: "pause" }]);
    const snap = structuredClone(s);
    run(s, c, 100, [correct()]);
    expect(s).toEqual(snap);
    step(s, c, [{ type: "resume" }]);
    expect(s.tick).toBe(snap.tick + 1);
  });

  it("calm mode slows ghosts to 70%", () => {
    const c = testConfig([{ atSec: 0, lane: 2, kind: "wisp" }]);
    const s = newGame(c);
    step(s, c, [{ type: "setCalm", calm: true }]);
    const x0 = s.enemies[0]!.x;
    step(s, c);
    expect(x0 - s.enemies[0]!.x).toBeCloseTo((0.35 * 0.7) / 60, 6);
  });
});
