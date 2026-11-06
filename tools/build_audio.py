"""Build web-ready audio from the originals.

Reads   assets-src/music/*.mp3   (Lyria originals, never modified)
        assets-src/sfx/*.ogg     (Kenney CC0 originals)
Writes  public/assets/audio/music/*.mp3   loops: seamless, stings: short with fades
        public/assets/audio/sfx/*.mp3     peak-levelled, mono
        public/assets/audio-manifest.json

Needs ffmpeg on PATH.  Run:  python tools/build_audio.py
To change where a sting is cut, edit STINGS below and run again.
"""
import json
import re
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC_MUSIC = ROOT / "assets-src" / "music"
SRC_SFX = ROOT / "assets-src" / "sfx"
OUT = ROOT / "public" / "assets" / "audio"
SR = 44100

LOOP_LUFS = -18.0   # background music sits under the SFX
STING_LUFS = -16.0
SFX_PEAK_DB = -3.0
LOOPS = ["music_menu", "music_battle", "music_boss", "music_calm"]
LOOP_XFADE = 2.0    # seconds of crossfade where the loop wraps
# Stings: (min, max) length in seconds. The cut lands at the quietest moment in that window.
# Set "start"/"end" to force exact times (seconds in the original file) after listening.
STINGS = {
    "sting_wave_start": {"min": 4.0, "max": 7.5},
    "sting_boss_intro": {"min": 4.0, "max": 8.0},
    "sting_victory": {"min": 4.0, "max": 8.0},
    "sting_defeat": {"min": 4.0, "max": 8.5},
}


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def encode(y: np.ndarray, dst: Path, lufs: float | None, bitrate: str, mono: bool = False) -> None:
    """Write MP3. If lufs is set, do two-pass linear loudness normalisation (no pumping)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(y, -1, 1).astype(np.float32).tobytes()
    base = ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-"]
    af = []
    if lufs is not None:
        res = subprocess.run(["ffmpeg", "-hide_banner", "-v", "info", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-"] +
                             ["-af", f"loudnorm=I={lufs}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                             input=pcm, capture_output=True, check=True)
        m = json.loads(re.findall(r"\{[^{}]+\}", res.stderr.decode(errors="ignore"))[-1])
        af.append(f"loudnorm=I={lufs}:TP=-1.5:LRA=11:linear=true:measured_I={m['input_i']}:"
                  f"measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
                  f"offset={m['target_offset']}")
        af.append(f"aresample={SR}")
    cmd = base + (["-af", ",".join(af)] if af else []) + (["-ac", "1"] if mono else []) + \
        ["-c:a", "libmp3lame", "-b:a", bitrate, str(dst)]
    subprocess.run(cmd, input=pcm, check=True)


def level_db(y: np.ndarray, block: float) -> np.ndarray:
    w = int(SR * block)
    m = y.mean(axis=1)[: len(y) // w * w].reshape(-1, w)
    return 20 * np.log10(np.sqrt((m ** 2).mean(axis=1)) + 1e-9)


def trim_lead(y: np.ndarray, thresh_db: float = -45) -> np.ndarray:
    db = level_db(y, 0.01)
    loud = np.nonzero(db > thresh_db)[0]
    return y[max(0, loud[0] - 2) * int(SR * 0.01):] if len(loud) else y


def spectrogram(y: np.ndarray) -> tuple[np.ndarray, int]:
    """Log-energy in 64 frequency bands per frame (hop ~23 ms), for comparing moments of the music."""
    seg = y.mean(axis=1)
    n, hop = 2048, 1024
    frames = np.lib.stride_tricks.sliding_window_view(seg, n)[::hop] * np.hanning(n)
    mag = np.abs(np.fft.rfft(frames, axis=1))[:, 1:801]
    edges = np.unique(np.geomspace(1, 800, 65).astype(int))
    bands = np.add.reduceat(mag, edges[:-1] - 1, axis=1)
    return np.log1p(bands), hop


def make_loop(y: np.ndarray) -> tuple[np.ndarray, dict]:
    """Cut the track into a seamless loop.

    1. Drop leading silence and the final fade-out.
    2. Search a start point S (first 15 s) and an end point E (last ~14 s of full-level music)
       where the 3 s after E sound most like the 3 s after S: same chord, same beat position.
    3. Output y[S:E], with its first X seconds crossfaded from y[E:E+X] into y[S:S+X].
       When playback wraps from the last sample (y[E-1]) to the first, it continues as y[E].
    """
    y = trim_lead(y)
    db = level_db(y, 0.5)
    loud_blocks = np.nonzero(db > np.median(db) - 10)[0]
    fade_start = int((loud_blocks[-1] + 1) * 0.5 * SR)
    x = int(LOOP_XFADE * SR)
    spec, hop = spectrogram(y)
    win = int(3.0 * SR / hop)

    def window(i: int) -> np.ndarray:
        v = spec[i:i + win].ravel()
        v = v - v.mean()
        return v / (np.linalg.norm(v) + 1e-9)

    e_hi = (fade_start - x - int(3.0 * SR)) // hop
    e_lo = e_hi - int(14 * SR / hop)
    e_mat = np.stack([window(i) for i in range(e_lo, e_hi)])
    best = (-1.0, 0, 0)
    for s in range(0, int(15 * SR / hop), max(1, int(0.25 * SR / hop))):
        scores = e_mat @ window(s)
        j = int(np.argmax(scores))
        if scores[j] > best[0]:
            best = (float(scores[j]), s, e_lo + j)
    score, s_f, e_f = best
    # refine to the exact sample: align waveforms around the seam (±1 frame)
    s, e = s_f * hop, e_f * hop
    mono = y.mean(axis=1)
    ref = mono[s:s + 4096]
    shifts = range(-hop, hop + 1, 8)
    e += max(shifts, key=lambda d: float(np.dot(ref, mono[e + d:e + d + 4096])))
    out = y[s:e].copy()
    t = np.linspace(0, np.pi / 2, x)[:, None]
    out[:x] = y[s:s + x] * np.sin(t) + y[e:e + x] * np.cos(t)   # equal-power crossfade
    return out, {"seconds": round(len(out) / SR, 2), "match": round(score, 3),
                 "cutStart": round(s / SR, 2), "cutEnd": round(e / SR, 2)}


def make_sting(y: np.ndarray, rule: dict) -> tuple[np.ndarray, dict]:
    if "start" in rule:
        y = y[int(rule["start"] * SR):]
    else:
        y = trim_lead(y)
    if "end" in rule:
        cut = int((rule["end"] - rule.get("start", 0)) * SR)
    else:
        db = level_db(y, 0.1)
        lo, hi = int(rule["min"] / 0.1), int(rule["max"] / 0.1)
        cut = int((lo + int(np.argmin(db[lo:hi]))) * 0.1 * SR)
    out = y[:cut].copy()
    fin, fout = int(0.01 * SR), int(min(1.0, len(out) / SR * 0.2) * SR)
    out[:fin] *= np.linspace(0, 1, fin)[:, None]
    out[-fout:] *= np.linspace(1, 0, fout)[:, None] ** 2
    return out, {"seconds": round(len(out) / SR, 2)}


def main() -> None:
    manifest = {"music": {}, "sfx": {}}
    for name in LOOPS:
        y, info = make_loop(decode(SRC_MUSIC / f"{name}.mp3"))
        encode(y, OUT / "music" / f"{name}.mp3", LOOP_LUFS, "128k")
        manifest["music"][name] = {"url": f"/assets/audio/music/{name}.mp3", "loop": True, **info}
        print(f"{name:20} loop {info['seconds']:6.1f}s  cut {info['cutStart']}s-{info['cutEnd']}s  (seam match {info['match']})")
    for name, rule in STINGS.items():
        y, info = make_sting(decode(SRC_MUSIC / f"{name}.mp3"), rule)
        encode(y, OUT / "music" / f"{name}.mp3", STING_LUFS, "160k")
        manifest["music"][name] = {"url": f"/assets/audio/music/{name}.mp3", "loop": False, **info}
        print(f"{name:20} sting {info['seconds']:5.1f}s")
    for src in sorted(SRC_SFX.glob("*.ogg")):
        y = decode(src)
        peak = float(np.abs(y).max()) or 1.0
        y = y * (10 ** (SFX_PEAK_DB / 20) / peak)
        encode(y, OUT / "sfx" / f"{src.stem}.mp3", None, "96k", mono=True)
        manifest["sfx"][src.stem] = {"url": f"/assets/audio/sfx/{src.stem}.mp3", "seconds": round(len(y) / SR, 2)}
    print(f"{len(manifest['sfx'])} sfx converted")
    (ROOT / "public" / "assets" / "audio-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.rglob("*.mp3"))
    print(f"audio total {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
