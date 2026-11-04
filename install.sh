#!/usr/bin/env bash
# Installs the FINAL HERDR theme (layout + theme + fh-* mods) into Herdr UI.
# Usage: ./install.sh [--with-fonts]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.config/herdr-app"
WITH_FONTS=0
for arg in "$@"; do
  case "$arg" in
    --with-fonts) WITH_FONTS=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if pgrep -xq "Herdr" || pgrep -fq "herdr-gpui"; then
  echo "⚠  Herdr UI seems to be open. Quit it (cmd+Q) before installing, then run this script again." >&2
  exit 1
fi

mkdir -p "$DEST/mods" "$DEST/layouts" "$DEST/themes"

BACKUP="$DEST/backup-final-herdr-$(date +%Y%m%d-%H%M%S)"
for f in "$DEST"/mods/fh-* "$DEST/layouts/final-herdr.json" "$DEST/layouts/final-herdr.svg" \
         "$DEST/themes/final-herdr.json" "$DEST/keys.json" "$DEST/shared.json"; do
  [ -e "$f" ] || continue
  mkdir -p "$BACKUP/$(dirname "${f#$DEST/}")"
  cp -R "$f" "$BACKUP/${f#$DEST/}"
done
[ -d "$BACKUP" ] && echo "→ Backed up existing files: $BACKUP"

rm -rf "$DEST"/mods/fh-*
cp -R "$HERE"/mods/fh-* "$DEST/mods/"
cp "$HERE"/layouts/final-herdr.* "$DEST/layouts/"
cp "$HERE"/themes/final-herdr.json "$DEST/themes/"
rm -f "$DEST/layouts/.state/final-herdr.json"
echo "→ Mods, layout and theme copied"

# Merges the layout's shortcuts into keys.json (leaves the rest alone)
python3 - "$DEST/keys.json" "$HERE/keys.json" <<'PY'
import json, os, sys
dst, src = sys.argv[1], sys.argv[2]
data = json.load(open(dst)) if os.path.exists(dst) else {}
data.update(json.load(open(src)))
json.dump(data, open(dst, "w"), indent=2, ensure_ascii=False)
PY
echo "→ 'layout:final-herdr' shortcuts added to keys.json"

# Turns the layout on
python3 - "$DEST/shared.json" <<'PY'
import json, os, sys
dst = sys.argv[1]
data = json.load(open(dst)) if os.path.exists(dst) else {}
data["layout"] = "final-herdr"
json.dump(data, open(dst, "w"), ensure_ascii=False, separators=(",", ":"))
PY
echo "→ Active layout: final-herdr"

if [ "$WITH_FONTS" = 1 ]; then
  mkdir -p "$HOME/Library/Fonts"
  cp "$HERE"/mods/fh-hud/fonts/*.ttf "$HOME/Library/Fonts/"
  echo "→ DotGothic16 + Press Start 2P fonts installed in ~/Library/Fonts"
fi

echo "✔ Done. Open Herdr UI again."
