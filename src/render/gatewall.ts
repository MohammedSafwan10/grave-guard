import * as THREE from "three";
import { BOARD } from "./board";

/** World x of the graveyard wall, just left of column 0. Ghosts that pass it cost a life. */
export const WALL_X = -(BOARD.cols - 1) / 2 - 1.0;
/** Half-width of the opening in the wall where the painted gate stands (centre lane). */
export const GATE_HALF = 0.78;

/**
 * Low mossy stone wall with an iron fence on top, closing off the left end of every lane.
 * Built from boxes so its perspective always matches the board; the painted gate fills the gap in the middle.
 */
export function buildGateWall(stone: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    map: stone,
    color: 0xd2c6f0,
    emissive: 0x2a2050,
    emissiveIntensity: 0.6,
    roughness: 0.95,
  });
  const capMat = new THREE.MeshStandardMaterial({
    map: stone,
    color: 0xe6dcff,
    emissive: 0x2a2050,
    emissiveIntensity: 0.5,
    roughness: 0.9,
  });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3b2b4f, metalness: 0.55, roughness: 0.45 });
  const half = (BOARD.lanes / 2) * BOARD.tile + 0.1;

  // Wall runs in two pieces, from the board's back edge to the gate and from the gate to the front edge.
  const spans: [number, number][] = [
    [-half, -GATE_HALF],
    [GATE_HALF, half],
  ];
  const postGeo = new THREE.BoxGeometry(0.035, 0.5, 0.035);
  const spikeGeo = new THREE.ConeGeometry(0.035, 0.1, 4);
  const posts: THREE.Vector3[] = [];
  for (const [z0, z1] of spans) {
    const len = z1 - z0;
    const mid = (z0 + z1) / 2;
    // One box per tile length, so the stone texture isn't stretched.
    const pieces = Math.max(1, Math.round(len));
    for (let i = 0; i < pieces; i++) {
      const pl = len / pieces;
      const z = z0 + pl * (i + 0.5);
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, pl - 0.02), stoneMat);
      block.position.set(WALL_X, 0.15, z);
      group.add(block);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, pl), capMat);
      cap.position.set(WALL_X, 0.33, z);
      group.add(cap);
    }
    for (let z = z0 + 0.12; z < z1 - 0.06; z += 0.18) posts.push(new THREE.Vector3(WALL_X, 0.61, z));
    for (const y of [0.48, 0.78]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len - 0.1), iron);
      rail.position.set(WALL_X, y, mid);
      group.add(rail);
    }
  }
  const postMesh = new THREE.InstancedMesh(postGeo, iron, posts.length);
  const spikeMesh = new THREE.InstancedMesh(spikeGeo, iron, posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => {
    postMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    spikeMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y + 0.3, p.z));
  });
  group.add(postMesh, spikeMesh);

  // Stone pillars at the two ends of the wall.
  for (const z of [-half, half]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.75, 0.38), stoneMat);
    pillar.position.set(WALL_X, 0.375, z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.46), capMat);
    top.position.set(WALL_X, 0.785, z);
    group.add(pillar, top);
  }
  return group;
}
