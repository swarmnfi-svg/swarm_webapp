#!/usr/bin/env bash
# Apply NOVA Chat PSD launcher icons to native Android flavor source sets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/artifacts"

apply_plane() {
  local plane="$1"
  local icon="$ART/icon-1024-${plane}.png"
  local res="$ROOT/app/src/${plane}/res"
  if [[ ! -f "$icon" ]]; then
    echo "Missing $icon — run: python3 scripts/export-nova-icons.py" >&2
    exit 1
  fi
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  cp "$icon" "$tmp/base.png"

  apply_mipmap() {
    local dir="$1" sz="$2"
    mkdir -p "$res/$dir"
    sips -z "$sz" "$sz" "$tmp/base.png" --out "$res/$dir/ic_launcher.png" >/dev/null
    sips -z "$sz" "$sz" "$tmp/base.png" --out "$res/$dir/ic_launcher_round.png" >/dev/null
  }

  apply_mipmap mipmap-mdpi 48
  apply_mipmap mipmap-hdpi 72
  apply_mipmap mipmap-xhdpi 96
  apply_mipmap mipmap-xxhdpi 144
  apply_mipmap mipmap-xxxhdpi 192

  mkdir -p "$res/mipmap-anydpi-v26" "$res/drawable-nodpi" "$res/values"
  sips -z 432 432 "$tmp/base.png" --out "$res/drawable-nodpi/ic_launcher_plate.png" >/dev/null

  cat > "$res/mipmap-anydpi-v26/ic_launcher.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_plate"/>
    <foreground android:drawable="@drawable/ic_launcher_plate"/>
</adaptive-icon>
EOF

  cp "$res/mipmap-anydpi-v26/ic_launcher.xml" "$res/mipmap-anydpi-v26/ic_launcher_round.xml"
  echo "Applied $plane icons from $icon"
}

apply_plane bpg
apply_plane saas
echo "NOVA Chat native branding complete."
