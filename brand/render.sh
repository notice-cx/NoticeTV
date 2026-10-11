#!/bin/sh
# Render the NoticeTV lockup into the images the box shows, and a preview of the boot screen.
#   brand/render.sh
# Needs a headless-capable Chromium (set CHROME to its binary if it isn't on PATH as chromium or
# google-chrome) and ImageMagick 7 (magick).
#   - the boot splash: drawn on the brand canvas (#0d1019) by Plymouth, so rendered on a
#     transparent background and trimmed to the ink with a small margin
#   - the status bar's lockup and icons: drawn by conky on the bar's black, so rendered on black
#     at the bar's text size for a 3840px panel (conky's Noto Sans 20pt at 96 dpi)
set -eu

cd "$(dirname "$0")"
ROOTFS=../os/rootfs
CHROME=${CHROME:-$(command -v chromium || command -v google-chrome || echo chromium)}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

FONT=$(base64 < fonts/StackSansNotch-Variable.woff2 | tr -d '\n')
page() {  # page SIZE BACKGROUND FILE
    sed -e "s|@FONT@|$FONT|" -e "s|@SUFFIX@|TV|" -e "s|@SIZE@|$1|" -e "s|@BACKGROUND@|$2|" lockup.html > "$3"
}
shot() {  # shot HTML PNG [extra chrome flags]
    html=$1 png=$2
    shift 2
    "$CHROME" --headless --hide-scrollbars --window-size=3840,2160 "$@" \
        --screenshot="$png" "file://$html" >/dev/null 2>&1
}

page 200 transparent "$TMP/splash.html"
shot "$TMP/splash.html" "$TMP/splash.png" --default-background-color=00000000
magick "$TMP/splash.png" -trim +repage -bordercolor none -border 8 -strip \
    "$ROOTFS/usr/share/plymouth/themes/noticetv/noticetv.png"

mkdir -p "$ROOTFS/usr/share/noticetv"
page 27 "#000000" "$TMP/statusbar.html"
shot "$TMP/statusbar.html" "$TMP/statusbar.png"
magick "$TMP/statusbar.png" -trim +repage -strip "$ROOTFS/usr/share/noticetv/statusbar-lockup.png"

# Status bar icons: Lucide (brand/icons, ISC), the icon set NoticeOS uses, in the brand's muted
# ink on the bar's black, each a 26px square for a 3840px panel. Drawn side by side on one page,
# then cut apart and named for the field they mark.
ICON_PX=26
ICONS="ip:network wan:globe wifi:wifi temp:thermometer watts:zap load:cpu ram:memory-stick disk:hard-drive uptime:timer"
{
    echo "<!doctype html><html><head><style>html, body { margin: 0; background: #000; }"
    echo "svg { display: block; float: left; width: ${ICON_PX}px; height: ${ICON_PX}px; color: #a4aec3; }</style></head><body>"
    for pair in $ICONS; do
        sed '/^<!--/d' "icons/${pair#*:}.svg"
    done
    echo "</body></html>"
} > "$TMP/icons.html"
shot "$TMP/icons.html" "$TMP/icons.png"
mkdir -p "$ROOTFS/usr/share/noticetv/icons"
i=0
for pair in $ICONS; do
    magick "$TMP/icons.png" -crop "${ICON_PX}x${ICON_PX}+$((i * ICON_PX))+0" +repage -strip \
        "$ROOTFS/usr/share/noticetv/icons/${pair%%:*}.png"
    i=$((i + 1))
done

page 200 "#0d1019" "$TMP/preview.html"
shot "$TMP/preview.html" "$TMP/preview.png"
magick "$TMP/preview.png" -resize 1600x900 -strip preview.png

echo "wrote the splash, the status bar lockup and icons under os/rootfs, and brand/preview.png"
