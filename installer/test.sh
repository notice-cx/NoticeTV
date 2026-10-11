#!/bin/sh
# End-to-end test of the installer, in QEMU with Secure Boot on: boot the installer from a USB
# stick onto a blank 16 GB NVMe drive, then boot that drive alone, and check that NoticeTV grew
# into the whole drive, started its kiosk, and holds the Wi-Fi network and dashboard it was given.
#   installer/test.sh dist/noticetv-installer-<version>-x86_64.img
# Output in dist/installer-test/: both boots' serial logs and screen.ppm, the installed drive's
# screen at the end. Needs Linux with qemu-system-x86_64, OVMF (with its Secure Boot variant),
# mtools, gdisk and e2fsprogs.
set -eu

cd "$(dirname "$0")/.."
INSTALLER=${1:?usage: installer/test.sh dist/noticetv-installer-<version>-x86_64.img}
WORK=${WORK:-build}/installer-test
OUT=${DIST:-dist}/installer-test
OVMF_CODE=${OVMF_CODE_SECBOOT:-/usr/share/OVMF/OVMF_CODE_4M.secboot.fd}
OVMF_VARS=${OVMF_VARS_SECBOOT:-/usr/share/OVMF/OVMF_VARS_4M.ms.fd}
INSTALL_TIMEOUT=${INSTALL_TIMEOUT:-60m}
# How long the installed drive runs before it is checked: DietPi's partition growth reboots it
# twice before the kiosk starts.
BOOT_SECONDS=${BOOT_SECONDS:-600}
export MTOOLS_SKIP_CHECK=1

step() { echo "==> $*"; }
fail() { echo "installer/test.sh: $*" >&2; exit 1; }

rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT"
if [ -w /dev/kvm ]; then
    ACCEL="-accel kvm -cpu host"
else
    # Emulated, an older CPU model: with -cpu max Chromium's GPU process crashes (SIGSEGV)
    # under TCG, so the kiosk never stays up.
    ACCEL="-accel tcg -cpu Nehalem"
fi
cp "$OVMF_VARS" "$WORK/vars.fd"
truncate -s 16G "$WORK/drive.img"
# Word-split on purpose: no path here has a space.
QEMU="qemu-system-x86_64 -machine q35,smm=on $ACCEL -smp 2 -m 3072
    -global driver=cfi.pflash01,property=secure,value=on
    -drive if=pflash,format=raw,readonly=on,file=$OVMF_CODE
    -drive if=pflash,format=raw,file=$WORK/vars.fd
    -drive id=drive,if=none,format=raw,file=$WORK/drive.img
    -device nvme,drive=drive,serial=NOTICETVTEST
    -nic user,model=e1000 -display none"

# The test's own copy of the stick boots with noticetv.installer=test (these answers instead of
# questions, a power-off when done) and its console on the serial port.
TEST_SSID=NoticeTVTest
TEST_PASSWORD=noticetv-test-key
TEST_DASHBOARD=https://example.com/
cp "$INSTALLER" "$WORK/usb.img"
USB_ESP="$WORK/usb.img@@1048576"
mcopy -n -i "$USB_ESP" ::boot/grub/grub.cfg "$WORK/grub.cfg"
sed -i "s| noticetv.installer\$| noticetv.installer=test noticetv.test.ssid=$TEST_SSID noticetv.test.password=$TEST_PASSWORD noticetv.test.dashboard=$TEST_DASHBOARD console=tty0 console=ttyS0,115200|" "$WORK/grub.cfg"
grep -q 'noticetv.installer=test' "$WORK/grub.cfg" || fail "could not switch the installer to test mode"
mcopy -o -i "$USB_ESP" "$WORK/grub.cfg" ::boot/grub/grub.cfg

step "Install: the installer on a USB stick, a blank NVMe drive, Secure Boot on"
# shellcheck disable=SC2086
timeout "$INSTALL_TIMEOUT" $QEMU -serial file:"$OUT/install-serial.log" \
    -device qemu-xhci -drive id=usb,if=none,format=raw,file="$WORK/usb.img" \
    -device usb-storage,drive=usb,bootindex=0 \
    || fail "the installer did not power off within $INSTALL_TIMEOUT; see $OUT/install-serial.log"
