#!/bin/sh
# NoticeTV OS image build, inside the build VM, on the boot after DietPi's first run: check the
# kiosk came up, leave the logs and a screenshot on the EFI partition for image/build.sh, remove
# everything specific to this VM, re-arm DietPi's root partition expansion for the real disk,
# and power off.
OUT=/boot/efi/noticetv-bake
mkdir -p "$OUT/logs"

finish() {  # finish RESULT
    echo "$1" > "$OUT/result"
    journalctl -b --no-pager > "$OUT/logs/journal.txt" 2>&1
    cp -r /var/lib/dietpi/logs/. "$OUT/logs/" 2>/dev/null
    if [ "$1" = ok ]; then
        clean_up
    fi
    sync
    systemctl poweroff
    exit 0
}

clean_up() {
    # The build's serial console off the kernel command line (image/build.sh added it).
    rm -f /etc/default/grub.d/noticetv-bake.cfg
    update-grub
    # The kiosk off first, so Chromium can't write its profile back; its watch first, or it would
    # start the kiosk again.
    systemctl stop noticetv-kiosk-watch.service getty@tty1.service
    rm -rf /root/.config/chromium /root/.cache /root/.bash_history /root/.Xauthority
    apt-get clean
    rm -rf /var/lib/apt/lists/*
    rm -f /var/lib/dhcp/*.leases /var/lib/systemd/random-seed
    rm -rf /tmp/* /var/tmp/* /var/lib/dietpi/logs/*
    # A fresh machine ID on the first real boot (systemd generates one for an empty file).
    : > /etc/machine-id
    rm -f /var/lib/dbus/machine-id
    systemctl stop systemd-journald.socket systemd-journald-dev-log.socket systemd-journald.service
    rm -rf /var/log/journal/*

    # DietPi grows the root partition to fill the disk on first boot, then disables itself;
    # enable it again for the disk this image is written to.
    rm -f /dietpi_skip_partition_resize
    mkdir -p /etc/systemd/system/local-fs.target.wants
    ln -sf /etc/systemd/system/dietpi-fs_partition_resize.service \
        /etc/systemd/system/local-fs.target.wants/dietpi-fs_partition_resize.service

    systemctl disable noticetv-bake-finalize.service
    rm -f /etc/systemd/system/noticetv-bake-finalize.service /usr/local/lib/noticetv/bake-finalize.sh

    # Discarded blocks make the image file sparse, so it compresses to its real content.
    fstrim -v /
}

[ "$(cat /boot/dietpi/.install_stage 2>/dev/null)" = 2 ] || finish "failed: DietPi's first run did not complete"
[ -f /var/lib/noticetv/initramfs.sum ] || finish "failed: install.sh did not complete"

n=0
until pgrep -x chromium >/dev/null || [ $n -ge 180 ]; do
    sleep 1
    n=$((n + 1))
done
pgrep -x chromium >/dev/null || finish "failed: the kiosk did not start within 3 minutes"

# Let the start page paint, then keep a picture of it as proof. A Chromium that started but
# crashed on its first page is gone by then.
sleep 20
pgrep -x chromium >/dev/null || finish "failed: the kiosk started but Chromium quit within 20 seconds"
DISPLAY=:0 XAUTHORITY=/root/.Xauthority scrot -o "$OUT/screenshot.png"
finish ok
