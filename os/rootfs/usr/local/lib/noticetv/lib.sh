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

# Whether the page area of the screen is one flat colour: a page that loaded without drawing
# anything. Left out: the bottom tenth, where the status bar sits, and a margin of a hundredth on
# every side, since Chromium's window stops a pixel short of the screen's right edge. Returns 0
# when blank, 1 when something shows, 2 when the screen could not be read. Needs DISPLAY and
# XAUTHORITY.
screen_blank() {
    local geometry x y w h f bytes pixels header
    geometry=$(xdotool getdisplaygeometry 2>/dev/null) || return 2
    x=$((${geometry% *} / 100))
    y=$((${geometry#* } / 100))
    w=$((${geometry% *} - 2 * x))
    h=$((${geometry#* } * 9 / 10 - y))
    f=/run/noticetv-screen.ppm
    scrot --overwrite --autoselect "$x,$y,$w,$h" "$f" 2>/dev/null || return 2
    bytes=$(wc -c < "$f")
    pixels=$((w * h * 3))
    header=$((bytes - pixels))
    if [ "$header" -le 0 ]; then
        rm -f "$f"
        return 2
    fi
    # The pixels are RGB triplets after the header: the whole area is one colour exactly when every
    # byte equals the one three bytes on.
    if cmp -s -i "$header:$((header + 3))" -n "$((pixels - 3))" "$f" "$f"; then
        rm -f "$f"
        return 0
    fi
    rm -f "$f"
    return 1
}

# Reload the page Chromium shows, as its F5 key does. The kiosk has no window manager, so the
# window is given the keyboard first.
reload_page() {
    local win
    win=$(xdotool search --onlyvisible --class chromium 2>/dev/null | head -n 1)
    [ -n "$win" ] || return 1
    xdotool windowfocus "$win" key F5
}
