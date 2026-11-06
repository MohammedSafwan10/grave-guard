import type { DefenderKind } from "../sim";
import { el, img } from "./dom";

export interface ShopItem {
  kind: DefenderKind;
  name: string;
  cost: number;
  sprite: string;
  hint: string;
}

export interface ShopView {
  energy: number;
  selected: DefenderKind | null;
  locked: Partial<Record<DefenderKind, string>>;
}

export class Shop {
  readonly root: HTMLElement;
  private readonly cards = new Map<DefenderKind, HTMLButtonElement>();

  constructor(
    private readonly items: ShopItem[],
    onPick: (kind: DefenderKind) => void,
  ) {
    this.root = el("nav", { class: "shop", attrs: { "aria-label": "Defenders" } });
    items.forEach((item, i) => {
      const card = el(
        "button",
        { class: "card", attrs: { type: "button", "data-kind": item.kind, title: item.hint } },
        [
          el("span", { class: "card-key", text: (Shop.KEYS[i] ?? "").toUpperCase() }),
          img(`/assets/${item.sprite}.webp`, "", "card-art"),
          el("span", { class: "card-name", text: item.name }),
          el("span", { class: "card-price" }, [
            img("/assets/ui/icon_soul_gem.webp", "", "card-gem"),
            el("span", { text: String(item.cost) }),
          ]),
          img("/assets/ui/icon_lock.webp", "", "card-lock"),
        ],
      );
      card.addEventListener("click", () => onPick(item.kind));
      this.cards.set(item.kind, card);
      this.root.append(card);
    });
  }

  /** Keyboard shortcuts shown on the cards: Q W E R T. */
  static readonly KEYS = ["q", "w", "e", "r", "t"];

  update(v: ShopView): void {
    for (const item of this.items) {
      const card = this.cards.get(item.kind);
      if (!card) continue;
      const lockReason = v.locked[item.kind];
      card.classList.toggle("selected", v.selected === item.kind);
      card.classList.toggle("poor", !lockReason && v.energy < item.cost);
      card.classList.toggle("locked", Boolean(lockReason));
      card.setAttribute(
        "aria-label",
        `${item.name}, costs ${item.cost}${lockReason ? `, locked: ${lockReason}` : v.energy < item.cost ? ", not enough energy" : ""}`,
      );
      card.setAttribute("aria-pressed", String(v.selected === item.kind));
    }
  }
}
