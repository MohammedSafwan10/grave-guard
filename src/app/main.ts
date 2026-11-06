import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/cinzel-decorative/700.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/800.css";
import "../styles/main.css";
import { AudioSystem } from "../audio/audio";
import { builtinPacks } from "../quiz/builtin";
import { BattleScene } from "../render/scene";
import { loadGameConfig } from "../sim/load";
import { Screens } from "../ui/screens";
import { Battle } from "./battle";
import { loadAssets } from "./assets";

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene");
  const uiRoot = document.querySelector<HTMLElement>("#ui");
  if (!canvas || !uiRoot) throw new Error("Page is missing #scene or #ui");
  const screens = new Screens();
  uiRoot.append(screens.root);
  const progress = screens.loading();

  let assets;
  try {
    assets = await loadAssets(progress);
  } catch (err) {
    screens.error(err instanceof Error ? err.message : String(err));
    return;
  }
  const config = loadGameConfig();
  const pack = builtinPacks()[0];
  if (!pack) throw new Error("No question packs");
  const scene = new BattleScene(canvas, assets);
  const audio = new AudioSystem(assets.manifests.audio);
  const sfxReady = audio.loadSfx().catch((e: unknown) => console.warn("Sound effects failed to load", e));
  window.addEventListener("resize", () => scene.resize());

  // Idle backdrop behind the title screen.
  let idle = true;
  let last = performance.now();
  const idleState = { tick: 0, hasteUntil: 0 };
  const idleLoop = (now: number) => {
    if (!idle) return;
    scene.render((now - last) / 1000, 1, idleState);
    last = now;
    requestAnimationFrame(idleLoop);
  };
  requestAnimationFrame(idleLoop);

  let current: Battle | null = null;
  const start = async (levelId: string, calm: boolean) => {
    await audio.unlock();
    await sfxReady;
    audio.play("gate_open", { volume: 0.7 });
    idle = false;
    screens.clear();
    scene.reset();
    current = new Battle({
      config,
      pack,
      levelId,
      calm,
      seed: (Math.random() * 2 ** 31) | 0,
      scene,
      audio,
      screens,
      uiRoot,
      onExit: (next) => {
        current = null;
        const i = config.levels.findIndex((l) => l.id === levelId);
        if (next === "retry") void start(levelId, calm);
        else if (next === "next" && config.levels[i + 1]) void start(config.levels[i + 1]!.id, calm);
        else showTitle();
      },
    });
  };
  const showTitle = () => {
    scene.reset();
    idle = true;
    last = performance.now();
    requestAnimationFrame(idleLoop);
    void audio.playMusic("music_menu");
    screens.title(config.levels, (id, calm) => void start(id, calm));
  };
  // Browsers start audio muted until the first click or key press.
  // Debug handle for tests and the console: window.gg.battle.state
  (window as unknown as { gg: unknown }).gg = {
    get battle() {
      return current;
    },
  };
  const wake = () => void audio.unlock();
  window.addEventListener("pointerdown", wake, { once: true });
  window.addEventListener("keydown", wake, { once: true });
  showTitle();
  void current;
}

boot().catch((err: unknown) => {
  console.error(err);
  const ui = document.querySelector("#ui");
  if (ui) ui.textContent = `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
});
