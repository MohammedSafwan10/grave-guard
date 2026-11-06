# Credits and Asset Sources

Grave Guard: Moonbloom Hollow uses only assets we created or that are public domain (CC0).

## Sound effects — Kenney (CC0)

All files in `public/assets/audio/sfx/` (originals in `assets-src/sfx/`) come from these Kenney packs,
licensed **Creative Commons Zero (CC0)**: https://creativecommons.org/publicdomain/zero/1.0/
Credit is not required, but we give it gladly. Thank you, Kenney (https://kenney.nl).

| Pack | URL |
|---|---|
| Impact Sounds | https://kenney.nl/assets/impact-sounds |
| Interface Sounds | https://kenney.nl/assets/interface-sounds |
| RPG Audio | https://kenney.nl/assets/rpg-audio |
| UI Audio | https://kenney.nl/assets/ui-audio |
| Sci-Fi Sounds | https://kenney.nl/assets/sci-fi-sounds |

## Procedural audio

Wind ambience, ghost whooshes and soul-energy shimmer are synthesized in code with the Web Audio API.

## AI-generated art and music

Created by the team with AI tools. Google and OpenAI do not claim ownership of generated output.
Prompts: `docs/ASSET_PROMPTS.md`. Exact prompts used for the art: `docs/art/ARTWORK_GENERATION.json`.

| Assets | Tool | Date |
|---|---|---|
| `docs/concept/concept_main.png`, all 28 images in `assets-src/art/` | OpenAI image generation (ChatGPT / Codex image_gen) | 2026-11-06 |
| 4 music loops + 4 stings in `assets-src/music/` | Lyria (Gemini app), instrumental | 2026-11-06 |

## Processing

`tools/build_art.py` (trim, resize, WebP) and `tools/build_audio.py` (ffmpeg: seamless loops, sting cuts,
loudness normalisation, MP3) turn the originals into the files in `public/assets/`.
