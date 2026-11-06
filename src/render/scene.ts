import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Assets } from "../app/assets";
import type { DefenderKind, EnemyKind, SimEvent, SimState } from "../sim";
import { BOARD, buildBoard, glowTexture, shadowTexture, toTile, toWorld, type BoardMeshes } from "./board";
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
  dying: number; // seconds left in the death fade, -1 while alive
}

/** Width of the screen covered by the spellbook on desktop. The board is framed in the rest. */
export const PANEL_FRACTION = 0.28;

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
  private readonly bolts = new Map<number, { sprite: THREE.Sprite; prevX: number; x: number; lane: number }>();
  private readonly lights = new Map<number, THREE.PointLight>();
  private readonly shields = new Map<number, THREE.Mesh>();
  private readonly particles: Particles;
  private readonly boltMaterial: THREE.SpriteMaterial;
  private readonly preview: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly tmp = new THREE.Vector3();
  private shake = 0;
  private time = 0;
  private hover: { lane: number; col: number } | null = null;
  private panelFraction = PANEL_FRACTION;

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
    this.buildLights();

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
    const gate = this.plane("backgrounds/fg_gate_left", 4.4, new THREE.Vector3(-5.75, 0, -0.2));
    gate.geometry.translate(0, 2.2, 0); // stand on the ground
    gate.rotation.y = 0.55;
    gate.rotation.x = -0.2;
    this.gate = gate;
  }
  private gate!: THREE.Mesh;

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xb3a9f0, 0x3a2b5c, 1.7));
    const moon = new THREE.DirectionalLight(0xd6deff, 2.2);
    moon.position.set(-6, 10, -4);
    this.scene.add(moon);
    const gateLamp = new THREE.PointLight(0xffb35c, 9, 6, 1.6);
    gateLamp.position.set(-5.2, 1.8, 0.6);
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
    const usable = w * (1 - this.panelFraction);
    const aspect = usable / (h * 0.86);
    // Fit ~12.5 units wide (board + gate) or ~7.4 units deep, whichever is tighter.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const needH = Math.max(7.4, 12.5 / aspect);
    const dist = needH / 2 / Math.tan(fov / 2);
    const pitch = THREE.MathUtils.degToRad(40);
    this.camera.position.set(-0.4, Math.sin(pitch) * dist, Math.cos(pitch) * dist + 0.4);
    this.camera.lookAt(-0.4, 0, 0.4);
    this.camera.aspect = w / h;
    // Shift the picture left (and slightly up, for the shop) so the board centres in the free area.
    this.camera.setViewOffset(w, h, (w * this.panelFraction) / 2, h * 0.04, w, h);
    this.camera.updateProjectionMatrix();
  }

  /** Pointer position (client px) → board tile under it. */
  pick(clientX: number, clientY: number): { lane: number; col: number } | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmp);
    return hit ? toTile(hit) : null;
  }

  /** Show valid tiles and a see-through preview while a shop card is selected. */
  setPlacement(kind: DefenderKind | null, valid: (lane: number, col: number) => boolean, hover: { lane: number; col: number } | null): void {
    this.hover = hover;
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
            t.dying = 0.45;
            const color = ENEMY_ART[e.kind].color;
            this.particles.burst(t.unit.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), color, e.kind === "lich" ? 80 : 26);
          }
          break;
        }
        case "gateBreached":
          this.shake = 0.35;
          this.particles.burst(new THREE.Vector3(-4.9, 0.8, (e.lane - 2) * 1), 0xff7088, 30);
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
          if (t) this.particles.burst(t.unit.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x5ff0e6, 60);
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
    const seen = new Set<number>();
    for (const e of state.enemies) {
      seen.add(e.id);
      let t = this.enemies.get(e.id);
      if (!t) {
        const { key, motion } = ENEMY_ART[e.kind];
        const unit = new SpriteUnit(this.assets.texture(key), this.assets.art(key), UNIT_SIZE[key] ?? 1, this.shadowTex, motion);
        this.scene.add(unit.root);
        t = { unit, prevX: e.x, x: e.x, dying: -1 };
        this.enemies.set(e.id, t);
        if (e.kind === "lich") this.addShield(e.id, unit);
      }
      t.x = e.x;
      t.unit.root.userData = { lane: e.lane, biting: e.biting !== null, shield: e.shield };
    }
    for (const [id, t] of this.enemies) if (!seen.has(id) && t.dying < 0) t.dying = 0.3;

    const seenD = new Set<number>();
    for (const d of state.defenders) {
      seenD.add(d.id);
      if (!this.defenders.has(d.id)) {
        const { key, motion } = DEFENDER_ART[d.kind];
        const unit = new SpriteUnit(this.assets.texture(key), this.assets.art(key), UNIT_SIZE[key] ?? 1, this.shadowTex, motion, 0xf4f0ff);
        toWorld(d.lane, d.col, unit.root.position);
        this.scene.add(unit.root);
        this.defenders.set(d.id, { unit, prevX: d.col, x: d.col, dying: -1 });
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
      }
    }
    for (const [id, t] of this.defenders) {
      if (!seenD.has(id)) {
        this.scene.remove(t.unit.root);
        t.unit.dispose();
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
    for (const t of [...this.enemies.values(), ...this.defenders.values()]) {
      this.scene.remove(t.unit.root);
      t.unit.dispose();
    }
    for (const b of this.bolts.values()) this.scene.remove(b.sprite);
    for (const l of this.lights.values()) this.scene.remove(l);
    this.enemies.clear();
    this.defenders.clear();
    this.bolts.clear();
    this.lights.clear();
    this.shields.clear();
    this.preview.visible = false;
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
        const k = Math.max(0, tr.dying / 0.45);
        tr.unit.material.opacity = k;
        tr.unit.body.position.y += (1 - k) * 0.6;
        tr.unit.body.scale.multiplyScalar(0.8 + 0.2 * k);
        if (tr.dying <= 0) {
          this.scene.remove(tr.unit.root);
          tr.unit.dispose();
          this.enemies.delete(id);
          this.shields.delete(id);
        }
      }
    }
    for (const tr of this.defenders.values()) {
      tr.unit.animate(t, this.camera, { moving: false, biting: false, speed: 0 });
    }
    for (const [id, l] of this.lights) l.intensity = 3.2 + Math.sin(t * 7 + id) * 0.4 + Math.sin(t * 13 + id * 3) * 0.25;
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
    const sx = (Math.random() - 0.5) * this.shake * 0.4;
    const sy = (Math.random() - 0.5) * this.shake * 0.4;
    this.camera.position.x += sx;
    this.camera.position.y += sy;
    this.composer.render(dt);
    this.camera.position.x -= sx;
    this.camera.position.y -= sy;
    void this.hover;
    void this.gate;
  }
}
