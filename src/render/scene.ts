import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Assets } from "../app/assets";
import type { DefenderKind, EnemyKind, SimEvent, SimState } from "../sim";
import { BOARD, buildBoard, glowTexture, shadowTexture, toTile, toWorld, type BoardMeshes } from "./board";
import { buildGateWall, WALL_X } from "./gatewall";
import { LaneSignals } from "./lanes";
import { Particles } from "./particles";
import { SpriteUnit, UNIT_SIZE, type Motion } from "./units";

const DEFENDER_ART: Record<DefenderKind, { key: string; motion: Motion }> = {
  lantern: { key: "defenders/def_lantern", motion: "breathe" },
  gargoyle: { key: "defenders/def_gargoyle", motion: "breathe" },
  coffin: { key: "defenders/def_coffin", motion: "breathe" },
  rune: { key: "defenders/def_salt_rune", motion: "flat" },
  bell: { key: "defenders/def_bell", motion: "breathe" },
};
const ENEMY_ART: Record<EnemyKind, { key: string; motion: Motion; color: number }> = {
  wisp: { key: "enemies/enemy_wisp", motion: "float", color: 0xbff8ff },
  shade: { key: "enemies/enemy_shade", motion: "float", color: 0xb36bff },
  boneKnight: { key: "enemies/enemy_bone_knight", motion: "step", color: 0xfff1d0 },
  wraith: { key: "enemies/enemy_wraith", motion: "float", color: 0x6dffb0 },
  lich: { key: "enemies/enemy_lich", motion: "hover", color: 0xc08bff },
};

interface Tracked {
  unit: SpriteUnit;
  prevX: number;
  x: number;
  dying: number; // seconds left in the death animation, -1 while alive
  dieTotal: number;
  color: number;
}

/** Width of the screen covered by the spellbook on desktop. The board is framed in the rest. */
export const PANEL_FRACTION = 0.28;
/** Length of the death dissolve, seconds. */
const DISSOLVE_SEC = 0.75;