grep -q "NoticeTV is installed" "$OUT/install-serial.log" \
    || fail "the installer did not finish; see $OUT/install-serial.log"

step "Boot the installed drive alone for ${BOOT_SECONDS}s"
mkfifo "$WORK/monitor.in" "$WORK/monitor.out"
cat "$WORK/monitor.out" > "$OUT/monitor.log" &
# shellcheck disable=SC2086
$QEMU -serial file:"$OUT/boot-serial.log" -monitor pipe:"$WORK/monitor" &
VM=$!
sleep "$BOOT_SECONDS"
kill -0 "$VM" 2>/dev/null || fail "the installed drive's VM stopped on its own; see $OUT/boot-serial.log"
# QEMU runs in this script's directory, so the same relative or absolute path works for it.
echo "screendump $OUT/screen.ppm" > "$WORK/monitor.in"
sleep 5
# The power button, as a person would press it, so the system shuts down cleanly; quit only if it
# hasn't within two minutes.
echo system_powerdown > "$WORK/monitor.in"
n=0
while kill -0 "$VM" 2>/dev/null && [ $n -lt 120 ]; do
    sleep 1
    n=$((n + 1))
done
if kill -0 "$VM" 2>/dev/null; then
    echo quit > "$WORK/monitor.in"
fi
wait "$VM" || true

step "Check the installed drive"
LAST=$(sgdisk -i 2 "$WORK/drive.img" | awk '/^Last sector:/{print $3}')
DRIVE_SECTORS=$(($(stat -c %s "$WORK/drive.img") / 512))
[ $((DRIVE_SECTORS - LAST)) -lt 4096 ] || fail "the root partition did not grow into the drive"
FIRST=$(sgdisk -i 2 "$WORK/drive.img" | awk '/^First sector:/{print $3}')
dd if="$WORK/drive.img" of="$WORK/root.ext4" bs=4M iflag=skip_bytes,count_bytes \
    skip=$((FIRST * 512)) count=$(((LAST - FIRST + 1) * 512)) status=none
# Whatever is still in the ext4 journal (a guest stopped mid-write) is invisible to debugfs:
# replay it first.
e2fsck -fy "$WORK/root.ext4" >/dev/null 2>&1 || true
debugfs -R "stat /root/.config/chromium" "$WORK/root.ext4" 2>/dev/null | grep -q "Type: directory" \
    || fail "the kiosk never started on the installed drive; see $OUT/screen.ppm"
installed() { debugfs -R "cat $1" "$WORK/root.ext4" 2>/dev/null; }
installed /boot/dietpi.txt | grep -qx "SOFTWARE_CHROMIUM_AUTOSTART_URL=$TEST_DASHBOARD" \
    || fail "the kiosk was not set to the dashboard address"
installed /etc/noticetv/noticetv.conf | grep -qx "DASHBOARD_URL='$TEST_DASHBOARD'" \
    || fail "noticetv.conf did not get the dashboard address"
HEX_SSID=$(printf '%s' "$TEST_SSID" | od -A n -t x1 | tr -d ' \n')
installed /etc/wpa_supplicant/wpa_supplicant.conf | grep -q "ssid=$HEX_SSID" \
    || fail "wpa_supplicant.conf did not get the Wi-Fi network"
installed /etc/wpa_supplicant/wpa_supplicant.conf | grep -Eq "psk=[0-9a-f]{64}$" \
    || fail "wpa_supplicant.conf did not get the Wi-Fi key"
installed /var/lib/dietpi/dietpi-wifi.db | grep -qx "aWIFI_SSID\[0\]='$TEST_SSID'" \
    || fail "DietPi's Wi-Fi database did not get the network"
if { installed /etc/wpa_supplicant/wpa_supplicant.conf; installed /var/lib/dietpi/dietpi-wifi.db; } | grep -q "$TEST_PASSWORD"; then
    fail "the Wi-Fi password was stored as typed"
fi
rm -rf "$WORK"
echo "the installer works: NoticeTV installed with its Wi-Fi and dashboard, grew into the drive and started its kiosk ($OUT/screen.ppm)"
