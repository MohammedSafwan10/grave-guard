import type { Progress } from "../app/settings";
import { el, img } from "./dom";
import { settingsPanel, type SettingsPanelDeps } from "./settings-panel";

export interface TitleOptions {
  levels: { id: string; name: string }[];
  progress: Progress;
  onPlay: (levelId: string) => void;
  onHowTo: () => void;
  onSettings: () => void;
  onCredits: () => void;
}

export interface PauseOptions {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export interface EndView {
  won: boolean;
  accuracy: number;
  correct: number;
  wrong: number;
  kills: number;
  stars: number;
  newBest: boolean;
  missed: { prompt: string; answer: string; explain: string }[];
}

const LEVEL_BLURBS = [
  "A gentle start among the moonblooms",
  "Bone Knights march through the crypts",
  "The Lich waits in its garden",
];

const button = (label: string, run: () => void, cls = "btn"): HTMLButtonElement => {
  const b = el("button", { class: cls, text: label, attrs: { type: "button" } });
  b.addEventListener("click", run);
  return b;
};

/** Three stars, with a text label so the score doesn't rely on the pictures. */
function starRow(stars: number, cls = "star-row"): HTMLElement {
  const row = el("div", { class: cls, attrs: { role: "img", "aria-label": `${stars} of 3 stars` } });
  for (let i = 0; i < 3; i++)
    row.append(
      img(i < stars ? "/assets/ui/icon_star_full.webp" : "/assets/ui/icon_star_empty.webp", "", "star"),
    );
  return row;
}

/** Full-screen panels: loading, title, settings, pause, level end. Only one shows at a time. */
export class Screens {
  readonly root = el("div", { class: "screens" });
  readonly banner = el("div", { class: "banner", attrs: { "aria-live": "polite" } });
  private readonly toastBox = el("div", { class: "toasts", attrs: { "aria-live": "polite" } });
  private escBack: (() => void) | null = null;

