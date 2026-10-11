#!/bin/sh
# One field of the status bar, for conky's execi: statusbar-field.sh clock|ip|wan|temp|watts
. /usr/local/lib/noticetv/lib.sh

case "$1" in
clock)
    if [ -z "$STATUSBAR_CLOCK_TZ" ]; then
        date +%H:%M
        exit
    fi
    # Mark the other zone's day when it differs from the box's: +1 ahead, -1 behind.
    there=$(TZ=$STATUSBAR_CLOCK_TZ date +%Y%m%d)
    here=$(date +%Y%m%d)
    day=""
    if [ "$there" -gt "$here" ]; then
        day=" +1"
    elif [ "$there" -lt "$here" ]; then
        day=" -1"
    fi
    echo "${STATUSBAR_CLOCK_LABEL:-$STATUSBAR_CLOCK_TZ} $(TZ=$STATUSBAR_CLOCK_TZ date +%H:%M)$day"
    ;;
ip)
    lan_ip | sed 's/^none$/no network/'
    ;;
wan)
    curl -sf -m 3 https://api.ipify.org || echo n/a
    ;;
temp)
    echo "$(cpu_temp)°C"
    ;;
watts)
    echo "$(rapl_watts /run/noticetv-statusbar.rapl)W"
    ;;
esac
