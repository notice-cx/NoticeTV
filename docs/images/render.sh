#!/bin/sh
# Render the README's images from docs/images/src.
#   docs/images/render.sh TV_SCREEN INSTALLER_SCREEN
# TV_SCREEN: a 3840x2160 screenshot of NoticeTV showing a dashboard (image/screenshots.sh);
# INSTALLER_SCREEN: the installer's confirmation screen, from a VM booted from the installer.
# Needs a headless-capable Chromium (set CHROME to its binary if it isn't on PATH as chromium or
# google-chrome) and ImageMagick 7.
set -eu

TV=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
INSTALLER=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
cd "$(dirname "$0")"
CHROME=${CHROME:-$(command -v chromium || command -v google-chrome || echo chromium)}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

shot() {  # shot PAGE OUTPUT WIDTH HEIGHT SCALE: render src/PAGE, trimmed to its card
    "$CHROME" --headless --hide-scrollbars --allow-file-access-from-files \
        --force-device-scale-factor="$5" --default-background-color=00000000 \
        --window-size="$3,$4" --screenshot="$TMP/shot.png" "file://$PWD/src/$1" >/dev/null 2>&1
    magick "$TMP/shot.png" -trim +repage -strip "$2"
}

# The hero: the TV on the studio wall, at the photo's own resolution.
sed "s|@SCREEN@|file://$TV|" src/hero.html > src/hero.render.html
"$CHROME" --headless --hide-scrollbars --allow-file-access-from-files --window-size=1536,768 \
    --screenshot="$TMP/hero.png" "file://$PWD/src/hero.render.html" >/dev/null 2>&1
magick "$TMP/hero.png" -strip -quality 92 noticetv-hero.jpg
rm src/hero.render.html

sed -e "s|@INSTALLER@|file://$INSTALLER|" -e "s|@TV@|file://$TV|" src/install.html > src/install.render.html
shot install.render.html noticetv-install.png 1100 500 2
rm src/install.render.html
shot configure.html noticetv-configure.png 840 500 2
shot statusbar.html noticetv-statusbar.png 1100 300 2

echo "rendered: noticetv-hero.jpg noticetv-install.png noticetv-configure.png noticetv-statusbar.png"
