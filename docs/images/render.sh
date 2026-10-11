#!/bin/sh
# Render the README's images from docs/images/src.
#   docs/images/render.sh TV_SCREEN INSTALLER_SCREENS
# TV_SCREEN: a 3840x2160 screenshot of NoticeTV showing a dashboard (image/screenshots.sh);
# INSTALLER_SCREENS: a folder with the installer's confirm.png, wifi.png and dashboard.png screens,
# from a VM booted from the installer.
# Needs a headless-capable Chromium (set CHROME to its binary if it isn't on PATH as chromium or
# google-chrome) and ImageMagick 7.
set -eu

TV=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
SCREENS=$(cd "$2" && pwd)
cd "$(dirname "$0")"
CHROME=${CHROME:-$(command -v chromium || command -v google-chrome || echo chromium)}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP" src/*.render.html' EXIT

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

sed -e "s|@INSTALLER@|file://$SCREENS/confirm.png|" -e "s|@TV@|file://$TV|" src/install.html > src/install.render.html
shot install.render.html noticetv-install.png 1100 500 2
sed -e "s|@WIFI@|file://$SCREENS/wifi.png|" -e "s|@DASHBOARD@|file://$SCREENS/dashboard.png|" src/setup.html > src/setup.render.html
shot setup.render.html noticetv-setup.png 1000 600 2
shot how.html noticetv-how.png 1100 600 2
shot features.html noticetv-features.png 1100 800 2
shot configure.html noticetv-configure.png 840 500 2
shot statusbar.html noticetv-statusbar.png 1100 300 2

echo "rendered: noticetv-hero.jpg noticetv-how.png noticetv-features.png noticetv-install.png noticetv-setup.png noticetv-configure.png noticetv-statusbar.png"
