import type { Question } from "../quiz/pack";
import { el, img } from "./dom";

export interface SpellbookCallbacks {
  onAnswer: (choice: number) => void;
  onSkip: () => void;
}

/** The quiz panel. Shows one question; the game keeps running behind it. */
export class Spellbook {
  readonly root: HTMLElement;
  private readonly title = el("h2", { class: "book-title", text: "The Spellbook" });
  private readonly badge = el("div", { class: "boss-badge", text: "Boss question: break the Lich's shield!" });
  private readonly topic = el("div", { class: "book-topic" });
  private readonly prompt = el("p", { class: "book-question", attrs: { "aria-live": "polite" } });
  private readonly answers: HTMLButtonElement[] = [];
  private readonly feedback = el("div", { class: "book-feedback", attrs: { "aria-live": "assertive" } });
  private readonly skip = el("button", { class: "book-skip", text: "Skip", attrs: { type: "button" } });
  private readonly stars: HTMLImageElement[] = [];
  private readonly streakText = el("span", { class: "streak-text" });
  private locked = false;

  constructor(cb: SpellbookCallbacks) {
    const grid = el("div", { class: "answers" });
    for (let i = 0; i < 4; i++) {
      const b = el("button", { class: "answer", attrs: { type: "button" } }, [
        el("span", { class: "answer-key", text: String(i + 1) }),
        el("span", { class: "answer-text" }),
      ]);
      b.addEventListener("click", () => {
        if (!this.locked) cb.onAnswer(i);
      });
      this.answers.push(b);
      grid.append(b);
    }
    this.skip.addEventListener("click", () => {
      if (!this.locked && !this.skip.disabled) cb.onSkip();
    });
    const starRow = el("div", { class: "stars" });
    for (let i = 0; i < 3; i++) {
      const s = img("/assets/ui/icon_star_empty.webp", "", "star");
      this.stars.push(s);
      starRow.append(s);
    }
    starRow.append(this.streakText);
    this.root = el("aside", { class: "spellbook", attrs: { "aria-label": "Spellbook quiz" } }, [
      el("div", { class: "book-inner" }, [this.title, this.badge, this.topic, this.prompt, grid, this.feedback, starRow, this.skip]),
    ]);
  }

  show(q: Question, boss: boolean): void {
    this.locked = false;
    this.root.classList.toggle("boss", boss);
    this.root.classList.remove("flip");
    void this.root.offsetWidth;
    this.root.classList.add("flip");
    this.topic.textContent = q.topic;
    this.prompt.textContent = q.prompt;
    this.feedback.textContent = "";
    this.feedback.className = "book-feedback";
    q.choices.forEach((c, i) => {
      const b = this.answers[i];
      if (!b) return;
      b.className = "answer";
      b.disabled = false;
      const t = b.querySelector(".answer-text");
      if (t) t.textContent = c;
    });
    this.skip.disabled = true;
  }

  enableSkip(): void {
    this.skip.disabled = false;
  }

  /** Mark the result. Returns after the player has had time to read it. */
  reveal(q: Question, choice: number, gained: number): void {
    this.locked = true;
    const right = choice === q.answer;
    this.answers.forEach((b, i) => {
      b.disabled = true;
      if (i === q.answer) b.classList.add("correct");
      if (i === choice && !right) b.classList.add("wrong");
    });
    if (right) {
      this.feedback.textContent = `+${gained} Soul Energy`;
      this.feedback.className = "book-feedback good";
    } else {
      this.feedback.textContent = `Not quite. ${q.explain}`;
      this.feedback.className = "book-feedback bad";
    }
  }

  setStreak(streak: number, bellAt: number): void {
    this.stars.forEach((s, i) => {
      const src = i < Math.min(streak, bellAt) ? "/assets/ui/icon_star_full.webp" : "/assets/ui/icon_star_empty.webp";
      if (!s.src.endsWith(src)) s.src = src;
    });
    this.streakText.textContent = streak >= 2 ? `Streak ×${streak}` : "";
  }

  get isLocked(): boolean {
    return this.locked;
  }
}
