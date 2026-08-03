#!/usr/bin/env python3
"""Export NOVA Chat launcher icons from PSD — BPG (white) and SaaS (silver)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

PSD_DEFAULT = Path("/Users/mike/Downloads/nova (1).psd")
ROOT = Path(__file__).resolve().parents[1]
OUT_BPG = ROOT / "artifacts" / "icon-1024-bpg.png"
OUT_SAAS = ROOT / "artifacts" / "icon-1024-saas.png"

BG_BPG = (255, 255, 255, 255)
BG_SAAS = (232, 238, 245, 255)  # #E8EEF5 — SaaS silver squircle


def composite_on_bg(icon: Image.Image, bg_rgba: tuple[int, int, int, int], size: int = 1024) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg_rgba)
    icon = icon.convert("RGBA")
    if icon.size != (size, size):
        icon = icon.resize((size, size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(icon)
    return canvas.convert("RGB")


def main() -> int:
    psd_path = Path(sys.argv[1]) if len(sys.argv) > 1 else PSD_DEFAULT
    if not psd_path.is_file():
        print(f"PSD not found: {psd_path}", file=sys.stderr)
        return 1

    psd = PSDImage.open(psd_path)
    icon = psd.composite()
    OUT_BPG.parent.mkdir(parents=True, exist_ok=True)

    bpg = composite_on_bg(icon, BG_BPG)
    saas = composite_on_bg(icon, BG_SAAS)
    bpg.save(OUT_BPG, "PNG")
    saas.save(OUT_SAAS, "PNG")
    print(f"Exported BPG icon:  {OUT_BPG} ({bpg.size})")
    print(f"Exported SaaS icon: {OUT_SAAS} ({saas.size})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
