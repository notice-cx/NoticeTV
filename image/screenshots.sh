#!/bin/sh
# Boot a built NoticeTV OS image in a VM with a 4K screen and keep pictures of it: for the README,
# and for seeing what a build looks like on a TV.
#   image/screenshots.sh dist/noticetv-os-<version>-x86_64.img.xz [dashboard URL]
# Output: dist/screenshots/screen-NNN.png, one every EVERY seconds (default 15), SHOTS of them
# (default 60). With a URL the kiosk shows it instead of the NoticeTV start page. The VM runs
# this checkout's NoticeTV scripts, so changes to them show without a new build.
# Needs Linux with qemu-system-x86_64, OVMF, e2fsprogs, gdisk, xz and netpbm.
set -eu

cd "$(dirname "$0")/.."
IMAGE=${1:?usage: image/screenshots.sh dist/noticetv-os-<version>-x86_64.img.xz [dashboard URL]}
URL=${2:-}
WORK=${WORK:-build}/screenshots
OUT=${DIST:-dist}/screenshots
SHOTS=${SHOTS:-60}
EVERY=${EVERY:-15}
OVMF_CODE=${OVMF_CODE:-/usr/share/OVMF/OVMF_CODE_4M.fd}
OVMF_VARS=${OVMF_VARS:-/usr/share/OVMF/OVMF_VARS_4M.fd}

rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT"
xz -dc "$IMAGE" > "$WORK/disk.img"

# Into the image's root filesystem: this checkout's NoticeTV scripts, the dashboard URL, and
# software rendering for Chromium, whose GPU process crashes on a VM's emulated graphics card.
FIRST=$(sgdisk -i 2 "$WORK/disk.img" | awk '/^First sector:/{print $3}')
LAST=$(sgdisk -i 2 "$WORK/disk.img" | awk '/^Last sector:/{print $3}')
dd if="$WORK/disk.img" of="$WORK/root.ext4" bs=4M iflag=skip_bytes,count_bytes \
    skip=$((FIRST * 512)) count=$(((LAST - FIRST + 1) * 512)) status=none
debugfs -R "dump /boot/dietpi.txt $WORK/dietpi.txt" "$WORK/root.ext4" 2>/dev/null
if [ -n "$URL" ]; then
    sed -i "s|^SOFTWARE_CHROMIUM_AUTOSTART_URL=.*|SOFTWARE_CHROMIUM_AUTOSTART_URL=$URL|" "$WORK/dietpi.txt"
fi
# shellcheck disable=SC2016  # expanded by Chromium's launcher, not here
echo 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --disable-gpu --disable-features=VaapiVideoDecodeLinuxGL,VaapiVideoDecoder"' \
    > "$WORK/vm-flags"
{
    echo "rm /boot/dietpi.txt"
    echo "write $WORK/dietpi.txt /boot/dietpi.txt"
    echo "write $WORK/vm-flags /etc/chromium.d/zz-vm"
    for f in os/rootfs/usr/local/lib/noticetv/*; do
        echo "rm /usr/local/lib/noticetv/${f##*/}"
        echo "write $f /usr/local/lib/noticetv/${f##*/}"
        echo "sif /usr/local/lib/noticetv/${f##*/} mode 0100755"
    done
    for f in /boot/dietpi.txt /etc/chromium.d/zz-vm os/rootfs/usr/local/lib/noticetv/*; do
        target=$f
        case "$f" in os/*) target=/usr/local/lib/noticetv/${f##*/} ;; esac
        printf 'sif %s uid 0\nsif %s gid 0\n' "$target" "$target"
    done
} > "$WORK/debugfs.cmds"
debugfs -w -f "$WORK/debugfs.cmds" "$WORK/root.ext4" >/dev/null 2>&1
dd if="$WORK/root.ext4" of="$WORK/disk.img" bs=4M oflag=seek_bytes seek=$((FIRST * 512)) \
    conv=notrunc status=none
rm "$WORK/root.ext4"

if [ -w /dev/kvm ]; then
    ACCEL="-accel kvm -cpu host"
else
    # Emulated, an older CPU model: with -cpu max Chromium's GPU process crashes (SIGSEGV)
    # under TCG, so the kiosk never stays up.
    ACCEL="-accel tcg -cpu Nehalem"
fi
cp "$OVMF_VARS" "$WORK/vars.fd"
mkfifo "$WORK/monitor.in" "$WORK/monitor.out"
cat "$WORK/monitor.out" > /dev/null &
# shellcheck disable=SC2086  # ACCEL is several arguments
qemu-system-x86_64 -machine q35 $ACCEL -smp 2 -m 3072 \
    -drive if=pflash,format=raw,readonly=on,file="$OVMF_CODE" \
    -drive if=pflash,format=raw,file="$WORK/vars.fd" \
    -drive file="$WORK/disk.img",format=raw,if=none,id=disk -device ahci,id=ahci \
    -device ide-hd,drive=disk,bus=ahci.0 \
    -nic user,model=e1000 -vga none -device VGA,vgamem_mb=64,xres=3840,yres=2160 \
    -display none -monitor pipe:"$WORK/monitor" -serial file:"$OUT/serial.log" &
VM=$!

i=1
while [ "$i" -le "$SHOTS" ] && kill -0 "$VM" 2>/dev/null; do
    sleep "$EVERY"
    n=$(printf %03d "$i")
    echo "screendump $WORK/screen.ppm" > "$WORK/monitor.in"
    sleep 2
    pnmtopng "$WORK/screen.ppm" > "$OUT/screen-$n.png" 2>/dev/null || true
    i=$((i + 1))
done
echo quit > "$WORK/monitor.in"
wait "$VM" || true
rm -rf "$WORK"
echo "pictures in $OUT"
