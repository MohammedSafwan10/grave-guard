import type { Manifests } from "../app/assets";

/**
 * Web Audio playback. SFX names like "gargoyle_shoot" pick a random variant (_1, _2, ...)
 * and a small random pitch so repeated sounds don't feel robotic.
 */
export class AudioSystem {
  readonly ctx = new AudioContext();
  private readonly sfxBus = this.ctx.createGain();
  private readonly musicBus = this.ctx.createGain();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly variants = new Map<string, string[]>();
  private readonly lastPlayed = new Map<string, number>();
  private music: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private ambience: AudioNode | null = null;

  constructor(private readonly manifest: Manifests["audio"]) {
    this.sfxBus.connect(this.ctx.destination);
    this.musicBus.connect(this.ctx.destination);
    this.sfxBus.gain.value = 0.8;
    this.musicBus.gain.value = 0.55;
    for (const name of Object.keys(manifest.sfx)) {
      const base = name.replace(/_\d+$/, "");
      this.variants.set(base, [...(this.variants.get(base) ?? []), name]);
    }
  }

  /** Browsers only allow audio after a user gesture. Call from a click handler. */
  async unlock(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  private async load(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url}`);
    return this.ctx.decodeAudioData(await res.arrayBuffer());
  }

  async loadSfx(): Promise<void> {
    await Promise.all(
      Object.entries(this.manifest.sfx).map(async ([name, e]) => this.buffers.set(name, await this.load(e.url))),
    );
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxBus.gain.value = sfx;
    this.musicBus.gain.value = music;
  }

  play(name: string, opts: { volume?: number; pitch?: number; minGapMs?: number } = {}): void {
    const options = this.variants.get(name) ?? (this.buffers.has(name) ? [name] : []);
    if (options.length === 0 || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const gap = (opts.minGapMs ?? 40) / 1000;
    if (now - (this.lastPlayed.get(name) ?? -1) < gap) return;
    this.lastPlayed.set(name, now);
    const pick = options[Math.floor(Math.random() * options.length)];
    const buffer = pick ? this.buffers.get(pick) : undefined;
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = (opts.pitch ?? 1) * (0.95 + Math.random() * 0.1);
    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  /** Crossfade to a music track (loops) or play a one-shot sting over the music. */
  async playMusic(name: string, fadeSec = 1.5): Promise<void> {
    if (this.music?.name === name) return;
    const entry = this.manifest.music[name];
    if (!entry) return;
    const buffer = this.buffers.get(name) ?? (await this.load(entry.url));
    this.buffers.set(name, buffer);
    const t = this.ctx.currentTime;
    if (this.music) {
      const old = this.music;
      old.gain.gain.setTargetAtTime(0, t, fadeSec / 4);
      old.src.stop(t + fadeSec * 2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, t, fadeSec / 4);
    src.connect(gain).connect(this.musicBus);
    src.start();
    this.music = { name, src, gain };
  }

  async sting(name: string, duck = true): Promise<void> {
    const entry = this.manifest.music[name];
    if (!entry || this.ctx.state !== "running") return;
    const buffer = this.buffers.get(name) ?? (await this.load(entry.url));
    this.buffers.set(name, buffer);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.sfxBus);
    src.start();
    if (duck && this.music) {
      const g = this.music.gain.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0.35, t, 0.1);
      g.setTargetAtTime(1, t + buffer.duration * 0.8, 0.6);
    }
  }

  stopMusic(fadeSec = 1): void {
    if (!this.music) return;
    const t = this.ctx.currentTime;
    this.music.gain.gain.setTargetAtTime(0, t, fadeSec / 4);
    this.music.src.stop(t + fadeSec * 2);
    this.music = null;
  }

  /** Procedural night wind: filtered noise with a slow swell. We own it outright. */
  startAmbience(): void {
    if (this.ambience) return;
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.985 + (Math.random() * 2 - 1) * 0.015; // brown-ish noise
        d[i] = last * 6;
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 500;
    filter.Q.value = 0.6;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    const g = this.ctx.createGain();
    g.gain.value = 0.18;
    src.connect(filter).connect(g).connect(this.musicBus);
    src.start();
    lfo.start();
    this.ambience = g;
  }

  /** Procedural ghost whoosh for spawns: a quick filtered noise sweep. */
  whoosh(volume = 0.25): void {
    if (this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.8);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 4;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.8);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start();
  }
}
