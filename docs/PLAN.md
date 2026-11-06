# Grave Guard: Moonbloom Hollow — Hackathon Plan

**Hackathon:** Kiroween 2026 — https://kiroween.devpost.com/rules
**Hard deadline:** Fri Dec 4, 2026, 2:00 PM Pacific (Sat Dec 5, ~3:30 AM IST). No extensions.
**Our target:** submit by **Wed Dec 2**.

## The game in one line
A 3D lane-defense game in the browser where you earn energy by answering quiz questions,
and teachers or students can turn their own notes into question packs.

## Tech
- Three.js + TypeScript + Vite, deployed free on Vercel or Netlify
- 2.5D: real 3D board, lights, fog and camera; painted PNG sprites for characters (see `docs/ASSET_PROMPTS.md`)
- HTML/CSS UI on top of the canvas
- AI question generation from pasted notes or PDFs (Amazon Bedrock or another LLM API, key kept server-side)

## Category
Decide at the end of week 2:
- **Costume Contest** if the visuals reach the concept image (current lean, because the art is our strongest point).
- **Frankenstein** if the notes-to-questions AI turns out to be the standout feature.

## Timeline
Assets are done (28 P1 images, 8 music tracks, 44 SFX), so we are ahead of the original plan.

| Week | Dates | Specs to build | Done when |
|---|---|---|---|
| 1 | Nov 6–12 | **1 core-game-loop** | Level 1 playable with real art, sound and music; sim tests + property tests green |
| 2 | Nov 13–19 | **2 quiz-engine**, **3 scene-and-vfx** | 4 built-in packs, adaptive picking; bloom, dissolve deaths, particles, polish matches the concept |
| 3 | Nov 20–26 | **4 menus-and-report-card**, **5 notes-forge**, first deploy | Title/level select/settings; report card; paste notes → pack → share link; live URL |
| 4 | Nov 27–Dec 2 | **6 polish-and-submit** | Levels 2–3 + Lich tuned, 3+ real students playtested, video, write-up, blog, social, **submitted** |

## Specs (in `.kiro/specs/`)
| # | Spec | Covers | Status |
|---|---|---|---|
| 1 | `core-game-loop` | Sim, defenders, enemies, waves, energy, Lich, first playable scene/UI/audio | Written |
| 2 | `quiz-engine` | Pack format, 4 built-in packs (times tables, English vocab, science, coding), adaptive picking, difficulty | Next |
| 3 | `scene-and-vfx` | Post-processing, dissolve, particles, lights, camera moves, screen shake, procedural wind/ghost audio | Next |
| 4 | `menus-and-report-card` | Title, level select, settings (volume, calm mode), pause, report card with explanations | Later |
| 5 | `notes-forge` | Paste notes/PDF → Bedrock → validated pack; share by link (pack in URL hash, no database) | Later |
| 6 | `polish-and-submit` | Levels 2–3, balance bot tuning, deploy, Playwright screenshots for the video, submission docs | Later |

## Decisions (defaults chosen; change any)
| Question | Default |
|---|---|
| Category | Costume Contest (switch to Frankenstein if the notes forge is the standout) |
| AI provider for the forge | Amazon Bedrock (AWS is the sponsor). Needs your AWS account; game works without it |
| Hosting | Vercel (free; runs the forge function too) |
| Bonus prizes | Blog + social for everyone; Student prize if every team member is a student |

## Kiro usage plan (20% of the score)
- **Steering (done):** `product.md`, `tech.md` (always on), `art-direction.md`, `game-balance.md` (load only for matching files)
- **Specs:** one per system, table above. Requirements use EARS ("WHEN … THEN the system SHALL …")
- **Hooks (once code exists):** run tests when `src/sim/**` is saved; rebuild art/audio when `assets-src/**` changes; check asset names against the manifests; remind to update `game-balance.md` when `src/data/*.json` changes
- **PBT:** properties P1–P5 in the core spec, plus quiz properties in spec 2
- **MCP:** Playwright browser for screenshots, GitHub, AWS docs
- **Custom agent:** "question-reviewer" that checks AI-generated packs for wrong answers and unclear wording
- **Kiro Crew:** split spec tasks across agents (sim / render / UI) in weeks 2–3
- Keep notes and screenshots in `docs/kiro-journal.md` as we go, for the write-up

## Asset pipeline
Originals live in `assets-src/` and are never edited. The game only loads `public/assets/`.

| Step | Command | Output |
|---|---|---|
| Art: trim, resize, edge-bleed, WebP | `python tools/build_art.py` | `public/assets/<category>/*.webp` + `art-manifest.json` (size, aspect, anchor) |
| Audio: seamless loops, sting cuts, loudness, MP3 | `python tools/build_audio.py` | `public/assets/audio/{music,sfx}/*.mp3` + `audio-manifest.json` |
| Art check | `python docs/art/check_artwork.py` | `docs/art/ARTWORK_QA.json` |

Levels: music loops −18 LUFS, stings −16 LUFS, SFX peak −3 dBFS. To recut a sting, set `start`/`end` in `STINGS` in `tools/build_audio.py` and re-run.

## Submission checklist
- [ ] Credit request form sent (deadline Dec 1, 12:00 PM PT)
- [ ] Public GitHub repo with an MIT LICENSE visible in the About section
- [ ] `/.kiro` committed at the repo root, not in `.gitignore`
- [ ] Working public URL that stays online until Jan 29, 2027
- [ ] YouTube video under 3 minutes, public, no copyrighted music
- [ ] Text description + Kiro write-up
- [ ] `CREDITS.md` complete, AI tools disclosed
- [ ] Bonus: blog post (mentions Kiroween 2026) and social post starting with `#KiroweenHackathon26`
- [ ] Bonus: Student / Ghost of Kiroween Past, if eligible
