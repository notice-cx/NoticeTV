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
temp)
    echo "$(cpu_temp)°C"
    ;;
watts)
    echo "$(rapl_watts /run/noticetv-statusbar.rapl)W"
    ;;
esac
