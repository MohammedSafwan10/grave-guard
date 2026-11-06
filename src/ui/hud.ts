import { el, img } from "./dom";

export interface HudView {
  wave: number;
  waves: number;
  energy: number;
  lives: number;
  maxLives: number;
  levelName: string;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly waveText = el("span", { class: "plaque-text" });
  private readonly energyText = el("span", { class: "plaque-text energy-value" });
  private readonly hearts: HTMLImageElement[] = [];
  private readonly heartsBox = el("div", { class: "hearts", attrs: { role: "img" } });
  private readonly levelText = el("div", { class: "level-name" });
  readonly gem = img("/assets/ui/icon_soul_gem.webp", "", "gem");
  private lastEnergy = -1;

  constructor(maxLives: number) {
    for (let i = 0; i < maxLives; i++) {
      const h = img("/assets/ui/icon_heart_full.webp", "", "heart");
      this.hearts.push(h);
      this.heartsBox.append(h);
    }
    this.root = el("header", { class: "hud" }, [
      el("div", { class: "brand" }, [img("/assets/ui/ui_logo.webp", "Grave Guard: Moonbloom Hollow", "brand-logo")]),
      el("div", { class: "plaque wave-plaque" }, [this.waveText]),
      el("div", { class: "plaque energy-plaque", attrs: { "aria-live": "polite" } }, [this.gem, this.energyText]),
      el("div", { class: "plaque hearts-plaque" }, [this.heartsBox]),
    ]);
  }

  update(v: HudView): void {
    this.waveText.textContent = `Wave ${v.wave} / ${v.waves}`;
    this.levelText.textContent = v.levelName;
    this.waveText.title = v.levelName;
    if (v.energy !== this.lastEnergy) {
      if (this.lastEnergy >= 0 && v.energy > this.lastEnergy) {
        this.energyText.classList.remove("pop");
        void this.energyText.offsetWidth;
        this.energyText.classList.add("pop");
      }
      this.energyText.textContent = String(v.energy);
      this.lastEnergy = v.energy;
    }
    this.hearts.forEach((h, i) => {
      const full = i < v.lives;
      const src = full ? "/assets/ui/icon_heart_full.webp" : "/assets/ui/icon_heart_empty.webp";
      if (!h.src.endsWith(src)) {
        h.src = src;
        if (!full) h.classList.add("lost");
      }
    });
    this.heartsBox.setAttribute("aria-label", `${v.lives} of ${v.maxLives} lives left`);
  }
}
