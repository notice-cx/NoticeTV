#!/bin/sh
# Keep the kiosk showing a page (noticetv-kiosk-watch.service).
# - Chromium gone, crashed or quit, for about a minute: restart the kiosk. Otherwise the text
#   console would stay on screen until the nightly restart.
# - The page blank for 2 minutes: reload it. A page whose app failed to load, for example while its
#   server was restarting, stays blank for good: the browser counts it as loaded, and the page's
#   own code that would retry never ran. A page still blank after a reload is reloaded again after
#   4 minutes, then 8, 16 and every 30, so a dashboard that is down is not hammered.
. /usr/local/lib/noticetv/lib.sh
export DISPLAY=:0 XAUTHORITY=/root/.Xauthority

sleep 120
misses=0   # checks in a row without Chromium
tick=0
blank=0    # screen checks in a row, a minute apart, that found the page blank
delay=2    # minutes of blank page before the next reload
reloads=0  # reloads since the page last showed something
while sleep 30; do
    if ! pgrep -x chromium >/dev/null; then
        blank=0
        misses=$((misses + 1))
        if [ "$misses" -ge 2 ]; then
            echo "Chromium has not been running for a minute: restarting the kiosk"
            systemctl restart getty@tty1.service
            misses=0
            # The restarted kiosk needs a while before Chromium shows up again.
            sleep 90
        fi
        continue
    fi
    misses=0

    # The screen once a minute: reading a 4K screen costs a fraction of a second.
    tick=$((tick + 1))
    [ $((tick % 2)) -eq 0 ] || continue
    screen_blank
    case $? in
    0)
        blank=$((blank + 1))
        # The first blank check starts the clock: reload once it has run for $delay minutes.
        if [ "$blank" -gt "$delay" ]; then
            echo "The page has been blank for $delay minutes: reloading it"
            reload_page || echo "Chromium's window was not found; the page was not reloaded"
            reloads=$((reloads + 1))
            blank=0
            delay=$((delay * 2))
            [ "$delay" -le 30 ] || delay=30
        fi
        ;;
    1)
        if [ "$reloads" -gt 0 ]; then
            echo "The page shows again after $reloads reload(s)"
        fi
        blank=0
        delay=2
        reloads=0
        ;;
    esac
done
