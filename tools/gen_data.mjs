// Generates src/data/levels.json and src/data/packs/times-tables.json.
// Deterministic: same script = same files. Edit the tables below, then run `node tools/gen_data.mjs`.
import { mkdirSync, writeFileSync } from "node:fs";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Levels ----------
// Wave budget grows ~25% per wave. Points per enemy match .kiro/steering/game-balance.md.
const POINTS = { wisp: 1, shade: 1.5, boneKnight: 3, wraith: 2.5 };
const LEVELS = [
  { id: "hollow-1", name: "Moonbloom Hollow", startBudget: 4, growth: 1.25, mix: [["wisp", 1, 0], ["shade", 0.35, 2], ["boneKnight", 0.25, 4]] },
  { id: "hollow-2", name: "Whispering Crypts", startBudget: 6, growth: 1.32, mix: [["wisp", 1, 0], ["shade", 0.5, 0], ["boneKnight", 0.35, 1], ["wraith", 0.35, 2]] },
  { id: "hollow-3", name: "The Lich's Garden", startBudget: 11, growth: 1.45, density: 1.5, mix: [["wisp", 1, 0], ["shade", 0.5, 0], ["boneKnight", 0.45, 0], ["wraith", 0.45, 0]], boss: true },
];

function makeWave(level, waveIndex, rand) {
  const budget = Math.round(level.startBudget * level.growth ** waveIndex * 2) / 2;
  const allowed = level.mix.filter(([, , fromWave]) => waveIndex >= fromWave);
  const totalWeight = allowed.reduce((a, [, w]) => a + w, 0);
  const kinds = [];
  let left = budget;
  while (left >= 1) {
    let r = rand() * totalWeight;
    let pick = allowed[0][0];
    for (const [kind, w] of allowed) {
      if ((r -= w) <= 0) { pick = kind; break; }
    }
    if (POINTS[pick] > left) pick = "wisp";
    kinds.push(pick);
    left -= POINTS[pick];
  }
  // Spread spawns over 20-40 s; lanes never repeat twice in a row; wave 0 of level 1 uses the middle 3 lanes.
  const duration = Math.min(40, 18 + kinds.length * 2) / (level.density ?? 1);
  const spawns = [];
  let lastLane = -1;
  kinds.forEach((kind, i) => {
    const atSec = Math.round(((i / Math.max(1, kinds.length - 1)) * duration + rand() * 1.5) * 10) / 10;
    const lanes = level.id === "hollow-1" && waveIndex === 0 ? [1, 2, 3] : [0, 1, 2, 3, 4];
    let lane;
    do lane = lanes[Math.floor(rand() * lanes.length)]; while (lane === lastLane && lanes.length > 1);
    lastLane = lane;
    spawns.push({ atSec: kinds.length === 1 ? 0 : atSec, lane, kind });
  });
  spawns.sort((a, b) => a.atSec - b.atSec);
  return { spawns };
}

const levels = LEVELS.map((level, li) => {
  const rand = rng(1000 + li);
  const waves = Array.from({ length: 6 }, (_, wi) => makeWave(level, wi, rand));
  if (level.boss) {
    waves[5].spawns.push({ atSec: 6, lane: 2, kind: "lich" });
    waves[5].spawns.sort((a, b) => a.atSec - b.atSec);
  }
  return { id: level.id, name: level.name, waves };
});
writeFileSync("src/data/levels.json", JSON.stringify({ levels }, null, 2) + "\n");

// ---------- Times tables pack ----------
const rand = rng(42);
const questions = [];
const seen = new Set();
const answerSlots = Array.from({ length: 60 }, (_, i) => i % 4);
for (let i = answerSlots.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [answerSlots[i], answerSlots[j]] = [answerSlots[j], answerSlots[i]];
}
const tips = (a, b) => {
  if (b === 9 || a === 9) { const n = a === 9 ? b : a; return `${n} × 10 = ${n * 10}, minus ${n} = ${n * 9}.`; }
  if (b === 5 || a === 5) { const n = a === 5 ? b : a; return `Half of ${n} × 10 (${n * 10}) is ${n * 5}.`; }
  if (b === 11 || a === 11) { const n = a === 11 ? b : a; return `${n} × 10 = ${n * 10}, plus ${n} = ${n * 11}.`; }
  const [x, y] = a >= b ? [a, b] : [b, a];
  if (y > 5) return `Split it: ${x} × 5 = ${x * 5}, plus ${x} × ${y - 5} = ${x * (y - 5)}, total ${x * y}.`;
  return `Count ${y} groups of ${x}: ${Array.from({ length: y }, (_, i) => x * (i + 1)).join(", ")}.`;
};
while (questions.length < 60) {
  const a = 2 + Math.floor(rand() * 11); // 2..12 → 66 unique pairs
  const b = 2 + Math.floor(rand() * 11);
  const key = `${Math.min(a, b)}x${Math.max(a, b)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const answer = a * b;
  const options = new Set([answer]);
  for (const d of [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, answer + 10, answer - 10, answer + 2, answer - 2]) {
    if (options.size >= 4) break;
    if (d > 0 && rand() < 0.75) options.add(d);
  }
  let k = 1;
  while (options.size < 4) options.add(answer + k++ * 3);
  const choices = [...options];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  // Put the answer in a balanced position so "always pick A" never works.
  const target = answerSlots[questions.length];
  const at = choices.indexOf(answer);
  [choices[at], choices[target]] = [choices[target], choices[at]];
  const difficulty = Math.max(a, b) <= 6 ? 1 : Math.max(a, b) <= 9 ? 2 : 3;
  questions.push({
    id: `tt-${key}`,
    topic: `${Math.max(a, b)} times table`,
    difficulty,
    prompt: `What is ${a} × ${b}?`,
    choices: choices.map(String),
    answer: choices.indexOf(answer),
    explain: `${a} × ${b} = ${answer}. ${tips(a, b)}`,
  });
}
mkdirSync("src/data/packs", { recursive: true });
writeFileSync(
  "src/data/packs/times-tables.json",
  JSON.stringify({ id: "times-tables", title: "Times Tables", subject: "Maths", questions }, null, 2) + "\n",
);
console.log(`levels: ${levels.map((l) => `${l.id} [${l.waves.map((w) => w.spawns.length).join(",")}]`).join(" ")}`);
console.log(`times-tables: ${questions.length} questions`);
