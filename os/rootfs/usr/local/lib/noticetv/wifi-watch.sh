#!/bin/sh
# Reconnect Wi-Fi only after a real outage (noticetv-wifi-watch.service): the gateway left
# unanswered for 3 checks in a row, about 90 seconds, where each check is up to 3 pings.
# DietPi's own monitor reconnects on a single lost ping; on a weak link that tore a working
# connection down many times an hour, and each teardown cycles the card through its power states.
IFACE=wlan0
INTERVAL=30
MISSES_BEFORE_RECONNECT=3

if [ ! -d "/sys/class/net/$IFACE/wireless" ]; then
    echo "no Wi-Fi interface $IFACE: nothing to watch"
    exit 0
fi

misses=0
while sleep "$INTERVAL"; do
    gateway=$(ip -4 route show default dev "$IFACE" 2>/dev/null | awk '{print $3; exit}')
    if [ -n "$gateway" ] && ping -n -q -c 3 -W 2 -I "$IFACE" "$gateway" >/dev/null 2>&1; then
        if [ "$misses" -gt 0 ]; then
            echo "gateway $gateway answered again after $misses missed check(s); no reconnect needed"
        fi
        misses=0
        continue
    fi
    misses=$((misses + 1))
    if [ "$misses" -ge "$MISSES_BEFORE_RECONNECT" ]; then
        echo "no answer from the gateway (${gateway:-no default route}) for $((misses * INTERVAL))s: reconnecting $IFACE"
        # Through ifup@'s own service, so the DHCP client it starts lives there. Started from
        # this service, it would die whenever the watcher restarts and take the address with it.
        systemctl restart "ifup@$IFACE.service"
        misses=0
    fi
done
