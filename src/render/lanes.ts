import * as THREE from "three";
import type { EnemyKind, SimState } from "../sim";
import { BOARD, toWorld } from "./board";
import { WALL_X } from "./gatewall";

/** How early (seconds) the lane warning shows before a ghost appears. */
const WARN_SEC = 2.5;
/** Ghosts closer than this to the gate (in tiles) make their lane flash a warning at the wall. */
const DANGER_X = 2.5;

interface LaneParts {
  mist: THREE.Mesh;
  icon: THREE.Sprite;
  ring: THREE.Mesh;
  danger: THREE.Mesh;
}

/**
 * Lane signals, so players always know where trouble comes from:
 * - a soft mist on each spawn tile that flares and shows the incoming ghost's portrait just before it appears;
 * - a pulsing glow at the wall when a ghost gets close to the gate in that lane.
 * Each signal uses motion and shape as well as colour.
 */
export class LaneSignals {
  readonly group = new THREE.Group();
  private readonly lanes: LaneParts[] = [];

  constructor(
    glow: THREE.Texture,
    private readonly portrait: (kind: EnemyKind) => THREE.Texture,
  ) {
    const p = new THREE.Vector3();
    for (let lane = 0; lane < BOARD.lanes; lane++) {
      toWorld(lane, BOARD.cols - 1, p);
      const mist = this.flat(glow, 0x5ff0e6, 1.3, 0.9);
      mist.position.set(p.x, 0.08, p.z);

      const ring = this.flat(glow, 0x5ff0e6, 0.9, 0.9);
      ring.position.set(p.x + 0.95, 0.09, p.z);
      const icon = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }),
      );
      icon.position.set(p.x + 0.95, 0.6, p.z);
      icon.scale.set(0.6, 0.6, 1);
      icon.visible = false;

      const danger = this.flat(glow, 0xff6f8f, 1.1, 0.95);
      danger.position.set(WALL_X + 0.45, 0.09, p.z);
      danger.visible = false;

      this.group.add(mist, ring, icon, danger);
      this.lanes.push({ mist, icon, ring, danger });
    }
  }

  private flat(tex: THREE.Texture, color: number, w: number, h: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: tex,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  update(t: number, state: Pick<SimState, "tick" | "wave" | "enemies"> | null): void {
    const soon: (EnemyKind | null)[] = new Array<EnemyKind | null>(BOARD.lanes).fill(null);
    const near: boolean[] = new Array<boolean>(BOARD.lanes).fill(false);
    if (state) {
      const horizon = state.tick + WARN_SEC * 60;
      for (const s of state.wave.queue) {
        if (s.tick >= state.tick && s.tick <= horizon && soon[s.lane] === null) soon[s.lane] = s.kind;
      }
      for (const e of state.enemies) if (e.x < DANGER_X) near[e.lane] = true;
    }
    this.lanes.forEach((l, lane) => {
      const kind = soon[lane] ?? null;
      const pulse = 0.5 + 0.5 * Math.sin(t * 7 + lane);
      (l.mist.material as THREE.MeshBasicMaterial).opacity = kind
        ? 0.35 + pulse * 0.35
        : 0.12 + 0.05 * Math.sin(t * 1.3 + lane * 1.7);
      (l.ring.material as THREE.MeshBasicMaterial).opacity = kind ? 0.4 + pulse * 0.4 : 0;
      l.ring.scale.setScalar(kind ? 0.8 + pulse * 0.3 : 1);
      const iconMat = l.icon.material;
      if (kind) {
        const tex = this.portrait(kind);
        if (iconMat.map !== tex) {
          iconMat.map = tex;
          iconMat.needsUpdate = true;
          const img = tex.image as { width: number; height: number } | undefined;
          const aspect = img ? img.width / img.height : 1;
          l.icon.scale.set(aspect >= 1 ? 0.6 : 0.6 * aspect, aspect >= 1 ? 0.6 / aspect : 0.6, 1);
        }
        l.icon.visible = true;
        iconMat.opacity = Math.min(1, iconMat.opacity + 0.08);
        l.icon.position.y = 0.6 + Math.sin(t * 4 + lane) * 0.05;
      } else {
        iconMat.opacity = Math.max(0, iconMat.opacity - 0.08);
        l.icon.visible = iconMat.opacity > 0;
      }
      l.danger.visible = near[lane] ?? false;
      (l.danger.material as THREE.MeshBasicMaterial).opacity = 0.3 + pulse * 0.5;
      l.danger.scale.set(1, 0.85 + pulse * 0.25, 1);
    });
  }
}
