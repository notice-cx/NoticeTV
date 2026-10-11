#!/bin/sh
# Restart the kiosk when Chromium is gone (noticetv-kiosk-watch.service): a browser that crashed or
# quit would otherwise leave the text console on screen until the nightly restart.
# After the boot, a check every 30 seconds; two misses in a row, about a minute, restart the kiosk.
sleep 120
misses=0
while sleep 30; do
    if pgrep -x chromium >/dev/null; then
        misses=0
        continue
    fi
    misses=$((misses + 1))
    if [ "$misses" -ge 2 ]; then
        echo "Chromium has not been running for a minute: restarting the kiosk"
        systemctl restart getty@tty1.service
        misses=0
        # The restarted kiosk needs a while before Chromium shows up again.
        sleep 90
    fi
done
