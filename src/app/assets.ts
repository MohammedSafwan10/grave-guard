import * as THREE from "three";

export interface ArtEntry {
  url: string;
  width: number;
  height: number;
  aspect: number;
  anchor: [number, number];
  transparent: boolean;
}
export interface AudioEntry {
  url: string;
  seconds: number;
  loop?: boolean;
}
export interface Manifests {
  art: Record<string, ArtEntry>;
  audio: { music: Record<string, AudioEntry>; sfx: Record<string, AudioEntry> };
}

export interface Assets {
  manifests: Manifests;
  textures: Map<string, THREE.Texture>;
  art(key: string): ArtEntry;
  texture(key: string): THREE.Texture;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return (await res.json()) as T;
}

/** Load manifests and every texture the battle needs. `onProgress` gets 0..1. */
export async function loadAssets(onProgress: (p: number) => void): Promise<Assets> {
  const [art, audio] = await Promise.all([
    getJson<Manifests["art"]>("/assets/art-manifest.json"),
    getJson<Manifests["audio"]>("/assets/audio-manifest.json"),
  ]);
  const loader = new THREE.TextureLoader();
  const keys = Object.keys(art).filter((k) => !k.startsWith("ui/"));
  const textures = new Map<string, THREE.Texture>();
  let done = 0;
  await Promise.all(
    keys.map(async (key) => {
      const entry = art[key];
      if (!entry) return;
      try {
        const tex = await loader.loadAsync(entry.url);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        textures.set(key, tex);
      } catch {
        throw new Error(`Could not load ${entry.url}`);
      }
      onProgress(++done / keys.length);
    }),
  );
  return {
    manifests: { art, audio },
    textures,
    art(key) {
      const a = art[key];
      if (!a) throw new Error(`Missing art "${key}" in art-manifest.json`);
      return a;
    },
    texture(key) {
      const t = textures.get(key);
      if (!t) throw new Error(`Texture "${key}" not loaded`);
      return t;
    },
  };
}
