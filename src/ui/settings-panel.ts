import type { Settings } from "../app/settings";
import { el } from "./dom";

export interface SettingsPanelDeps {
  get: () => Settings;
  set: (patch: Partial<Settings>) => void;
  /** Plays a short sample so the player hears the new sound volume. */
  preview: () => void;
}

function slider(
  label: string,
  value: number,
  onInput: (v: number) => void,
  onCommit: () => void,
): HTMLElement {
  const id = `set-${label.toLowerCase().replace(/\W+/g, "-")}`;
  const input = el("input", {
    attrs: { type: "range", min: "0", max: "100", step: "5", id, value: String(Math.round(value * 100)) },
  });
  const out = el("output", { class: "set-value", text: `${Math.round(value * 100)}%`, attrs: { for: id } });
  input.addEventListener("input", () => {
    out.textContent = `${input.value}%`;
    input.style.setProperty("--fill", `${input.value}%`);
    onInput(Number(input.value) / 100);
  });
  input.addEventListener("change", onCommit);
  input.style.setProperty("--fill", `${input.value}%`);
  return el("div", { class: "set-row" }, [
    el("label", { class: "set-label", text: label, attrs: { for: id } }),
    input,
    out,
  ]);
}

function toggle(label: string, hint: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el("input", { class: "switch", attrs: { type: "checkbox", role: "switch" } });
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));
  return el("label", { class: "set-row set-toggle" }, [
    el("span", { class: "set-text" }, [
      el("span", { class: "set-label", text: label }),
      el("span", { class: "set-hint", text: hint }),
    ]),
    input,
  ]);
}

/** Volume sliders and comfort options. Changes apply immediately and are saved. */
export function settingsPanel(d: SettingsPanelDeps): HTMLElement {
  const s = d.get();
  return el("div", { class: "settings" }, [
    slider(
      "Music",
      s.music,
      (v) => d.set({ music: v }),
      () => undefined,
    ),
    slider("Sound effects", s.sfx, (v) => d.set({ sfx: v }), d.preview),
    toggle("Calm mode", "Ghosts move 30% slower. Applies from the next level you start.", s.calm, (v) =>
      d.set({ calm: v }),
    ),
    toggle("Screen shake", "Small camera shakes on big hits.", s.shake, (v) => d.set({ shake: v })),
  ]);
}
