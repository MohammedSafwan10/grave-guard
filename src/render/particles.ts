import * as THREE from "three";

const MAX = 600;

/** One pooled point cloud for every spark in the game (bursts, rings). Cheap: a single draw call. */
export class Particles {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private next = 0;

  constructor(texture: THREE.Texture) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor * t.a, t.a);
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  private emit(p: THREE.Vector3, color: THREE.Color, vx: number, vy: number, vz: number, life: number, size: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
  }

  burst(at: THREE.Vector3, hex: number, count: number): void {
    const c = new THREE.Color(hex);
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.6;
      this.emit(at, c, Math.cos(a) * s, 0.6 + Math.random() * 1.8, Math.sin(a) * s * 0.6, 0.5 + Math.random() * 0.6, 0.12 + Math.random() * 0.14);
    }
  }

  ring(at: THREE.Vector3, hex: number): void {
    const c = new THREE.Color(hex);
    for (let n = 0; n < 90; n++) {
      const a = (n / 90) * Math.PI * 2;
      this.emit(at, c, Math.cos(a) * 6, 0.2, Math.sin(a) * 4, 0.9, 0.22);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const l = this.life[i]!;
      if (l <= 0) {
        this.size[i] = 0;
        continue;
      }
      const nl = l - dt;
      this.life[i] = nl;
      const k = Math.max(0, nl / this.maxLife[i]!);
      this.pos[i * 3] = this.pos[i * 3]! + this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1] = this.pos[i * 3 + 1]! + this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2] = this.pos[i * 3 + 2]! + this.vel[i * 3 + 2]! * dt;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! - 1.2 * dt;
      this.vel[i * 3] = this.vel[i * 3]! * 0.97;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2]! * 0.97;
      if (nl <= 0) this.size[i] = 0;
      else this.size[i] = this.size[i]! * (0.985 + 0.015 * k);
    }
    const geo = this.points.geometry;
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.color!.needsUpdate = true;
    geo.attributes.size!.needsUpdate = true;
  }
}
