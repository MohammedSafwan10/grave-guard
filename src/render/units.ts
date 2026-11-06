import * as THREE from "three";
import type { ArtEntry } from "../app/assets";

/** World size of each sprite's longest side. */
export const UNIT_SIZE: Record<string, number> = {
  "defenders/def_lantern": 0.95,
  "defenders/def_gargoyle": 0.95,
  "defenders/def_coffin": 1.0,
  "defenders/def_salt_rune": 0.95,
  "defenders/def_bell": 1.15,
  "enemies/enemy_wisp": 1.0,
  "enemies/enemy_shade": 1.15,
  "enemies/enemy_bone_knight": 1.2,
  "enemies/enemy_wraith": 1.3,
  "enemies/enemy_lich": 2.0,
};

export type Motion = "breathe" | "float" | "step" | "flat" | "hover";

// Value noise in the fragment shader drives the dissolve. Every unit shares one compiled program
// (same cache key); each material still gets its own uniform values.
const DISSOLVE_GLSL = /* glsl */ `
uniform float uDissolve;
uniform vec3 uEdge;
float ggHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ggNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ggHash(i), ggHash(i + vec2(1.0, 0.0)), f.x), mix(ggHash(i + vec2(0.0, 1.0)), ggHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;
const DISSOLVE_APPLY = /* glsl */ `
if (uDissolve > 0.0) {
  float n = ggNoise(vMapUv * 7.0) * 0.65 + ggNoise(vMapUv * 21.0) * 0.35;
  // Burn from the top down, so the ghost seems to drift away upward.
  n = mix(n, 1.0 - vMapUv.y, 0.35);
  float cut = uDissolve * 1.1 - 0.05;
  if (n < cut) discard;
  float edge = 1.0 - smoothstep(0.0, 0.07, n - cut);
  diffuseColor.rgb = mix(diffuseColor.rgb, uEdge * 2.4, edge * step(0.01, diffuseColor.a));
}`;

/**
 * A painted sprite standing on the board. The picture is a plane that turns to face the camera,
 * with its pivot at the manifest anchor so feet stay on the tile.
 */
export class SpriteUnit {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  private flashUntil = 0;
  private readonly baseColor: THREE.Color;
  private readonly dissolve = { value: 0 };
  private readonly edge = { value: new THREE.Color(0x5ff0e6) };
  private hpBar: { group: THREE.Group; fill: THREE.Mesh } | null = null;
  readonly phase = Math.random() * Math.PI * 2;
  /** Current visual offset from hits (knockback), decays every frame. */
  kick = 0;
  width: number;
  height: number;

  constructor(
    texture: THREE.Texture,
    art: ArtEntry,
    size: number,
    shadowTex: THREE.Texture,
    readonly motion: Motion,
    tint = 0xe8e2ff,
  ) {
    const w = art.aspect >= 1 ? size : size * art.aspect;
    const h = art.aspect >= 1 ? size / art.aspect : size;
    this.width = w;
    this.height = h;
    this.baseColor = new THREE.Color(tint);
    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      color: this.baseColor.clone(),
    });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uDissolve = this.dissolve;
      shader.uniforms.uEdge = this.edge;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${DISSOLVE_GLSL}`)
        .replace("#include <map_fragment>", `#include <map_fragment>\n${DISSOLVE_APPLY}`);
    };
    this.material.customProgramCacheKey = () => "gg-dissolve";
    const geo = new THREE.PlaneGeometry(w, h);
    // Move the pivot to the anchor point (e.g. bottom-centre for standing units).
    geo.translate(w * (0.5 - art.anchor[0]), h * (art.anchor[1] - 0.5), 0);
    this.mesh = new THREE.Mesh(geo, this.material);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.07;
    this.shadow.scale.set(Math.min(1, w * 0.85), Math.min(0.6, w * 0.4), 1);

    if (motion === "flat") {
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.08;
      this.shadow.visible = false;
    }
    this.body.add(this.mesh);
    this.root.add(this.shadow, this.body);
  }

  /** Top of the sprite above its anchor, for things that float over the unit. */
  get top(): number {
    if (!this.mesh.geometry.boundingBox) this.mesh.geometry.computeBoundingBox();
    return this.mesh.geometry.boundingBox?.max.y ?? this.height;
  }

  flash(now: number): void {
    this.flashUntil = now + 0.08;
    this.kick = 0.06;
  }

  /** True once a death dissolve has started. */
  get dissolving(): boolean {
    return this.dissolve.value > 0;
  }

  /** 0 = whole, 1 = gone. The burning edge takes `edgeHex`. */
  setDissolve(amount: number, edgeHex?: number): void {
    this.dissolve.value = amount;
    if (edgeHex !== undefined) this.edge.value.setHex(edgeHex);
  }

  /** Small health bar over the unit; hidden while at full health. Length shows health, so it reads without colour. */
  setHealth(frac: number): void {
    if (!this.hpBar) {
      const group = new THREE.Group();
      const back = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.09),
        new THREE.MeshBasicMaterial({ color: 0x1b1533, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      const fillGeo = new THREE.PlaneGeometry(0.56, 0.05);
      fillGeo.translate(0.28, 0, 0); // grow from the left edge
      const fill = new THREE.Mesh(
        fillGeo,
        new THREE.MeshBasicMaterial({ color: 0xff6f8f, depthWrite: false, transparent: true }),
      );
      fill.position.set(-0.28, 0, 0.001);
      group.add(back, fill);
      group.renderOrder = 10;
      back.renderOrder = 10;
      fill.renderOrder = 11;
      group.position.y = this.top + 0.12;
      this.body.add(group);
      this.hpBar = { group, fill };
    }
    const f = Math.max(0, Math.min(1, frac));
    this.hpBar.group.visible = f > 0 && f < 0.999 && this.dissolve.value === 0;
    this.hpBar.fill.scale.x = Math.max(0.001, f);
  }

  /** Per-frame animation. `t` is seconds. */
  animate(t: number, camera: THREE.Camera, opts: { moving: boolean; biting: boolean; speed: number }): void {
    if (this.motion !== "flat") this.mesh.quaternion.copy(camera.quaternion);
    const p = this.phase;
    let y = 0;
    let sx = 1;
    let sy = 1;
    let lean = 0;
    switch (this.motion) {
      case "breathe":
        sy = 1 + Math.sin(t * 2 * Math.PI * 0.8 + p) * 0.02;
        sx = 1 - (sy - 1) * 0.5;
        break;
      case "float":
        y = 0.35 + Math.sin(t * 2 * Math.PI * 1.1 + p) * 0.07;
        lean = opts.moving ? 0.06 + Math.sin(t * 3 + p) * 0.03 : Math.sin(t * 2 + p) * 0.03;
        break;
      case "hover":
        y = 0.12 + Math.sin(t * 2 * Math.PI * 0.5 + p) * 0.05;
        break;
      case "step": {
        // Step-bob: two bounces per stride, tilting side to side, timed to walking speed.
        const f = opts.moving ? 2.2 * Math.max(0.6, opts.speed / 0.25) : 0.6;
        const s = Math.sin(t * Math.PI * f + p);
        y = opts.moving ? Math.abs(s) * 0.06 : 0;
        lean = opts.moving ? s * 0.07 : 0;
        break;
      }
      case "flat":
        this.mesh.rotation.z = t * 0.25;
        this.material.opacity = 0.85 + Math.sin(t * 3 + p) * 0.15;
        break;
    }
    if (opts.biting) {
      const b = Math.max(0, Math.sin(t * 9 + p));
      lean += b * 0.12;
      sx *= 1 + b * 0.04;
    }
    this.kick *= 0.85;
    this.body.position.set(this.kick, y, 0);
    this.body.scale.set(sx, sy, 1);
    if (this.motion !== "flat") this.mesh.rotateZ(lean);
    if (this.hpBar) this.hpBar.group.quaternion.copy(camera.quaternion);
    const shadowMat = this.shadow.material as THREE.MeshBasicMaterial;
    shadowMat.opacity = (this.motion === "float" ? 0.55 - y * 0.4 : 1) * (1 - this.dissolve.value);

    const flashing = t < this.flashUntil;
    this.material.color.copy(this.baseColor);
    if (flashing) this.material.color.setScalar(3);
  }

  setTint(hex: number): void {
    this.baseColor.set(hex);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    if (this.hpBar) {
      for (const m of this.hpBar.group.children as THREE.Mesh[]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    }
  }
}
