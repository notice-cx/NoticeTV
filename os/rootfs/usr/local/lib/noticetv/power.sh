#!/bin/sh
# Apply POWER_PROFILE from noticetv.conf at boot (noticetv-power.service).
# fanless: turbo off and the package power capped, so a passively cooled box holds a steady
# temperature under full load. stock: leave the firmware's settings alone.
. /usr/local/lib/noticetv/lib.sh

if [ "$POWER_PROFILE" != fanless ]; then
    exit 0
fi

# acpi-cpufreq's boost knob appears late in boot on some boards; intel_pstate has no_turbo instead.
BOOST=/sys/devices/system/cpu/cpufreq/boost
NO_TURBO=/sys/devices/system/cpu/intel_pstate/no_turbo
n=0
until [ -w "$BOOST" ] || [ -w "$NO_TURBO" ] || [ $n -ge 30 ]; do
    sleep 1
    n=$((n + 1))
done
if [ -w "$BOOST" ]; then
    echo 0 > "$BOOST"
fi
if [ -w "$NO_TURBO" ]; then
    echo 1 > "$NO_TURBO"
fi

RAPL=/sys/class/powercap/intel-rapl:0
if [ -d "$RAPL" ]; then
    echo $((POWER_CAP_LONG_W * 1000000)) > "$RAPL/constraint_0_power_limit_uw"
    echo $((POWER_CAP_SHORT_W * 1000000)) > "$RAPL/constraint_1_power_limit_uw"
    echo 1 > "$RAPL/enabled"
fi
