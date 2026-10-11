#!/bin/sh
# NoticeTV OS image build, inside the build VM: DietPi runs this at the end of its unattended
# first run. It installs the NoticeTV layer from the build's layer disk, then reboots once into
# the finished system, where noticetv-bake-finalize checks it, cleans it up and powers off.
set -eu

LAYER_DISK=/dev/disk/by-id/ata-QEMU_HARDDISK_NOTICETVLAYER
OUT=/boot/efi/noticetv-bake

# Any failure stops the build fast, with DietPi's logs, instead of leaving it to time out.
on_exit() {
    status=$?
    if [ "$status" -ne 0 ]; then
        mkdir -p "$OUT/logs"
        echo "failed: Automation_Custom_Script.sh exited with $status" > "$OUT/result"
        cp -r /var/lib/dietpi/logs/. "$OUT/logs/" 2>/dev/null || true
        systemctl poweroff
    fi
}
trap on_exit EXIT

mkdir -p /opt/noticetv
tar -C /opt/noticetv -xf "$LAYER_DISK"

# The image targets Intel mini PCs whatever CPU the build machine has.
NOTICETV_PLATFORM=intel /opt/noticetv/install.sh

install -m 755 /opt/noticetv/bake/finalize.sh /usr/local/lib/noticetv/bake-finalize.sh
install -m 644 /opt/noticetv/bake/noticetv-bake-finalize.service /etc/systemd/system/
rm -r /opt/noticetv/bake
systemctl daemon-reload
systemctl enable noticetv-bake-finalize.service

# DietPi finishes its first run within seconds of this script; a minute is ample.
systemd-run --on-active=60 --unit=noticetv-bake-reboot systemctl reboot
