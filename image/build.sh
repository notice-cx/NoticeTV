#!/bin/sh
# Build the NoticeTV OS disk image: DietPi's x86_64 UEFI image, set up unattended in a VM with the
# NoticeTV layer installed, then cleaned of everything specific to that VM.
#   image/build.sh
# Output in dist/: noticetv-os-<version>-x86_64.img.xz and its .sha256, and bake/ with the build
# VM's logs and a screenshot of the kiosk it booted into.
# Needs Linux with qemu-system-x86_64, OVMF, e2fsprogs, gdisk, mtools, xz, curl and coreutils.
# With KVM the VM runs at native speed; without it, emulation takes several times longer.
set -eu

cd "$(dirname "$0")/.."
VERSION=${VERSION:-$(git describe --tags --always --dirty)}
WORK=${WORK:-build}
DIST=${DIST:-dist}
DISK_SIZE=${DISK_SIZE:-6G}
BAKE_MINUTES=${BAKE_MINUTES:-120}
VM_MEMORY=${VM_MEMORY:-3072}
VM_CPUS=${VM_CPUS:-2}
OVMF_CODE=${OVMF_CODE:-/usr/share/OVMF/OVMF_CODE_4M.fd}
OVMF_VARS=${OVMF_VARS:-/usr/share/OVMF/OVMF_VARS_4M.fd}
DIETPI=DietPi_NativePC-UEFI-x86_64-Trixie.img
DIETPI_URL=https://dietpi.com/downloads/images/$DIETPI.xz
IMG=$WORK/noticetv-os.img
OUT=noticetv-os-$VERSION-x86_64.img.xz
export MTOOLS_SKIP_CHECK=1

step() { echo "==> $*"; }
fail() { echo "image/build.sh: $*" >&2; exit 1; }
part_first() { sgdisk -i "$2" "$1" | awk '/^First sector:/{print $3}'; }
part_last() { sgdisk -i "$2" "$1" | awk '/^Last sector:/{print $3}'; }

# Set KEY=VALUE in a dietpi.txt, escaping the characters sed would treat as special.
set_key() {
    value=$(printf '%s' "$3" | sed 's/[&|\\]/\\&/g')
    if grep -q "^[[:blank:]]*$2=" "$1"; then
        sed -i "s|^[[:blank:]]*$2=.*|$2=$value|" "$1"
    else
        echo "$2=$3" >> "$1"
    fi
}

mkdir -p "$WORK" "$DIST"
rm -rf "${DIST:?}/bake" "$DIST/$OUT" "$DIST/$OUT.sha256"

step "DietPi image ($DIETPI)"
curl -fsSL -o "$WORK/$DIETPI.xz.sha256" "$DIETPI_URL.sha256"
if ! (cd "$WORK" && sha256sum -c --status "$DIETPI.xz.sha256" 2>/dev/null); then
    curl -fL --progress-bar -o "$WORK/$DIETPI.xz" "$DIETPI_URL"
    (cd "$WORK" && sha256sum -c "$DIETPI.xz.sha256")
fi
xz -dc "$WORK/$DIETPI.xz" > "$IMG"

step "First-boot settings"
# The root filesystem is edited with debugfs on a copy of its partition: no mounts, no root.
ROOT_FIRST=$(part_first "$IMG" 2)
ROOT_BYTES=$((($(part_last "$IMG" 2) - ROOT_FIRST + 1) * 512))
dd if="$IMG" of="$WORK/root.ext4" bs=4M iflag=skip_bytes,count_bytes \
    skip=$((ROOT_FIRST * 512)) count="$ROOT_BYTES" status=none
debugfs -R "dump /boot/dietpi.txt $WORK/dietpi.txt" "$WORK/root.ext4" 2>/dev/null
debugfs -R "dump /boot/grub/grub.cfg $WORK/grub.cfg" "$WORK/root.ext4" 2>/dev/null
grep -v '^[[:blank:]]*\(#\|$\)' image/dietpi-settings | while IFS='=' read -r key value; do
    set_key "$WORK/dietpi.txt" "$key" "$value"
done
# Every image shares this password, so it never leaves the build: with no SSH server it only
# guards the local console, which the kiosk holds.
set_key "$WORK/dietpi.txt" AUTO_SETUP_GLOBAL_PASSWORD "$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
# Kernel and boot messages on the serial port for the build log: in grub.cfg for the first boot,
# and in a grub.d drop-in so every update-grub of the bake keeps them (finalize.sh removes it).
sed -i 's|^\([[:blank:]]*linux[[:blank:]].*\)$|\1 console=tty1 console=ttyS0,115200|' "$WORK/grub.cfg"
# shellcheck disable=SC2016  # expanded by update-grub, not here
echo 'GRUB_CMDLINE_LINUX_DEFAULT="$GRUB_CMDLINE_LINUX_DEFAULT console=tty1 console=ttyS0,115200"' \
    > "$WORK/noticetv-bake.cfg"
cat > "$WORK/debugfs.cmds" << EOF
mkdir /etc/default/grub.d
write $WORK/noticetv-bake.cfg /etc/default/grub.d/noticetv-bake.cfg
sif /etc/default/grub.d/noticetv-bake.cfg mode 0100644
rm /boot/dietpi.txt
write $WORK/dietpi.txt /boot/dietpi.txt
sif /boot/dietpi.txt mode 0100644
rm /boot/grub/grub.cfg
write $WORK/grub.cfg /boot/grub/grub.cfg
sif /boot/grub/grub.cfg mode 0100644
write image/Automation_Custom_Script.sh /boot/Automation_Custom_Script.sh
sif /boot/Automation_Custom_Script.sh mode 0100755
EOF
for f in /boot/dietpi.txt /boot/grub/grub.cfg /boot/Automation_Custom_Script.sh /etc/default/grub.d/noticetv-bake.cfg; do
    printf 'sif %s uid 0\nsif %s gid 0\n' "$f" "$f" >> "$WORK/debugfs.cmds"