  constructor() {
    this.root.append(this.banner, this.toastBox);
    // Esc closes sub-menus (settings, how to play, credits). Captured first so the battle doesn't also see it.
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && this.escBack) {
          e.stopImmediatePropagation();
          const back = this.escBack;
          this.escBack = null;
          back();
        }
      },
      { capture: true },
    );
  }

  private panel(children: Node[], cls = "", onEsc: (() => void) | null = null): HTMLElement {
    this.clear();
    this.escBack = onEsc;
    const p = el("div", { class: `screen ${cls}` }, [
      el("div", { class: "dialog", attrs: { role: "dialog", "aria-modal": "true" } }, children),
    ]);
    this.root.append(p);
    requestAnimationFrame(() => p.classList.add("in"));
    return p;
  }

  clear(): void {
    this.escBack = null;
    this.root.querySelectorAll(".screen").forEach((n) => n.remove());
  }

  loading(): (p: number) => void {
    const bar = el("div", { class: "load-fill" });
    this.panel(
      [
        img("/assets/ui/ui_logo.webp", "Grave Guard: Moonbloom Hollow", "title-logo"),
        el("div", { class: "load-bar" }, [bar]),
      ],
      "loading",
    );
    return (p) => (bar.style.width = `${Math.round(p * 100)}%`);
  }

  error(message: string): void {
    this.panel([
      el("h2", { text: "The spirits couldn't load the graveyard" }),
      el("p", { text: message }),
      button("Try again", () => location.reload()),
    ]);
  }

  title(o: TitleOptions): void {
    // Suggest the first level without stars; every level stays open, so nobody is ever locked out.
    const nextIndex = Math.max(
      0,
      o.levels.findIndex((l) => !(o.progress[l.id]?.stars ?? 0)),
    );
    const cards = o.levels.map((l, i) => {
      const stars = o.progress[l.id]?.stars ?? 0;
      const b = el(
        "button",
        { class: `level-card${i === nextIndex ? " suggested" : ""}`, attrs: { type: "button" } },
        [
          el("span", { class: "level-num", text: `Level ${i + 1}` }),
          el("span", { class: "level-title", text: l.name }),
          el("span", { class: "level-blurb", text: LEVEL_BLURBS[i] ?? "" }),
          starRow(stars),
        ],
      );
      b.addEventListener("click", () => o.onPlay(l.id));
      return b;
    });
    const play = button(
      nextIndex > 0 ? `Continue · Level ${nextIndex + 1}` : "Play",
      () => o.onPlay(o.levels[nextIndex]!.id),
      "btn primary big",
    );
    this.panel(
      [
        img("/assets/ui/ui_logo.webp", "Grave Guard: Moonbloom Hollow", "title-logo"),
        el("p", {
          class: "tagline",
          text: "Answer questions to earn Soul Energy. Spend it on defenders. Keep the ghosts out of the graveyard.",
        }),
        play,
        el("div", { class: "level-cards" }, cards),
        el("nav", { class: "menu-links" }, [
          button("How to play", o.onHowTo, "link-btn"),
          button("Settings", o.onSettings, "link-btn"),
          button("Credits", o.onCredits, "link-btn"),
        ]),
      ],
      "title",
    );
    play.focus();
  }

  settings(deps: SettingsPanelDeps, onBack: () => void): void {
    const done = button("Done", onBack, "btn primary");
    this.panel([el("h2", { text: "Settings" }), settingsPanel(deps), done], "settings-screen", onBack);
    done.focus();
  }

  howTo(onBack: () => void): void {
    const step = (art: string, title: string, text: string) =>
      el("li", { class: "howto-step" }, [
        img(art, "", "howto-art"),
        el("div", {}, [el("strong", { text: title }), el("span", { text })]),
      ]);
    const back = button("Got it", onBack, "btn primary");
    this.panel(
      [
        el("h2", { text: "How to play" }),
        el("ol", { class: "howto" }, [
          step(
            "/assets/enemies/enemy_wisp.webp",
            "Ghosts walk in from the right",
            "Watch the glowing spawn stones at the right end of each lane: a ghost's picture appears there just before it arrives.",
          ),
          step(
            "/assets/ui/icon_soul_gem.webp",
            "Answer to earn Soul Energy",
            "Every correct answer in the spellbook gives energy. Fast answers and streaks give more. Wrong answers make ghosts hurry.",
          ),
          step(
            "/assets/defenders/def_gargoyle.webp",
            "Spend it on defenders",
            "Pick a card, then click a tile. Gargoyles shoot, Coffins block, Salt Runes slow, Lanterns boost every answer.",
          ),
          step(
            "/assets/ui/icon_heart_full.webp",
            "Guard the gate",
            "Each ghost that reaches the wall on the left costs a heart. The lane glows pink when a ghost gets close.",
          ),
        ]),
        el("p", {
          class: "keys",
          text: "Keys: 1–4 answer · Q W E R T pick a defender · S skip · right-click removes · Esc pause",
        }),
        back,
      ],
      "howto-screen",
      onBack,
    );
    back.focus();
  }

  credits(onBack: () => void): void {
    const line = (role: string, who: string) =>
      el("li", {}, [el("strong", { text: role }), el("span", { text: who })]);
    const back = button("Back", onBack, "btn primary");
    this.panel(
      [
        el("h2", { text: "Credits" }),
        el("ul", { class: "credits" }, [
          line("Game design & code", "Built solo with Kiro for Kiroween 2026"),
          line("Art", "Painted with AI image generation, directed and processed for the game"),
          line("Music", "Composed with Lyria (Gemini app)"),
          line("Sound effects", "Kenney.nl (CC0) and procedural Web Audio"),
          line("Fonts", "Cinzel, Cinzel Decorative, Nunito (SIL Open Font License)"),
          line("Engine", "Three.js, Vite, TypeScript"),
        ]),
        back,
      ],
      "credits-screen",
      onBack,
    );
    back.focus();
  }

  pause(o: PauseOptions): void {
    const resume = button("Resume", o.onResume, "btn primary");
    this.panel(
      [
        el("h2", { text: "Paused" }),
        el("p", { text: "The question is hidden while paused, so no free thinking time!" }),
        el("div", { class: "pause-buttons" }, [
          resume,
          button("Restart level", o.onRestart),
          button("Settings", o.onSettings),
          button("Quit to title", o.onQuit),
        ]),
      ],
      "pause-screen",
      o.onResume,
    );
    resume.focus();
  }

  end(v: EndView, actions: { label: string; primary?: boolean; run: () => void }[]): void {
    const list = el("ul", { class: "missed" });
    for (const m of v.missed.slice(0, 6)) {
      list.append(
        el("li", {}, [el("strong", { text: `${m.prompt} → ${m.answer}` }), el("span", { text: m.explain })]),
      );
    }
    const buttons = actions.map((a) => button(a.label, a.run, a.primary ? "btn primary" : "btn"));
    this.panel(
      [
        el("h2", {
          class: v.won ? "won" : "lost",
          text: v.won ? "The graveyard is safe!" : "The ghosts got through…",
        }),
        v.won ? starRow(v.stars, "star-row big") : null,
        v.newBest ? el("p", { class: "new-best", text: "New best!" }) : null,
        el("div", { class: "stats" }, [
          el("div", {}, [
            el("b", { text: `${Math.round(v.accuracy * 100)}%` }),
            el("span", { text: "accuracy" }),
          ]),
          el("div", {}, [el("b", { text: String(v.correct) }), el("span", { text: "correct" })]),
          el("div", {}, [el("b", { text: String(v.kills) }), el("span", { text: "ghosts banished" })]),
        ]),
        v.missed.length ? el("h3", { text: "Revise these" }) : el("p", { text: "No mistakes. Brilliant!" }),
        v.missed.length ? list : null,
        el("div", { class: "end-buttons" }, buttons),
      ].filter((n): n is NonNullable<typeof n> => n !== null),
      v.won ? "end won" : "end lost",
    );
    buttons[0]?.focus();
  }

  showBanner(text: string, sub = ""): void {
    this.banner.replaceChildren(
      el("div", { class: "banner-title", text }),
      el("div", { class: "banner-sub", text: sub }),
    );
    this.banner.classList.remove("show");
    void this.banner.offsetWidth;
    this.banner.classList.add("show");
  }

  toast(text: string): void {
    const t = el("div", { class: "toast", text });
    this.toastBox.append(t);
    setTimeout(() => t.remove(), 2200);
  }
}
