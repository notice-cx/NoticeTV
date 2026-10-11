#!/bin/sh
# NoticeTV OS installer: turns a DietPi (x86_64) install into a NoticeTV.
# Run as root on the box from a copy of this folder; scripts/install-over-ssh.sh does that from
# another machine. Safe to run again: every step converges on the same state, and the summary
# says when a reboot is needed. Settings: /etc/noticetv/noticetv.conf (see noticetv.conf.example).
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
REBOOT_REASONS=""
STATUSBAR_CHANGED=no
needs_reboot() { REBOOT_REASONS="$REBOOT_REASONS
  - $1"; }
step() { echo "==> $*"; }
is_intel() { grep -q GenuineIntel /proc/cpuinfo; }
dietpi_installed() { grep -q "^aSOFTWARE_INSTALL_STATE\[$1\]=2" /boot/dietpi/.installed; }

# Set KEY=VALUE in /boot/dietpi.txt, escaping the characters sed would treat as special.
set_dietpi_txt() {
    value=$(printf '%s' "$2" | sed 's/[&|\\]/\\&/g')
    if grep -q "^[[:blank:]]*$1=" /boot/dietpi.txt; then
        sed -i "s|^[[:blank:]]*$1=.*|$1=$value|" /boot/dietpi.txt
    else
        echo "$1=$2" >> /boot/dietpi.txt
    fi
}

# Files from installs that predate this layer, replaced by the noticetv-* ones below.
remove_earlier_layout() {
    for unit in kiosk-statusbar.service kiosk-statusbar-raise.timer kiosk-statusbar-raise.service \
        kiosk-hidecursor.service kiosk-restart.timer kiosk-restart.service thermal-caps.service \
        health-log.timer health-log.service; do
        if [ -f "/etc/systemd/system/$unit" ]; then
            systemctl disable --now --quiet "$unit" 2>/dev/null || true
            rm -f "/etc/systemd/system/$unit"
        fi
    done
    rm -f /usr/local/bin/health-log.sh /usr/local/bin/kst-clock.sh /usr/local/bin/rapl-watts.sh \
        /usr/local/bin/thermal-caps.sh /etc/conky-kiosk.conf /etc/chromium.d/kiosk-tweaks \
        /etc/X11/xorg.conf.d/10-kiosk-noblank.conf /etc/apt/apt.conf.d/52kiosk-autoreboot \
        /etc/modprobe.d/rtw88.conf /etc/sysctl.d/98-kiosk-autoreboot.conf \
        /etc/systemd/system.conf.d/watchdog.conf /etc/systemd/journald.conf.d/persistent.conf
}

# Width and height of a PNG, from its IHDR chunk.
png_size() {
    od -A n -t u1 -j 16 -N 8 "$1" | awk '{print $1*16777216 + $2*65536 + $3*256 + $4, $5*16777216 + $6*65536 + $7*256 + $8}'
}

# The status bar's conky config. Laid out for a 3840px panel and scaled to DISPLAY_WIDTH;
# each field gets a fixed-width column so values changing length never make the bar jitter.
write_statusbar_conf() {
    k=$(awk -v w="$DISPLAY_WIDTH" 'BEGIN{printf "%.4f", w/3840}')
    px() { awk -v n="$1" -v k="$k" 'BEGIN{printf "%d", n*k + 0.5}'; }
    F=/usr/local/lib/noticetv/statusbar-field.sh
    text=""
    x=0
    add() {  # add WIDTH_AT_4K CONTENT
        if [ "$x" -gt 0 ]; then
            text="$text\${goto $(px "$x")}"
        fi
        text="$text$2"
        x=$((x + $1))
    }
    # The NoticeTV lockup, rendered for a 3840px panel and scaled with it. conky places images
    # from the corner of the text area; 6px down centres it on the text's capitals.
    LOCKUP=/usr/share/noticetv/statusbar-lockup.png
    # shellcheck disable=SC2046  # png_size prints "width height"
    set -- $(png_size "$LOCKUP")
    add 205 "\${image $LOCKUP -p 0,$(px 6) -s $(px "$1")x$(px "$2")}"
    # Each field: its icon (brand/render.sh), then the value. Icons are images, 7px down to centre
    # them on the text: an icon font would shift conky's baseline at every font switch. conky
    # measures images from inside border_inner_margin but goto from the window's edge, hence -14.
    field() {  # field WIDTH_AT_4K ICON VALUE
        add "$1" "\${image /usr/share/noticetv/icons/$2.png -p $(px $((x - 14))),$(px 7) -s $(px 26)x$(px 26)}\${goto $(px $((x + 40)))}$3"
    }
    field 225 ip "\${color e8b04c}\${execi 30 $F ip}\${color}"
    if [ "$STATUSBAR_WAN_IP" = yes ]; then
        field 235 wan "\${color 6fb3d2}\${execi 300 $F wan}\${color}"
    fi
    if [ -d /sys/class/net/wlan0/wireless ]; then
        field 125 wifi "\${wireless_link_qual_perc wlan0}%"
    fi
    field 130 temp "\${execi 5 $F temp}"
    field 125 watts "\${execi 5 $F watts}"
    field 125 load "\${loadavg 1}"
    field 120 ram "\${memperc}%"
    field 165 disk "\${fs_free /}"
    field 160 uptime "\${uptime_short}"
    cat > /etc/noticetv/statusbar.conky.new << EOF
-- Written by NoticeTV install.sh from /etc/noticetv/noticetv.conf; edits here are overwritten.
conky.config = {
    own_window = true,
    own_window_type = 'override',
    own_window_transparent = false,
    own_window_colour = '000000',
    alignment = 'bottom_right',
    gap_x = $(px 16),
    gap_y = $(px 16),
    border_inner_margin = $(px 14),
    border_outer_margin = 0,
    minimum_width = $(px "$x"),
    maximum_width = $(px "$x"),
    minimum_height = 0,
    double_buffer = true,
    update_interval = 5,
    use_xft = true,
    font = 'Noto Sans:size=$(px 20)',
    default_color = 'b8c2cc',
    pad_percents = 2,
    background = false,
    out_to_console = false,
}
conky.text = [[$text]]
EOF
    # conky doesn't reload its config by itself: note a change so the bar is restarted.
    if cmp -s /etc/noticetv/statusbar.conky.new /etc/noticetv/statusbar.conky; then
        rm /etc/noticetv/statusbar.conky.new
    else
        mv /etc/noticetv/statusbar.conky.new /etc/noticetv/statusbar.conky
        STATUSBAR_CHANGED=yes
    fi
}

[ "$(id -u)" = 0 ] || { echo "install.sh: run as root" >&2; exit 1; }
[ -f /boot/dietpi/.version ] || { echo "install.sh: this is not a DietPi system" >&2; exit 1; }
[ "$(uname -m)" = x86_64 ] || { echo "install.sh: NoticeTV OS supports x86_64 boxes only" >&2; exit 1; }

step "Settings"
mkdir -p /etc/noticetv
if [ ! -f /etc/noticetv/noticetv.conf ]; then
    cp "$HERE/noticetv.conf.example" /etc/noticetv/noticetv.conf
    echo "    created /etc/noticetv/noticetv.conf with the defaults"
fi

step "Files"
remove_earlier_layout
(cd "$HERE/rootfs" && tar -cf - .) | tar -C / -xf - --no-same-owner --no-overwrite-dir
. /usr/local/lib/noticetv/lib.sh

step "Packages"
PACKAGES="plymouth conky-std unclutter-xfixes xdotool scrot x11-xserver-utils chrony unattended-upgrades
    smartmontools logrotate iw curl fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk"
if is_intel; then
    PACKAGES="$PACKAGES intel-microcode thermald firmware-intel-graphics intel-media-va-driver-non-free"
fi
# shellcheck disable=SC2086  # word splitting of the package list is intended
DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends $PACKAGES
if ! dietpi_installed 113; then
    /boot/dietpi/dietpi-software install 113  # Chromium, with DietPi's kiosk launcher
fi
if [ "$(cat /boot/dietpi/.dietpi-autostart_index 2>/dev/null)" != 11 ]; then
    /boot/dietpi/dietpi-autostart 11  # log in automatically and start the Chromium kiosk
    needs_reboot "the kiosk starts on boot"
fi
# DietPi keeps logs in RAM by default; a box that freezes has to leave its evidence on disk.
if dietpi_installed 103; then
    /boot/dietpi/dietpi-software uninstall 103
    needs_reboot "logs move from RAM to disk"
fi

step "Kiosk"
RES_X=$(awk -v w="$DISPLAY_WIDTH" -v s="$DISPLAY_SCALE" 'BEGIN{printf "%d", w/s}')
RES_Y=$(awk -v h="$DISPLAY_HEIGHT" -v s="$DISPLAY_SCALE" 'BEGIN{printf "%d", h/s}')
set_dietpi_txt SOFTWARE_CHROMIUM_RES_X "$RES_X"
set_dietpi_txt SOFTWARE_CHROMIUM_RES_Y "$RES_Y"
if [ -n "$DASHBOARD_URL" ]; then
    set_dietpi_txt SOFTWARE_CHROMIUM_AUTOSTART_URL "$DASHBOARD_URL"
fi
cat > /etc/chromium.d/noticetv << EOF
# Written by NoticeTV install.sh from /etc/noticetv/noticetv.conf; edits here are overwritten.
export CHROMIUM_FLAGS="\$CHROMIUM_FLAGS --noerrdialogs --disable-infobars --disable-session-crashed-bubble --force-device-scale-factor=$DISPLAY_SCALE --enable-features=VaapiVideoDecodeLinuxGL,VaapiVideoDecoder,VaapiIgnoreDriverChecks"
EOF
write_statusbar_conf

step "Boot"
CMDLINE="quiet splash loglevel=3 vt.global_cursor_default=0${VIDEO_MODE:+ video=$VIDEO_MODE} consoleblank=0"
if ! grep -qxF "GRUB_CMDLINE_LINUX_DEFAULT=\"$CMDLINE\"" /etc/default/grub; then
    sed -i "s|^GRUB_CMDLINE_LINUX_DEFAULT=.*|GRUB_CMDLINE_LINUX_DEFAULT=\"$CMDLINE\"|" /etc/default/grub
    update-grub
    needs_reboot "boot options changed"
fi
# The graphics driver in the initramfs, so the splash draws through it at full resolution from
# the first second instead of being taken over mid-splash when it loads from disk.
if is_intel && ! grep -qx i915 /etc/initramfs-tools/modules; then
    echo i915 >> /etc/initramfs-tools/modules
fi
if [ "$(plymouth-set-default-theme)" != noticetv ]; then
    plymouth-set-default-theme noticetv
fi
# The initramfs carries the splash theme and the module list: rebuild it when either changed.
SUM=$(cat /usr/share/plymouth/themes/noticetv/* /etc/initramfs-tools/modules /etc/modprobe.d/noticetv-* | md5sum)
mkdir -p /var/lib/noticetv
if [ "$SUM" != "$(cat /var/lib/noticetv/initramfs.sum 2>/dev/null)" ]; then
    update-initramfs -u
    echo "$SUM" > /var/lib/noticetv/initramfs.sum
    needs_reboot "the boot splash or early drivers changed"
fi

step "Services"
systemctl daemon-reload
systemctl mask --quiet sleep.target suspend.target hibernate.target hybrid-sleep.target
# X ends the splash itself (/root/.xserverrc); plymouth's own quit at multi-user would drop to the
# text console for several seconds, and getty@tty1 is ordered after plymouth-quit-wait.
systemctl mask --quiet plymouth-quit.service plymouth-quit-wait.service
# Waits up to 2 minutes for an Ethernet port that a Wi-Fi box never plugs in; ifupdown already
# brings Wi-Fi up before network.target.
systemctl disable --quiet systemd-networkd-wait-online.service 2>/dev/null || true
# DietPi masks the apt timers; unattended security updates need them.
systemctl unmask --quiet apt-daily.timer apt-daily-upgrade.timer apt-daily.service apt-daily-upgrade.service
systemctl enable --quiet apt-daily.timer apt-daily-upgrade.timer
# DietPi's Wi-Fi monitor tears the connection down on a single lost ping; noticetv-wifi-watch
# reconnects only after a real outage. DietPi's is disabled but left running until the reboot:
# a DHCP client its reconnects started lives in its service, and stopping it now would take the
# network down mid-install.
if systemctl is-enabled --quiet dietpi-wifi-monitor.service 2>/dev/null; then
    systemctl disable --quiet dietpi-wifi-monitor.service
    needs_reboot "Wi-Fi monitoring switches to NoticeTV's"
fi
systemctl enable --quiet noticetv-wifi-watch.service
if ! systemctl is-active --quiet dietpi-wifi-monitor.service; then
    systemctl restart noticetv-wifi-watch.service  # picks up a changed script
fi
systemctl enable --quiet noticetv-power.service noticetv-hidecursor.service
systemctl enable --now --quiet noticetv-health.timer noticetv-kiosk-restart.timer noticetv-splash-timeout.timer
if [ "$STATUSBAR" = yes ]; then
    systemctl enable --quiet noticetv-statusbar.service
    systemctl enable --now --quiet noticetv-statusbar-raise.timer
    if [ "$STATUSBAR_CHANGED" = yes ] && systemctl is-active --quiet noticetv-statusbar.service; then
        systemctl restart noticetv-statusbar.service
    fi
else
    systemctl disable --now --quiet noticetv-statusbar.service noticetv-statusbar-raise.timer
fi

echo
if [ -n "$REBOOT_REASONS" ]; then
    echo "NoticeTV OS installed. Reboot to finish:$REBOOT_REASONS"
else
    echo "NoticeTV OS is up to date. Kiosk changes apply at the next kiosk restart:"
    echo "  systemctl restart getty@tty1"
fi