done
# mkdir reports an error when grub.d already exists; debugfs carries on with the rest.
debugfs -w -f "$WORK/debugfs.cmds" "$WORK/root.ext4" >/dev/null 2>&1
debugfs -R "stat /etc/default/grub.d/noticetv-bake.cfg" "$WORK/root.ext4" 2>/dev/null | grep -q "User:     0" \
    || fail "the first-boot settings could not be written into the image"
e2fsck -fn "$WORK/root.ext4" >/dev/null || fail "the root filesystem is damaged after editing"
dd if="$WORK/root.ext4" of="$IMG" bs=4M oflag=seek_bytes seek=$((ROOT_FIRST * 512)) \
    conv=notrunc status=none
rm "$WORK/root.ext4"

step "Layer disk"
# install.sh, the files it installs, and the build's own finalize step, as a raw tar on a
# second disk the VM reads with tar -xf.
tar -cf "$WORK/layer.tar" -C os . -C ../image bake

step "Disk size: $DISK_SIZE (DietPi grows the root partition into it on first boot)"
truncate -s "$DISK_SIZE" "$IMG"
sgdisk -e "$IMG" >/dev/null

step "Bake: DietPi's first run and the NoticeTV install, in a VM (log: $DIST/bake/serial.log)"
mkdir -p "$DIST/bake"
cp "$OVMF_VARS" "$WORK/ovmf-vars.fd"
if [ -w /dev/kvm ]; then
    ACCEL="-accel kvm -cpu host"
else
    # Emulated, an older CPU model: with -cpu max Chromium's GPU process crashes (SIGSEGV)
    # under TCG, so the kiosk never stays up.
    ACCEL="-accel tcg -cpu Nehalem"
    echo "    no KVM: the VM is emulated, expect an hour or more"
fi
# The monitor, through a pair of FIFOs, is how the build sees the VM's screen: DietPi's first run
# prints to it, not to the serial port.
rm -f "$WORK/monitor.in" "$WORK/monitor.out"
mkfifo "$WORK/monitor.in" "$WORK/monitor.out"
cat "$WORK/monitor.out" > "$DIST/bake/monitor.log" &
monitor() { timeout 5 sh -c "echo '$1' > '$WORK/monitor.in'" || true; }
# shellcheck disable=SC2086  # ACCEL is several arguments
qemu-system-x86_64 -machine q35 $ACCEL -smp "$VM_CPUS" -m "$VM_MEMORY" \
    -drive if=pflash,format=raw,readonly=on,file="$OVMF_CODE" \
    -drive if=pflash,format=raw,file="$WORK/ovmf-vars.fd" \
    -device ahci,id=ahci \
    -drive id=system,if=none,format=raw,file="$IMG",discard=unmap,cache=unsafe \
    -device ide-hd,drive=system,bus=ahci.0,bootindex=0 \
    -drive id=layer,if=none,format=raw,file="$WORK/layer.tar",snapshot=on \
    -device ide-hd,drive=layer,bus=ahci.1,serial=NOTICETVLAYER \
    -netdev user,id=net0 -device e1000,netdev=net0 \
    -vga none -device VGA,vgamem_mb=64,xres=3840,yres=2160 \
    -display none -monitor pipe:"$WORK/monitor" -serial file:"$DIST/bake/serial.log" &
VM=$!
# Wait for the VM to power off, keeping its latest screen in the logs every 5 minutes.
DEADLINE=$(($(date +%s) + BAKE_MINUTES * 60))
TICKS=0
while kill -0 "$VM" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$DEADLINE" ]; then
        monitor "screendump $DIST/bake/screen.ppm"
        sleep 3
        kill "$VM"
        fail "the build VM did not power off within $BAKE_MINUTES minutes; its last screen: $DIST/bake/screen.ppm"
    fi
    sleep 30
    TICKS=$((TICKS + 1))
    if [ $((TICKS % 10)) -eq 0 ]; then
        monitor "screendump $DIST/bake/screen.ppm"
    fi
done
wait "$VM" || fail "QEMU stopped with an error; see $DIST/bake/serial.log"

step "Bake result"
ESP="$IMG@@$(($(part_first "$IMG" 1) * 512))"
mcopy -s -n -i "$ESP" ::noticetv-bake "$DIST/bake/" 2>/dev/null \
    || fail "the build VM left no result; see $DIST/bake/serial.log"
mdeltree -i "$ESP" ::noticetv-bake
RESULT=$(cat "$DIST/bake/noticetv-bake/result")
[ "$RESULT" = ok ] || fail "$RESULT; logs in $DIST/bake/noticetv-bake/logs"
echo "    the kiosk came up; screenshot: $DIST/bake/noticetv-bake/screenshot.png"

step "Compress"
xz -T0 -6 -c "$IMG" > "$DIST/$OUT"
(cd "$DIST" && sha256sum "$OUT" > "$OUT.sha256")
rm "$IMG"
echo "built $DIST/$OUT"
