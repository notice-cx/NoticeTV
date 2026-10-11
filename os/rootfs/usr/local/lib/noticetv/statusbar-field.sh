#!/bin/sh
# One field of the status bar, for conky's execi: statusbar-field.sh ip|wan|temp|watts
. /usr/local/lib/noticetv/lib.sh

case "$1" in
ip)
    lan_ip | sed 's/^none$/no network/'
    ;;
wan)
    curl -sf -m 3 https://api.ipify.org || echo n/a
    ;;
# A box without the sensor (a VM, some boards) shows a dash rather than a broken reading.
temp)
    t=$(cpu_temp)
    [ "$t" = na ] && echo "–" || echo "${t}°C"
    ;;
watts)
    w=$(rapl_watts /run/noticetv-statusbar.rapl)
    [ "$w" = na ] && echo "–" || echo "${w}W"
    ;;
esac
