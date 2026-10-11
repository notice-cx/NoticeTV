#!/bin/sh
# Render the boot splash lockup into the Plymouth theme, and a full-screen preview beside it.
#   brand/render-splash.sh
# Needs a headless-capable Chromium (set CHROME to its binary if it isn't on PATH as chromium or
# google-chrome) and ImageMagick 7 (magick). The splash draws the PNG on the brand canvas
# (#0d1019), so it is rendered on a transparent background and trimmed to the ink.
set -eu

cd "$(dirname "$0")"
OUT=../os/rootfs/usr/share/plymouth/themes/noticetv/noticetv.png
CHROME=${CHROME:-$(command -v chromium || command -v google-chrome || echo chromium)}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FONT=$(base64 < fonts/StackSansNotch-Variable.woff2 | tr -d '\n')
page() {  # page BACKGROUND FILE
    sed -e "s|@FONT@|$FONT|" -e "s|@SUFFIX@|TV|" -e "s|@BACKGROUND@|$1|" lockup.html > "$2"
}
shot() {  # shot HTML PNG [extra chrome flags]
    html=$1 png=$2
    shift 2
    "$CHROME" --headless --hide-scrollbars --window-size=3840,2160 "$@" \
        --screenshot="$png" "file://$html" >/dev/null 2>&1
}

page transparent "$TMP/lockup.html"
shot "$TMP/lockup.html" "$TMP/lockup.png" --default-background-color=00000000
magick "$TMP/lockup.png" -trim +repage -bordercolor none -border 8 "$OUT"

page "#0d1019" "$TMP/preview.html"
shot "$TMP/preview.html" "$TMP/preview.png"
magick "$TMP/preview.png" -resize 1600x900 preview.png

echo "wrote $OUT and brand/preview.png"
