import * as THREE from "three";

/** Board layout in world units. One tile = 1 unit. Column 0 sits next to the gate on the left. */
export const BOARD = { lanes: 5, cols: 9, tile: 1 };

/** Sim position (lane, x in tiles) → world position on the ground. */
export function toWorld(lane: number, x: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x - (BOARD.cols - 1) / 2, 0, (lane - (BOARD.lanes - 1) / 2) * BOARD.tile);
}

/** World point on the ground → nearest tile, or null when outside the board. */
export function toTile(p: THREE.Vector3): { lane: number; col: number } | null {
  const col = Math.round(p.x + (BOARD.cols - 1) / 2);
  const lane = Math.round(p.z / BOARD.tile + (BOARD.lanes - 1) / 2);
  if (col < 0 || col >= BOARD.cols || lane < 0 || lane >= BOARD.lanes) return null;
  return { lane, col };
}

/** A soft dark ellipse used as a contact shadow under every unit. */
export function shadowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (!g) throw new Error("2D canvas not available");
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(10,6,25,0.75)");
  grad.addColorStop(0.55, "rgba(10,6,25,0.35)");
  grad.addColorStop(1, "rgba(10,6,25,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft round glow, for lantern light pools and highlights. */
export function glowTexture(color: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (!g) throw new Error("2D canvas not available");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface BoardMeshes {
  group: THREE.Group;
  tiles: THREE.Mesh[][];
  highlights: THREE.Mesh[][];
  ground: THREE.Mesh;
}

export function buildBoard(stone: THREE.Texture, grass: THREE.Texture): BoardMeshes {
  const group = new THREE.Group();

  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(12, 9);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 12),
    new THREE.MeshStandardMaterial({ map: grass, color: 0xd6e2f0, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, 1.2);
  ground.receiveShadow = false;
  group.add(ground);

  // Grass hedges between lanes, like the concept art: they make each lane read as its own row at a glance.
  const hedgeTex = grass.clone();
  hedgeTex.wrapS = hedgeTex.wrapT = THREE.RepeatWrapping;
  hedgeTex.repeat.set(10, 0.3);
  hedgeTex.needsUpdate = true;
  // A little emissive keeps the thin hedges from going black on their shaded sides.
  const hedgeMat = new THREE.MeshStandardMaterial({
    map: hedgeTex,
    color: 0xe4fff0,
    emissive: 0x1d4a3e,
    emissiveIntensity: 0.8,
    roughness: 1,
  });
  for (let i = 0; i <= BOARD.lanes; i++) {
    const outer = i === 0 || i === BOARD.lanes;
    const hedge = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD.cols + 0.1, outer ? 0.16 : 0.12, outer ? 0.24 : 0.16),
      hedgeMat,
    );
    hedge.position.set(0, outer ? 0.05 : 0.04, (i - BOARD.lanes / 2) * BOARD.tile);
    group.add(hedge);
  }

  const tileGeo = new THREE.BoxGeometry(0.9, 0.08, 0.86);
  const tileMat = new THREE.MeshStandardMaterial({ map: stone, color: 0xd8d0f0, roughness: 0.9 });
  const spawnMat = new THREE.MeshStandardMaterial({ map: stone, color: 0x8a7fb5, roughness: 0.95 });
  const hlGeo = new THREE.PlaneGeometry(0.9, 0.86);
  const tiles: THREE.Mesh[][] = [];
  const highlights: THREE.Mesh[][] = [];
  const p = new THREE.Vector3();
  for (let lane = 0; lane < BOARD.lanes; lane++) {
    tiles.push([]);
    highlights.push([]);
    for (let col = 0; col < BOARD.cols; col++) {
      const mesh = new THREE.Mesh(tileGeo, col === BOARD.cols - 1 ? spawnMat : tileMat);
      toWorld(lane, col, p);
      mesh.position.set(p.x, 0.02, p.z);
      // Tiny random tilt and height so the stones look laid by hand, not by a grid.
      mesh.rotation.y = (((lane * 7 + col * 13) % 5) - 2) * 0.012;
      mesh.position.y += (((lane * 3 + col * 5) % 4) - 1.5) * 0.006;
      group.add(mesh);
      tiles[lane]!.push(mesh);

      const hl = new THREE.Mesh(
        hlGeo,
        new THREE.MeshBasicMaterial({ color: 0x5ff0e6, transparent: true, opacity: 0, depthWrite: false }),
      );
      hl.rotation.x = -Math.PI / 2;
      hl.position.set(p.x, 0.075, p.z);
      hl.visible = false;
      group.add(hl);
      highlights[lane]!.push(hl);
    }
  }
  return { group, tiles, highlights, ground };
}
