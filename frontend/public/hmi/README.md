# P&ID diagram assets

| File | Purpose |
|------|---------|
| **`tata-steel-pid.svg`** | **HMI background** — monochrome (no pipe color coding) |
| `tata-steel-pid-color.svg` | Original color version (backup / reference) |
| `tata-steel-pid.png` | Raster fallback |

## Re-publish after editing

1. Save your edited SVG from Canva/Inkscape to this folder.
2. Run from project root:

```powershell
py scripts\monochrome-svg.py "path\to\your-edited.svg"
```

This updates `tata-steel-pid-color.svg` (color copy) and `tata-steel-pid.svg` (monochrome for HMI).

## Monochrome filter

The HMI SVG uses an SVG `feColorMatrix` filter (`swarm-monochrome`) to remove cyan/green/magenta/orange pipe colors. Edit the color source file, then re-run the script above.