export class BattleScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly board: BoardMeshes;
  private readonly shadowTex = shadowTexture();
  private readonly enemies = new Map<number, Tracked>();
  private readonly defenders = new Map<number, Tracked>();
  private readonly bolts = new Map<
    number,
    { sprite: THREE.Sprite; prevX: number; x: number; lane: number }
  >();
  private readonly lights = new Map<number, THREE.PointLight>();
  private readonly shields = new Map<number, THREE.Mesh>();
  private readonly particles: Particles;
  private readonly boltMaterial: THREE.SpriteMaterial;
  private readonly preview: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly tmp = new THREE.Vector3();
  private readonly dyingDefenders: Tracked[] = [];
  private readonly lanes: LaneSignals;
  private shake = 0;
  private time = 0;
  private panelFraction = PANEL_FRACTION;
  /** 0 turns screen shake off (a settings option); 1 is normal. */
  shakeScale = 1;
  private laneState: Pick<SimState, "tick" | "wave" | "enemies"> | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly assets: Assets,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.fog = new THREE.Fog(0x2a2050, 18, 40);

    this.buildBackdrop();
    this.board = buildBoard(assets.texture("textures/tex_tile_stone"), assets.texture("textures/tex_grass"));
    this.scene.add(this.board.group);
    this.scene.add(buildGateWall(assets.texture("textures/tex_tile_stone")));
    this.buildProps();
    this.buildLights();
    this.lanes = new LaneSignals(glowTexture("rgba(255,255,255,1)"), (kind) =>
      assets.texture(ENEMY_ART[kind].key),
    );
    this.scene.add(this.lanes.group);

    this.particles = new Particles(glowTexture("rgba(255,255,255,1)"));
    this.scene.add(this.particles.points);

    this.boltMaterial = new THREE.SpriteMaterial({
      map: assets.texture("vfx/vfx_soul_bolt"),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });

    this.preview = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.preview.visible = false;
    this.scene.add(this.preview);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  private plane(key: string, height: number, pos: THREE.Vector3, opts: { fog?: boolean } = {}): THREE.Mesh {
    const art = this.assets.art(key);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(height * art.aspect, height),
      new THREE.MeshBasicMaterial({
        map: this.assets.texture(key),
        transparent: art.transparent,
        depthWrite: !art.transparent,
        fog: opts.fog ?? false,
      }),
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);
    return mesh;
  }

  private buildBackdrop(): void {
    // The hills stand right behind the board, tall enough to fill the top of the view; the sky sits further back.
    // The sky is the scene background: it always fills the screen, at any window shape.
    this.scene.background = this.assets.texture("backgrounds/bg_sky");
    const hills = this.plane("backgrounds/bg_far_hills", 12, new THREE.Vector3(0.3, 4.2, -4.4));
    hills.renderOrder = -9;
    // Lean the layers back toward the camera so they aren't squashed by its downward angle.
    hills.rotation.x = 0.3;
    // A little extra width so the right edge never shows on wide screens; the stretch is too small to notice.
    hills.scale.x = 1.3;
    // The painted gate stands in the opening of the wall at the end of the middle lane, turned toward the board
    // so it reads as the way into the graveyard that every ghost is heading for.
    const gate = this.plane("backgrounds/fg_gate_left", 2.3, new THREE.Vector3(WALL_X - 0.12, 0, 0));
    gate.geometry.translate(0, 1.15, 0); // stand on the ground
    gate.rotation.y = 1.05;
  }

  /**
   * Optional scenery. Each prop only appears once its art exists in the manifest,
   * so new GPT art shows up after `python tools/build_art.py` with no code change.
   */
  private buildProps(): void {
    const spots: [key: string, height: number, x: number, z: number][] = [
      ["props/prop_dead_tree", 2.4, 6.1, -3.3],
      ["props/prop_tombstone_2", 0.9, -6.4, -2.4],
      ["props/prop_tombstone_1", 0.75, 5.9, -2.8],
      ["props/prop_tombstone_1", 0.7, -6.6, 2.2],
      ["props/prop_tombstone_2", 0.8, 6.0, 2.9],
      ["props/prop_mushrooms", 0.5, -5.6, 3.0],
      ["props/prop_mushrooms", 0.45, 3.2, -3.0],
      ["props/prop_mushrooms", 0.42, 5.4, 3.3],
      ["props/prop_tombstone_1", 0.6, -1.5, -3.1],
    ];
    for (const [key, height, x, z] of spots) {
      if (!this.assets.has(key)) continue;
      const art = this.assets.art(key);
      const mesh = this.plane(key, height, new THREE.Vector3(x, 0, z), { fog: true });
      mesh.geometry.translate(height * art.aspect * (0.5 - art.anchor[0]), height * (art.anchor[1] - 0.5), 0);
      // Lean back to face the camera like the units, without turning every frame.
      mesh.rotation.x = -0.55;
    }
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xb3a9f0, 0x3a2b5c, 1.7));
    const moon = new THREE.DirectionalLight(0xd6deff, 2.2);
    moon.position.set(-6, 10, -4);
    this.scene.add(moon);
    // Warm light from the gate's own lantern.
    const gateLamp = new THREE.PointLight(0xffb35c, 7, 4.5, 1.6);
    gateLamp.position.set(WALL_X + 0.2, 1.8, -0.5);
    this.scene.add(gateLamp);
  }

  /** Frame the board inside the part of the screen not covered by the spellbook. */
  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.panelFraction = w >= 900 ? PANEL_FRACTION : 0;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    const narrow = this.panelFraction === 0;
    const usable = w * (1 - this.panelFraction);
    // On narrow screens the spellbook covers the bottom 44%, so the board lives in the top half.
    const aspect = usable / (h * (narrow ? 0.5 : 0.86));
    // Fit the gate, board and spawn signals (~12.6 units wide) or ~7.2 units deep, whichever is tighter.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const byWidth = 12.6 / aspect;
    const needH = Math.max(7.2, byWidth);
    const dist = needH / 2 / Math.tan(fov / 2);
    // On tall windows the width decides the zoom and leaves empty grass above and below.
    // Looking down more steeply makes the board taller on screen and fills that space.
    const tall = Math.max(0, byWidth / 7.2 - 1);
    const pitch = THREE.MathUtils.degToRad(Math.min(62, 40 + tall * 40));
    this.camera.position.set(-0.75, Math.sin(pitch) * dist, Math.cos(pitch) * dist + 0.4);
    this.camera.lookAt(-0.75, 0, 0.4);
    this.camera.aspect = w / h;
    // Shift the picture left (and slightly up, for the shop) so the board centres in the free area.
    this.camera.setViewOffset(w, h, (w * this.panelFraction) / 2, h * (narrow ? 0.22 : -0.01), w, h);
    this.camera.updateProjectionMatrix();
  }

  /** Pointer position (client px) → board tile under it. */
  pick(clientX: number, clientY: number): { lane: number; col: number } | null {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmp);
    return hit ? toTile(hit) : null;
  }

  /** Show valid tiles and a see-through preview while a shop card is selected. */
  setPlacement(
    kind: DefenderKind | null,
    valid: (lane: number, col: number) => boolean,
    hover: { lane: number; col: number } | null,
  ): void {
    for (let lane = 0; lane < BOARD.lanes; lane++) {
      for (let col = 0; col < BOARD.cols; col++) {
        const hl = this.board.highlights[lane]![col]!;
        const ok = kind !== null && valid(lane, col);
        hl.visible = ok;
        const mat = hl.material as THREE.MeshBasicMaterial;
        mat.opacity = ok ? (hover && hover.lane === lane && hover.col === col ? 0.45 : 0.14) : 0;
      }
    }
    if (kind && hover && valid(hover.lane, hover.col)) {
      const { key, motion } = DEFENDER_ART[kind];
      const art = this.assets.art(key);
      const size = UNIT_SIZE[key] ?? 1;
      const w = art.aspect >= 1 ? size : size * art.aspect;
      const h = art.aspect >= 1 ? size / art.aspect : size;
      const mat = this.preview.material as THREE.MeshBasicMaterial;
      mat.map = this.assets.texture(key);
      mat.needsUpdate = true;
      this.preview.scale.set(w, h, 1);
      toWorld(hover.lane, hover.col, this.preview.position);
      if (motion === "flat") {
        this.preview.rotation.set(-Math.PI / 2, 0, 0);
        this.preview.position.y = 0.09;
      } else {
        this.preview.quaternion.copy(this.camera.quaternion);
        this.preview.position.y = h / 2;
      }
      this.preview.visible = true;
    } else {
      this.preview.visible = false;
    }
  }

  /** React to sim events with effects. */
  handle(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case "enemyHit": {
          this.enemies.get(e.id)?.unit.flash(this.time);
          break;
        }
        case "defenderHit":
          if (Math.random() < 0.04) this.defenders.get(e.id)?.unit.flash(this.time);
          break;
        case "enemyKilled": {
          const t = this.enemies.get(e.id);
          if (t) {
            // The sprite burns away (see render) while motes of its colour drift up.
            t.dying = t.dieTotal = DISSOLVE_SEC;
            t.unit.setDissolve(0.001, t.color);
            this.particles.burst(
              t.unit.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
              t.color,
              e.kind === "lich" ? 70 : 12,
            );
          }
          break;
        }
        case "gateBreached":
          this.shake = 0.35;
          this.particles.burst(toWorld(e.lane, -0.6).add(new THREE.Vector3(0, 0.6, 0)), 0xff7088, 30);
          break;
        case "bellRang": {
          const p = toWorld(e.lane, e.col).add(new THREE.Vector3(0, 0.9, 0));
          this.particles.ring(p, 0x5ff0e6);
          this.shake = 0.15;
          break;
        }
        case "defenderPlaced": {
          const p = toWorld(e.lane, e.col).add(new THREE.Vector3(0, 0.2, 0));
          this.particles.burst(p, 0xc9b6ff, 14);
          break;
        }
        case "defenderDestroyed": {
          const p = toWorld(e.lane, e.col).add(new THREE.Vector3(0, 0.4, 0));
          this.particles.burst(p, 0x9b8fc0, 22);
          break;
        }
        case "shieldBroken": {
          const t = this.enemies.get(e.id);
          if (t)
            this.particles.burst(t.unit.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x5ff0e6, 60);
          this.shake = 0.25;
          break;
        }
        case "boltHit": {
          const b = this.bolts.get(e.id);
          if (b) this.particles.burst(b.sprite.position.clone(), e.blocked ? 0x5ff0e6 : 0xffd98a, 6);
          break;
        }
      }
    }
  }

  /** Called after every sim tick, before positions change, so render can interpolate. */
  beforeTick(): void {
    for (const t of this.enemies.values()) t.prevX = t.x;
    for (const b of this.bolts.values()) b.prevX = b.x;
  }

  /** Mirror sim state into scene objects. Called after ticks. */
  sync(state: SimState): void {
    this.laneState = state;
    const seen = new Set<number>();
    for (const e of state.enemies) {
      seen.add(e.id);
      let t = this.enemies.get(e.id);
      if (!t) {
        const { key, motion } = ENEMY_ART[e.kind];
        const unit = new SpriteUnit(
          this.assets.texture(key),
          this.assets.art(key),
          UNIT_SIZE[key] ?? 1,
          this.shadowTex,
          motion,
        );
        this.scene.add(unit.root);
        t = { unit, prevX: e.x, x: e.x, dying: -1, dieTotal: 1, color: ENEMY_ART[e.kind].color };
        this.enemies.set(e.id, t);
        if (e.kind === "lich") this.addShield(e.id, unit);
      }
      t.x = e.x;
      t.unit.root.userData = { lane: e.lane, biting: e.biting !== null, shield: e.shield };
      if (t.dying < 0) t.unit.setHealth(e.hp / e.maxHp);
    }
    for (const [id, t] of this.enemies) if (!seen.has(id) && t.dying < 0) t.dying = t.dieTotal = 0.3; // left the board (gate breach)

    const seenD = new Set<number>();
    for (const d of state.defenders) {
      seenD.add(d.id);
      if (!this.defenders.has(d.id)) {
        const { key, motion } = DEFENDER_ART[d.kind];
        const unit = new SpriteUnit(
          this.assets.texture(key),
          this.assets.art(key),
          UNIT_SIZE[key] ?? 1,
          this.shadowTex,
          motion,
          0xf4f0ff,
        );
        toWorld(d.lane, d.col, unit.root.position);
        this.scene.add(unit.root);
        this.defenders.set(d.id, { unit, prevX: d.col, x: d.col, dying: -1, dieTotal: 1, color: 0xc9b6ff });
        if (d.kind === "lantern") {
          const light = new THREE.PointLight(0x5ff0e6, 3.5, 2.6, 1.8);
          light.position.copy(unit.root.position).add(new THREE.Vector3(0, 0.6, 0.2));
          this.scene.add(light);
          this.lights.set(d.id, light);
        }
      }
      const tr = this.defenders.get(d.id);
      if (tr && Number.isFinite(d.maxHp)) {
        // Darken as it takes damage, so health reads without a bar.
        const k = 0.55 + 0.45 * Math.max(0, d.hp / d.maxHp);
        tr.unit.setTint(new THREE.Color(0xf4f0ff).multiplyScalar(k).getHex());
        tr.unit.setHealth(d.hp / d.maxHp);
      }
    }
    for (const [id, t] of this.defenders) {
      if (!seenD.has(id)) {
        // Destroyed or removed: dissolve it out instead of popping.
        t.dying = t.dieTotal = DISSOLVE_SEC * 0.7;
        t.unit.setDissolve(0.001, t.color);
        this.dyingDefenders.push(t);
        this.defenders.delete(id);
        const l = this.lights.get(id);
        if (l) {
          this.scene.remove(l);
          this.lights.delete(id);
        }
      }
    }

    const seenB = new Set<number>();
    for (const b of state.bolts) {
      seenB.add(b.id);
      let r = this.bolts.get(b.id);
      if (!r) {
        const sprite = new THREE.Sprite(this.boltMaterial);
        const art = this.assets.art("vfx/vfx_soul_bolt");
        sprite.scale.set(0.7, 0.7 / art.aspect, 1);
        this.scene.add(sprite);
        r = { sprite, prevX: b.x, x: b.x, lane: b.lane };
        this.bolts.set(b.id, r);
      }
      r.x = b.x;
    }
    for (const [id, r] of this.bolts) {
      if (!seenB.has(id)) {
        this.scene.remove(r.sprite);
        this.bolts.delete(id);
      }
    }
  }

  private addShield(id: number, unit: SpriteUnit): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.MeshBasicMaterial({
        color: 0x5ff0e6,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.scale.set(unit.width * 0.75, unit.height * 0.6, 0.6);
    mesh.position.y = unit.height * 0.5;
    unit.root.add(mesh);
    this.shields.set(id, mesh);
  }

  /** Remove every unit, bolt and light from the last battle. */
  reset(): void {
    this.laneState = null;
    for (const t of [...this.enemies.values(), ...this.defenders.values(), ...this.dyingDefenders]) {
      this.scene.remove(t.unit.root);
      t.unit.dispose();
    }
    for (const b of this.bolts.values()) this.scene.remove(b.sprite);
    for (const l of this.lights.values()) this.scene.remove(l);
    this.enemies.clear();
    this.defenders.clear();
    this.dyingDefenders.length = 0;
    this.bolts.clear();
    this.lights.clear();
    this.shields.clear();
    this.preview.visible = false;
  }

  /** Advance a unit's death. Returns false once it is fully gone. */
  private updateDeath(tr: Tracked, dt: number): boolean {
    const u = tr.unit;
    if (tr.dying <= 0) return false;
    if (u.dissolving) {
      // Killed: the sprite burns away from the top while motes of its colour drift off it.
      const k = 1 - tr.dying / tr.dieTotal;
      u.setDissolve(Math.max(0.001, k));
      u.body.position.y += k * 0.25;
      const c = u.root.position.clone();
      c.y += u.body.position.y + u.height * 0.5;
      this.particles.spray(c, u.width * 0.7, u.height * 0.7, tr.color, Math.ceil(dt * 90));
    } else {
      // Slipped through the gate: a quick fade.
      const k = Math.max(0, tr.dying / tr.dieTotal);
      u.material.opacity = k;
      u.body.position.y += (1 - k) * 0.6;
    }
    return true;
  }

  /** Draw a frame. `alpha` is how far we are between the last two sim ticks (0..1). */
  render(dt: number, alpha: number, state: Pick<SimState, "tick" | "hasteUntil">): void {
    this.time += dt;
    const t = this.time;
    const p = this.tmp;

    for (const [id, tr] of this.enemies) {
      const data = tr.unit.root.userData as { lane: number; biting: boolean; shield: boolean };
      const x = tr.prevX + (tr.x - tr.prevX) * alpha;
      toWorld(data.lane, x, p);
      tr.unit.root.position.set(p.x, 0, p.z);
      const moving = !data.biting && tr.dying < 0;
      tr.unit.animate(t, this.camera, { moving, biting: data.biting, speed: Math.abs(tr.x - tr.prevX) * 60 });
      const shield = this.shields.get(id);
      if (shield) {
        shield.visible = data.shield;
        (shield.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(t * 3) * 0.06;
      }
      if (tr.dying >= 0) {
        tr.dying -= dt;
        if (!this.updateDeath(tr, dt)) {
          this.scene.remove(tr.unit.root);
          tr.unit.dispose();
          this.enemies.delete(id);
          this.shields.delete(id);
        }
      }
    }
    for (let i = this.dyingDefenders.length - 1; i >= 0; i--) {
      const tr = this.dyingDefenders[i]!;
      tr.dying -= dt;
      tr.unit.animate(t, this.camera, { moving: false, biting: false, speed: 0 });
      if (!this.updateDeath(tr, dt)) {
        this.scene.remove(tr.unit.root);
        tr.unit.dispose();
        this.dyingDefenders.splice(i, 1);
      }
    }
    this.lanes.update(t, this.laneState);
    for (const tr of this.defenders.values()) {
      tr.unit.animate(t, this.camera, { moving: false, biting: false, speed: 0 });
    }
    for (const [id, l] of this.lights)
      l.intensity = 3.2 + Math.sin(t * 7 + id) * 0.4 + Math.sin(t * 13 + id * 3) * 0.25;
    for (const b of this.bolts.values()) {
      toWorld(b.lane, b.prevX + (b.x - b.prevX) * alpha, b.sprite.position);
      b.sprite.position.y = 0.62;
    }
    this.particles.update(dt);

    // Haste tints the night red; boss waves pull the camera in slightly.
    const haste = state.tick < state.hasteUntil;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.lerp(new THREE.Color(haste ? 0x4a1f45 : 0x2a2050), 0.05);

    this.shake *= 0.9;
    const sx = (Math.random() - 0.5) * this.shake * 0.4 * this.shakeScale;
    const sy = (Math.random() - 0.5) * this.shake * 0.4 * this.shakeScale;
    this.camera.position.x += sx;
    this.camera.position.y += sy;
    this.composer.render(dt);
    this.camera.position.x -= sx;
    this.camera.position.y -= sy;
  }
}
