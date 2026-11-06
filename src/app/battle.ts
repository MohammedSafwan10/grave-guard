import type { AudioSystem } from "../audio/audio";
import type { Question, QuestionPack } from "../quiz/pack";
import { createQuiz, type Quiz } from "../quiz/quiz";
import { BattleScene } from "../render/scene";
import {
  createState,
  DT,
  placementProblem,
  step,
  type Command,
  type DefenderKind,
  type GameConfig,
  type SimEvent,
  type SimState,
} from "../sim";
import { Hud } from "../ui/hud";
import type { Screens } from "../ui/screens";
import { Shop, type ShopItem } from "../ui/shop";
import { Spellbook } from "../ui/spellbook";

const MAX_STEPS_PER_FRAME = 5;
const REVEAL_MS = { right: 650, wrong: 2200 };

export interface BattleDeps {
  config: GameConfig;
  pack: QuestionPack;
  levelId: string;
  calm: boolean;
  seed: number;
  scene: BattleScene;
  audio: AudioSystem;
  screens: Screens;
  uiRoot: HTMLElement;
  onExit: (next: "title" | "retry" | "next") => void;
}

/** One level being played: owns the sim state and connects it to input, quiz, scene, UI and audio. */
export class Battle {
  readonly state: SimState;
  private readonly quiz: Quiz;
  private readonly hud: Hud;
  private readonly shop: Shop;
  private readonly book: Spellbook;
  private readonly root: HTMLElement;
  private readonly pending: Command[] = [];
  private acc = 0;
  private last = performance.now();
  private raf = 0;
  private selected: DefenderKind | null = null;
  private hover: { lane: number; col: number } | null = null;
  private question: Question | null = null;
  private questionBoss = false;
  private shownAt = 0;
  private skipTimer = 0;
  private nextTimer = 0;
  private ended = false;
  private readonly disposers: (() => void)[] = [];

  constructor(private readonly d: BattleDeps) {
    this.state = createState(d.config, d.levelId, { seed: d.seed, calm: d.calm });
    this.quiz = createQuiz(d.pack, d.seed);
    const defs = d.config.defenders;
    const items: ShopItem[] = [
      { kind: "lantern", name: defs.lantern.name, cost: defs.lantern.cost, sprite: defs.lantern.sprite, hint: `+${defs.lantern.answerBonus} energy on every correct answer` },
      { kind: "gargoyle", name: defs.gargoyle.name, cost: defs.gargoyle.cost, sprite: defs.gargoyle.sprite, hint: "Shoots soul bolts down its lane" },
      { kind: "coffin", name: defs.coffin.name, cost: defs.coffin.cost, sprite: defs.coffin.sprite, hint: "A sturdy wall. Wraiths fly over it" },
      { kind: "rune", name: defs.rune.name, cost: defs.rune.cost, sprite: defs.rune.sprite, hint: "Slows ghosts that walk over it" },
      { kind: "bell", name: defs.bell.name, cost: defs.bell.cost, sprite: defs.bell.sprite, hint: `Hits every ghost. Unlock with a ${defs.bell.unlockStreak}-answer streak` },
    ];
    this.hud = new Hud(d.config.rules.lives);
    this.shop = new Shop(items, (k) => this.select(k));
    this.book = new Spellbook({ onAnswer: (c) => this.answer(c), onSkip: () => this.skip() });
    this.root = document.createElement("div");
    this.root.className = "battle";
    this.root.append(this.hud.root, this.shop.root, this.book.root);
    d.uiRoot.append(this.root);
    this.bindInput();
    this.nextQuestion();
    this.refreshUi();
    void d.audio.playMusic("music_battle");
    d.audio.startAmbience();
    this.raf = requestAnimationFrame(this.frame);
  }

  private get levelName(): string {
    return this.d.config.levels.find((l) => l.id === this.d.levelId)?.name ?? "";
  }

