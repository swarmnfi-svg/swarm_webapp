#!/usr/bin/env python3
"""Publish P&ID SVG and apply monochrome filter (removes pipe color coding)."""
import re
import sys
from pathlib import Path

FILTER_ID = "swarm-monochrome"
FILTER_DEF = (
    f'<filter id="{FILTER_ID}" color-interpolation-filters="sRGB">'
    '<feColorMatrix type="matrix" values="'
    "0.2126 0.7152 0.0722 0 0 "
    "0.2126 0.7152 0.0722 0 0 "
    "0.2126 0.7152 0.0722 0 0 "
    "0 0 0 1 0"
    '"/></filter>'
)


def apply_monochrome_filter(svg: str) -> str:
    if f'id="{FILTER_ID}"' in svg:
        return svg

    # Insert filter after opening <defs> or create defs block
    if "<defs>" in svg:
        svg = svg.replace("<defs>", f"<defs>{FILTER_DEF}", 1)
    else:
        svg = svg.replace(
            "<svg ",
            f"<svg ",
            1,
        )
        # insert right after first svg tag close
        idx = svg.find(">", svg.find("<svg"))
        svg = svg[: idx + 1] + f"<defs>{FILTER_DEF}</defs>" + svg[idx + 1 :]

    # Wrap root content (after defs) in filtered group if not already wrapped
    if f'filter="url(#{FILTER_ID})"' in svg:
        return svg

    # Wrap everything after </defs> until </svg>
    m = re.search(r"</defs>", svg)
    if m:
        insert_at = m.end()
        inner = svg[insert_at : svg.rfind("</svg>")]
        svg = svg[:insert_at] + f'<g filter="url(#{FILTER_ID})">' + inner + "</g>" + svg[svg.rfind("</svg>") :]
    else:
        idx = svg.find(">", svg.find("<svg"))
        inner = svg[idx + 1 : svg.rfind("</svg>")]
        svg = svg[: idx + 1] + f'<g filter="url(#{FILTER_ID})">' + inner + "</g>" + svg[svg.rfind("</svg>") :]

    return svg


def main() -> None:
    src = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else r"c:\Users\seena\Downloads\Drawing1-Model (1)_repaired (1).pdf.svg"
    )
    public = Path(
        sys.argv[2]
        if len(sys.argv) > 2
        else r"c:\Users\seena\swarm_webapp\frontend\public\hmi"
    )
    public.mkdir(parents=True, exist_ok=True)

    content = src.read_text(encoding="utf-8", errors="ignore")

    color_copy = public / "tata-steel-pid-color.svg"
    color_copy.write_text(content, encoding="utf-8")

    mono = apply_monochrome_filter(content)
    dst = public / "tata-steel-pid.svg"
    dst.write_text(mono, encoding="utf-8")
    print(f"Color source (for editing): {color_copy} ({color_copy.stat().st_size:,} bytes)")
    print(f"Published monochrome HMI SVG: {dst} ({dst.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
