"""Fix .gltf buffer URIs to match actual .bin filenames (Linux is case-sensitive)."""
from pathlib import Path
import re
import sys

def fix_gltf_bin_uris(assets_dir: Path) -> int:
    fixed = 0
    for gltf in assets_dir.rglob("*.gltf"):
        stem = gltf.stem
        bins = {b.stem.lower(): b.name for b in gltf.parent.glob("*.bin")}
        key = stem.lower()
        if key not in bins:
            print(f"WARN: no matching .bin for {gltf}")
            continue
        correct = bins[key]
        text = gltf.read_text(encoding="utf-8")
        new = re.sub(r'"uri"\s*:\s*"[^"]+\.bin"', f'"uri":"{correct}"', text)
        if new != text:
            gltf.write_text(new, encoding="utf-8")
            fixed += 1
            print(f"fixed {gltf.relative_to(assets_dir)} -> {correct}")
    return fixed

if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    assets = root / "Frontend" / "assets1"
    if not assets.is_dir():
        sys.exit(f"Not found: {assets}")
    count = fix_gltf_bin_uris(assets)
    print(f"Done. Updated {count} file(s).")