  // ---------- input ----------
  private bindInput(): void {
    const canvas = this.d.scene.renderer.domElement;
    const move = (e: PointerEvent) => {
      this.hover = this.d.scene.pick(e.clientX, e.clientY);
    };
    const down = (e: PointerEvent) => {
      const tile = this.d.scene.pick(e.clientX, e.clientY);
      if (!tile) return;
      if (e.button === 2) {
        this.pending.push({ type: "removeDefender", lane: tile.lane, col: tile.col });
        return;
      }
      if (this.selected) {
        this.pending.push({ type: "placeDefender", kind: this.selected, lane: tile.lane, col: tile.col });
        if (!e.shiftKey) this.selected = null;
      }
    };
    const key = (e: KeyboardEvent) => {
      if (this.ended) return;
      if (e.key === "Escape") {
        if (this.selected) this.selected = null;
        else this.togglePause();
        return;
      }
      if (this.state.paused) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        this.answer(n - 1);
        return;
      }
      const i = Shop.KEYS.indexOf(e.key.toLowerCase());
      const kind = (["lantern", "gargoyle", "coffin", "rune", "bell"] as const)[i];
      if (kind) this.select(kind);
      if (e.key.toLowerCase() === "s") this.skip();
    };
    const hidden = () => {
      if (document.hidden && !this.state.paused && !this.ended) this.togglePause();
    };
    const blockMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("contextmenu", blockMenu);
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden);
    this.disposers.push(() => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("contextmenu", blockMenu);
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden);
    });
  }

  private select(kind: DefenderKind): void {
    if (this.state.paused || this.ended) return;
    const problem = placementProblem(this.state, this.d.config, kind, 0, 0);
    if (problem === "locked") {
      this.d.screens.toast(`Answer ${this.d.config.defenders.bell.unlockStreak} in a row to unlock the Bell`);
      this.d.audio.play("ui_cant_afford");
      return;
    }
    if (this.state.energy < this.d.config.defenders[kind].cost) {
      this.d.screens.toast("Not enough Soul Energy — answer a question!");
      this.d.audio.play("ui_cant_afford");
      return;
    }
    this.selected = this.selected === kind ? null : kind;
    this.d.audio.play("ui_click");
  }

  private togglePause(): void {
    if (this.state.paused) {
      this.pending.push({ type: "resume" });
      this.d.screens.clear();
      this.root.classList.remove("paused");
    } else {
      this.pending.push({ type: "pause" });
      this.root.classList.add("paused");
      this.d.screens.pause(
        () => this.togglePause(),
        () => this.exit("title"),
      );
    }
  }

  // ---------- quiz ----------
  private nextQuestion(): void {
    clearTimeout(this.skipTimer);
    const boss = this.state.enemies.some((e) => e.shield);
    this.question = this.quiz.next({ boss });
    this.questionBoss = boss;
    this.shownAt = performance.now();
    this.book.show(this.question, boss);
    this.d.audio.play("page_flip", { volume: 0.6 });
    this.skipTimer = window.setTimeout(() => this.book.enableSkip(), this.d.config.rules.skipAfterSec * 1000);
  }

  private answer(choice: number): void {
    const q = this.question;
    if (!q || this.book.isLocked || this.state.paused || this.ended) return;
    const ms = performance.now() - this.shownAt;
    const result = this.quiz.submit(q, choice, ms, { boss: this.questionBoss, fastMs: this.d.config.rules.fastMs });
    this.pending.push({ type: "answer", result });
    // Wrong answers reveal now; correct ones reveal when the sim confirms the energy gained.
    if (!result.correct) this.book.reveal(q, choice, 0);
    this.d.audio.play(result.correct ? "answer_correct" : "answer_wrong");
    clearTimeout(this.nextTimer);
    this.nextTimer = window.setTimeout(() => this.nextQuestion(), result.correct ? REVEAL_MS.right : REVEAL_MS.wrong);
  }

  private skip(): void {
    if (!this.question || this.book.isLocked || this.state.paused || this.ended) return;
    if (performance.now() - this.shownAt < this.d.config.rules.skipAfterSec * 1000) return;
    this.pending.push({ type: "skip" });
    this.nextQuestion();
  }

  // ---------- loop ----------
  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    const events: SimEvent[] = [];
    // Commands like pause must apply even when no tick is due.
    if (this.pending.length && this.acc < DT) this.acc = DT;
    while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      this.d.scene.beforeTick();
      events.push(...step(this.state, this.d.config, this.pending.splice(0)));
      this.acc -= DT;
      steps++;
      if (this.state.paused) {
        this.acc = 0;
        break;
      }
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    if (steps > 0) {
      this.d.scene.sync(this.state);
      this.d.scene.handle(events);
      this.handle(events);
    }
    this.d.scene.setPlacement(
      this.selected,
      (lane, col) => this.selected !== null && placementProblem(this.state, this.d.config, this.selected, lane, col) === null,
      this.hover,
    );
    this.refreshUi();
    this.d.scene.render(dt, this.state.paused ? 1 : this.acc / DT, this.state);
  };

  private handle(events: SimEvent[]): void {
    const a = this.d.audio;
    for (const e of events) {
      switch (e.type) {
        case "answered":
          if (e.result.correct) this.book.reveal(this.question ?? this.d.pack.questions[0]!, this.question?.answer ?? 0, e.energyGained);
          this.book.setStreak(e.streak, this.d.config.defenders.bell.unlockStreak);
          if (e.result.correct && e.streak >= 2) a.play("streak_bonus", { volume: 0.5, pitch: 1 + Math.min(e.streak, 8) * 0.03 });
          break;
        case "energyChanged":
          if (e.cause === "answer") a.play("energy_collect", { volume: 0.7 });
          break;
        case "bellUnlocked":
          this.d.screens.toast("Banshee Bell unlocked!");
          a.play("bell_toll_alt", { volume: 0.6 });
          break;
        case "hasteStarted":
          this.d.screens.toast("Wrong answer — the ghosts speed up!");
          break;
        case "defenderPlaced":
          a.play("place_defender");
          break;
        case "defenderRemoved":
          a.play("remove_defender");
          break;
        case "placementRejected":
          if (e.reason !== "offBoard") a.play("ui_cant_afford", { volume: 0.6 });
          break;
        case "boltFired":
          a.play("gargoyle_shoot", { volume: 0.35, minGapMs: 60 });
          break;
        case "boltHit":
          a.play(e.blocked ? "armor_hit" : "bolt_hit", { volume: 0.4, minGapMs: 50 });
          break;
        case "enemyKilled":
          a.play("ghost_death", { volume: 0.7 });
          break;
        case "enemySpawned":
          if (e.kind === "lich") {
            void a.sting("sting_boss_intro");
            void a.playMusic("music_boss", 1);
            this.d.screens.showBanner("The Lich rises!", "Answer the boss question to break its shield");
            this.nextQuestion();
          } else a.whoosh(0.18);
          break;
        case "defenderHit":
          if (Math.random() < 0.03) a.play("coffin_hit", { volume: 0.3 });
          break;
        case "defenderDestroyed":
          a.play(e.kind === "coffin" ? "coffin_break" : "coffin_hit", { volume: 0.7 });
          break;
        case "gateBreached":
          a.play("gate_damage");
          this.d.screens.toast(e.lives > 0 ? `A ghost slipped through! ${e.lives} ${e.lives === 1 ? "life" : "lives"} left` : "The gate has fallen!");
          break;
        case "bellRang":
          a.play("bell_toll");
          break;
        case "shieldBroken":
          a.play("boss_shield_break");
          this.d.screens.toast("Shield broken! Attack now!");
          break;
        case "shieldRestored":
          a.play("salt_rune_slow", { volume: 0.7 });
          this.d.screens.toast("The Lich's shield returns — answer the boss question!");
          if (!this.book.isLocked) this.nextQuestion();
          break;
        case "waveStarting":
          this.d.screens.showBanner(`Wave ${e.index + 1} / ${e.count}`, e.index === 0 ? "Answer questions to earn energy, then place defenders" : "Get ready…");
          break;
        case "waveStarted":
          void a.sting("sting_wave_start");
          break;
        case "waveCleared":
          a.play("reward_coins", { volume: 0.6 });
          break;
        case "levelEnded":
          this.finish(e);
          break;
        default:
          break;
      }
    }
  }

  private refreshUi(): void {
    const s = this.state;
    this.hud.update({ wave: s.wave.index + 1, waves: s.wave.count, energy: s.energy, lives: s.lives, maxLives: this.d.config.rules.lives, levelName: this.levelName });
    this.shop.update({
      energy: s.energy,
      selected: this.selected,
      locked: s.bellUnlocked ? {} : { bell: `answer ${this.d.config.defenders.bell.unlockStreak} in a row` },
    });
    this.root.classList.toggle("placing", this.selected !== null);
  }

  private finish(e: Extract<SimEvent, { type: "levelEnded" }>): void {
    this.ended = true;
    clearTimeout(this.nextTimer);
    clearTimeout(this.skipTimer);
    const won = e.result === "won";
    void this.d.audio.sting(won ? "sting_victory" : "sting_defeat", false);
    this.d.audio.stopMusic(1.5);
    const missed = [...new Set(e.missed)]
      .map((id) => this.quiz.byId(id))
      .filter((q): q is Question => q !== undefined)
      .map((q) => ({ prompt: q.prompt, answer: q.choices[q.answer], explain: q.explain }));
    const levels = this.d.config.levels;
    const hasNext = levels.findIndex((l) => l.id === this.d.levelId) < levels.length - 1;
    setTimeout(() => {
      this.d.screens.end(
        { won, accuracy: e.accuracy, correct: e.correct, wrong: e.wrong, kills: e.kills, missed },
        [
          ...(won && hasNext ? [{ label: "Next level", primary: true, run: () => this.exit("next") }] : []),
          { label: won ? "Play again" : "Try again", primary: !won || !hasNext, run: () => this.exit("retry") },
          { label: "Title", run: () => this.exit("title") },
        ],
      );
    }, 1400);
  }

  /** Debug/test helper: run the sim forward without waiting for frames. */
  fastForward(seconds: number): void {
    const events: SimEvent[] = [];
    for (let i = 0; i < Math.round(seconds * 60) && this.state.result === "playing"; i++) {
      this.d.scene.beforeTick();
      events.push(...step(this.state, this.d.config, this.pending.splice(0)));
    }
    this.d.scene.sync(this.state);
    this.d.scene.handle(events.filter((e) => e.type !== "enemyKilled" || this.state.enemies.length < 50));
    this.handle(events.filter((e) => e.type !== "boltFired" && e.type !== "boltHit"));
  }

  private exit(next: "title" | "retry" | "next"): void {
    this.dispose();
    this.d.onExit(next);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.nextTimer);
    clearTimeout(this.skipTimer);
    this.disposers.forEach((f) => f());
    this.root.remove();
    this.d.screens.clear();
  }
}
