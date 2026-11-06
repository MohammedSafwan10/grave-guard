import { el, img } from "./dom";

/** Full-screen panels: loading, title, pause, level end. Only one shows at a time. */
export class Screens {
  readonly root = el("div", { class: "screens" });
  readonly banner = el("div", { class: "banner", attrs: { "aria-live": "polite" } });
  private readonly toastBox = el("div", { class: "toasts", attrs: { "aria-live": "polite" } });

  constructor() {
    this.root.append(this.banner, this.toastBox);
  }

  private panel(children: Node[], cls = ""): HTMLElement {
    this.clear();
    const p = el("div", { class: `screen ${cls}` }, [el("div", { class: "dialog" }, children)]);
    this.root.append(p);
    requestAnimationFrame(() => p.classList.add("in"));
    return p;
  }

  clear(): void {
    this.root.querySelectorAll(".screen").forEach((n) => n.remove());
  }

  loading(): (p: number) => void {
    const bar = el("div", { class: "load-fill" });
    this.panel([img("/assets/ui/ui_logo.webp", "Grave Guard: Moonbloom Hollow", "title-logo"), el("div", { class: "load-bar" }, [bar])], "loading");
    return (p) => (bar.style.width = `${Math.round(p * 100)}%`);
  }

  error(message: string): void {
    const retry = el("button", { class: "btn", text: "Try again", attrs: { type: "button" } });
    retry.addEventListener("click", () => location.reload());
    this.panel([el("h2", { text: "The spirits couldn't load the graveyard" }), el("p", { text: message }), retry]);
  }

  title(levels: { id: string; name: string }[], onStart: (levelId: string, calm: boolean) => void): void {
    const calm = el("input", { attrs: { type: "checkbox", id: "calm" } });
    const buttons = levels.map((l, i) => {
      const b = el("button", { class: i === 0 ? "btn primary" : "btn", attrs: { type: "button" } }, [
        el("span", { class: "btn-sub", text: `Level ${i + 1}` }),
        el("span", { text: l.name }),
      ]);
      b.addEventListener("click", () => onStart(l.id, calm.checked));
      return b;
    });
    this.panel(
      [
        img("/assets/ui/ui_logo.webp", "Grave Guard: Moonbloom Hollow", "title-logo"),
        el("p", { class: "tagline", text: "Answer questions to earn Soul Energy. Spend it on defenders. Keep the ghosts out of the graveyard." }),
        el("div", { class: "level-buttons" }, buttons),
        el("label", { class: "calm" }, [calm, el("span", { text: " Calm mode (slower ghosts)" })]),
        el("p", { class: "keys", text: "Keys: 1–4 answer · Q W E R T pick a defender · Esc pause" }),
      ],
      "title",
    );
    buttons[0]?.focus();
  }

  pause(onResume: () => void, onQuit: () => void): void {
    const resume = el("button", { class: "btn primary", text: "Resume", attrs: { type: "button" } });
    const quit = el("button", { class: "btn", text: "Quit to title", attrs: { type: "button" } });
    resume.addEventListener("click", onResume);
    quit.addEventListener("click", onQuit);
    this.panel([el("h2", { text: "Paused" }), el("p", { text: "The question is hidden while paused — no free thinking time!" }), resume, quit]);
    resume.focus();
  }

  end(
    v: { won: boolean; accuracy: number; correct: number; wrong: number; kills: number; missed: { prompt: string; answer: string; explain: string }[] },
    actions: { label: string; primary?: boolean; run: () => void }[],
  ): void {
    const list = el("ul", { class: "missed" });
    for (const m of v.missed.slice(0, 6)) {
      list.append(el("li", {}, [el("strong", { text: `${m.prompt} → ${m.answer}` }), el("span", { text: m.explain })]));
    }
    const buttons = actions.map((a) => {
      const b = el("button", { class: a.primary ? "btn primary" : "btn", text: a.label, attrs: { type: "button" } });
      b.addEventListener("click", a.run);
      return b;
    });
    this.panel(
      [
        el("h2", { class: v.won ? "won" : "lost", text: v.won ? "The graveyard is safe!" : "The ghosts got through…" }),
        el("div", { class: "stats" }, [
          el("div", {}, [el("b", { text: `${Math.round(v.accuracy * 100)}%` }), el("span", { text: "accuracy" })]),
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
    this.banner.replaceChildren(el("div", { class: "banner-title", text }), el("div", { class: "banner-sub", text: sub }));
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
