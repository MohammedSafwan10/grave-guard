import { z } from "zod";

const SettingsSchema = z.object({
  music: z.number().min(0).max(1),
  sfx: z.number().min(0).max(1),
  calm: z.boolean(),
  shake: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = { music: 0.7, sfx: 0.8, calm: false, shake: true };

const SETTINGS_KEY = "graveguard.settings.v1";
const PROGRESS_KEY = "graveguard.progress.v1";

const ProgressSchema = z.record(
  z.string(),
  z.object({ stars: z.number().int().min(0).max(3), best: z.number().min(0).max(1) }),
);
export type Progress = z.infer<typeof ProgressSchema>;

// localStorage can be missing (private mode) or hold anything; never let that break the game.
function read<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: settings still apply for this session.
  }
}

/** Player settings, saved in the browser. `onChange` listeners apply them (audio volume, shake...). */
export class SettingsStore {
  private value: Settings;
  private readonly listeners: ((s: Settings) => void)[] = [];

  constructor() {
    this.value = { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, SettingsSchema.partial(), {}) };
  }

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    write(SETTINGS_KEY, this.value);
    for (const l of this.listeners) l(this.value);
  }

  onChange(listener: (s: Settings) => void): void {
    this.listeners.push(listener);
    listener(this.value);
  }
}

/** Stars for a finished level: 1 for winning, 2 at 70% accuracy, 3 at 90%. */
export function starsFor(won: boolean, accuracy: number): number {
  if (!won) return 0;
  return accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : 1;
}

export function loadProgress(): Progress {
  return read(PROGRESS_KEY, ProgressSchema, {});
}

/** Keep the best result per level. Returns the updated progress. */
export function recordResult(levelId: string, won: boolean, accuracy: number): Progress {
  const p = loadProgress();
  const old = p[levelId] ?? { stars: 0, best: 0 };
  p[levelId] = {
    stars: Math.max(old.stars, starsFor(won, accuracy)),
    best: won ? Math.max(old.best, accuracy) : old.best,
  };
  write(PROGRESS_KEY, p);
  return p;
}
