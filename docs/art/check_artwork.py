"""Read-only PNG checks for the Moonbloom source artwork."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
manifest = json.loads((root / "docs/art/ARTWORK_GENERATION.json").read_text(encoding="utf-8"))
opaque = {"backgrounds/bg_sky.png", "textures/tex_tile_stone.png", "textures/tex_grass.png"}
results = []
errors = []
for record in manifest["records"]:
    rel = record["file"]
    path = root / "assets-src/art" / rel
    if not path.is_file():
        errors.append(f"Missing {rel}")
        continue
    with Image.open(path) as im:
        im.load()
        alpha = im.getchannel("A") if "A" in im.getbands() else None
        extrema = list(alpha.getextrema()) if alpha else None
        if rel not in opaque and (alpha is None or extrema[0] != 0):
            errors.append(f"No fully transparent pixels in {rel}")
        bbox = alpha.point(lambda a: 255 if a >= 32 else 0).getbbox() if alpha else None
        edge_content = bool(bbox and (bbox[0] == 0 or bbox[1] == 0 or bbox[2] == im.width or bbox[3] == im.height))
        results.append({"file": rel, "width": im.width, "height": im.height, "mode": im.mode,
                        "bytes": path.stat().st_size, "alpha_range": extrema,
                        "visible_bounds_at_alpha_32": bbox, "visible_content_touches_edge": edge_content})
report = {"asset_count": len(results), "expected_count": 28, "total_bytes": sum(r["bytes"] for r in results),
          "errors": errors, "assets": results,
          "limitations": ["Dimensions are the actual generation outputs, not guaranteed prompt sizes.",
                         "Texture wrap seams and assembled game appearance still require runtime inspection.",
                         "Static sprite poses only; no skeletal models or frame animations.",
                         "P2 optional assets and music were not part of this P1 batch."]}
(root / "docs/art/ARTWORK_QA.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: report[k] for k in ["asset_count", "expected_count", "total_bytes", "errors"]}, indent=2))
assert len(results) == 28 and not errors, "Artwork validation failed"

