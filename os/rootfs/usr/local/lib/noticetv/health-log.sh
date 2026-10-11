#!/bin/sh
# One line per minute into the journal (noticetv-health.timer): what the box looked like
# before any freeze. Read it back with: journalctl -t noticetv-health
. /usr/local/lib/noticetv/lib.sh

mhz=na
if [ -r /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq ]; then
    mhz=$(( $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq) / 1000 ))
fi
load=$(cut -d' ' -f1-3 /proc/loadavg)
mem=$(awk '/MemAvailable/{printf "%d", $2/1024}' /proc/meminfo)

echo "cpu=$(cpu_temp)C board=$(zone_temp acpitz)C pkg=$(rapl_watts /run/noticetv-health.rapl)W mhz=$mhz load=$load memavail=${mem}M ip=$(lan_ip) signal=$(wifi_signal)dBm"
