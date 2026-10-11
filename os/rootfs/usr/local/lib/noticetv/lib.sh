# Shared by the NoticeTV scripts (sourced, POSIX sh): the box's settings and the readings
# the status bar and the health log both show.

# Defaults; /etc/noticetv/noticetv.conf overrides any of them (see os/noticetv.conf.example).
DASHBOARD_URL=
DISPLAY_WIDTH=3840
DISPLAY_HEIGHT=2160
DISPLAY_SCALE=2
VIDEO_MODE=
POWER_PROFILE=stock
POWER_CAP_LONG_W=6
POWER_CAP_SHORT_W=10
STATUSBAR=yes
STATUSBAR_WAN_IP=no
if [ -r /etc/noticetv/noticetv.conf ]; then
    . /etc/noticetv/noticetv.conf
fi

# Temperature in °C of the first thermal zone of the given types, else "na".
zone_temp() {
    local want z
    for want in "$@"; do
        for z in /sys/class/thermal/thermal_zone*; do
            if [ -r "$z/type" ] && [ "$(cat "$z/type")" = "$want" ]; then
                echo $(( $(cat "$z/temp") / 1000 ))
                return
            fi
        done
    done
    echo na
}

cpu_temp() { zone_temp x86_pkg_temp TCPU acpitz; }

# Average package power in watts since this cache file was last written, else "na".
# Each caller keeps its own cache: sharing one would shorten the other's averaging window.
rapl_watts() {
    local R E T W PE PT
    R=/sys/class/powercap/intel-rapl:0/energy_uj
    if [ ! -r "$R" ]; then
        echo na
        return
    fi
    E=$(cat "$R")
    T=$(date +%s%N)
    W=na
    if [ -f "$1" ]; then
        read -r PE PT < "$1"
        W=$(awk -v e="$E" -v pe="$PE" -v t="$T" -v pt="$PT" 'BEGIN{d=(t-pt)/1e9; if (d>0 && e>=pe) printf "%.1f", (e-pe)/1e6/d; else printf "na"}')
    fi
    echo "$E $T" > "$1"
    echo "$W"
}

# The box's own address on its network (the source address of its default route), else "none".
# `ip route get` only consults the routing table; nothing is sent.
lan_ip() {
    local ip
    ip=$(ip -4 -o route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')
    echo "${ip:-none}"
}

# Wi-Fi signal in dBm, else "na". iw, not /proc/net/wireless: rtw88 often reports its
# -256 "no value" placeholder there.
wifi_signal() {
    local sig
    sig=$(iw dev wlan0 link 2>/dev/null | awk '/signal:/{print $2}')
    echo "${sig:-na}"
}
