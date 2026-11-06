import { z } from "zod";

const positive = z.number().positive();

export const RulesSchema = z.object({
  lanes: z.number().int().positive(),
  cols: z.number().int().positive(),
  spawnX: positive,
  gateX: z.number(),
  blockReach: positive,
  startEnergy: z.number().int().nonnegative(),
  correctEnergy: z.number().int().nonnegative(),
  streakStep: z.number().int().nonnegative(),
  streakMax: z.number().int().nonnegative(),
  fastBonus: z.number().int().nonnegative(),
  fastMs: positive,
  hasteMult: positive,
  hasteSec: positive,
  skipAfterSec: z.number().nonnegative(),
  lives: z.number().int().positive(),
  refundRatio: z.number().min(0).max(1),
  firstBreatherSec: z.number().nonnegative(),
  breatherSec: z.number().nonnegative(),
  calmSpeedMult: positive,
});

const base = { name: z.string(), cost: z.number().int().positive(), sprite: z.string() };

export const DefendersSchema = z.object({
  lantern: z.object({
    ...base,
    hp: positive,
    answerBonus: z.number().int().positive(),
    maxCounted: z.number().int().positive(),
  }),
  gargoyle: z.object({ ...base, hp: positive, fireEverySec: positive, damage: positive, boltSpeed: positive }),
  coffin: z.object({ ...base, hp: positive }),
  rune: z.object({ ...base, slowFactor: z.number().min(0).max(1), slowSec: positive, lifetimeSec: positive }),
  bell: z.object({
    ...base,
    hp: positive,
    pulseEverySec: positive,
    pulseDamage: positive,
    unlockStreak: z.number().int().positive(),
  }),
});

const enemy = z.object({
  name: z.string(),
  hp: positive,
  speed: positive,
  biteDps: positive,
  sprite: z.string(),
  floats: z.boolean().optional(),
  flies: z.boolean().optional(),
  boltArmor: z.number().min(0).max(1).optional(),
  boss: z.boolean().optional(),
  shieldReturnSec: positive.optional(),
});

export const EnemiesSchema = z.object({
  wisp: enemy,
  shade: enemy,
  boneKnight: enemy,
  wraith: enemy,
  lich: enemy,
});

export const ENEMY_KINDS = ["wisp", "shade", "boneKnight", "wraith", "lich"] as const;
export const DEFENDER_KINDS = ["lantern", "gargoyle", "coffin", "rune", "bell"] as const;

export const LevelsSchema = z.object({
  levels: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        waves: z
          .array(
            z.object({
              spawns: z.array(
                z.object({
                  atSec: z.number().nonnegative(),
                  lane: z.number().int().nonnegative(),
                  kind: z.enum(ENEMY_KINDS),
                }),
              ),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type Rules = z.infer<typeof RulesSchema>;
export type DefenderDefs = z.infer<typeof DefendersSchema>;
export type EnemyDefs = z.infer<typeof EnemiesSchema>;
export type EnemyDef = z.infer<typeof enemy>;
export type LevelDef = z.infer<typeof LevelsSchema>["levels"][number];

export interface GameConfig {
  rules: Rules;
  defenders: DefenderDefs;
  enemies: EnemyDefs;
  levels: LevelDef[];
}

/** Validate raw JSON. Throws with the failing path so bad data is caught at load, not mid-game. */
export function parseConfig(raw: { rules: unknown; defenders: unknown; enemies: unknown; levels: unknown }): GameConfig {
  const config = {
    rules: RulesSchema.parse(raw.rules),
    defenders: DefendersSchema.parse(raw.defenders),
    enemies: EnemiesSchema.parse(raw.enemies),
    levels: LevelsSchema.parse(raw.levels).levels,
  };
  for (const level of config.levels) {
    for (const wave of level.waves) {
      for (const s of wave.spawns) {
        if (s.lane >= config.rules.lanes) throw new Error(`Level ${level.id}: lane ${s.lane} is off the board`);
      }
    }
  }
  return config;
}
