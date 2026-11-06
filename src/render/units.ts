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

  flash(now: number): void {
    this.flashUntil = now + 0.08;
    this.kick = 0.06;
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
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = this.motion === "float" ? 0.55 - y * 0.4 : 1;

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
  }
}
