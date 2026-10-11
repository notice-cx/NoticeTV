#!/bin/sh
# Boot the installer in a VM (Secure Boot on) with a blank drive, answer its questions with QEMU
# key presses, and keep a picture of each screen; it stops before anything is written.
#   installer/screenshots.sh dist/noticetv-installer-<version>-x86_64.img
# Output: dist/installer-screens/confirm.png, wifi.png, password.png and dashboard.png, for
# docs/images/render.sh. Needs Linux with qemu-system-x86_64, OVMF (with its Secure Boot variant)
# and netpbm.
set -eu

cd "$(dirname "$0")/.."
INSTALLER=${1:?usage: installer/screenshots.sh dist/noticetv-installer-<version>-x86_64.img}
WORK=${WORK:-build}/installer-screens
OUT=${DIST:-dist}/installer-screens
# Time for the installer to reach its first question; emulated, well over a minute.
BOOT_SECONDS=${BOOT_SECONDS:-150}

rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT"
cp "$INSTALLER" "$WORK/usb.img"
truncate -s 256G "$WORK/drive.img"
cp /usr/share/OVMF/OVMF_VARS_4M.ms.fd "$WORK/vars.fd"
if [ -w /dev/kvm ]; then
    ACCEL="-accel kvm -cpu host"
else
    ACCEL="-accel tcg -cpu Nehalem"
fi
mkfifo "$WORK/monitor.in" "$WORK/monitor.out"
cat "$WORK/monitor.out" > /dev/null &
# shellcheck disable=SC2086  # ACCEL is several arguments
qemu-system-x86_64 -machine q35,smm=on $ACCEL -smp 2 -m 2048 \
    -global driver=cfi.pflash01,property=secure,value=on \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.secboot.fd \
    -drive if=pflash,format=raw,file="$WORK/vars.fd" \
    -drive id=drive,if=none,format=raw,file="$WORK/drive.img" -device nvme,drive=drive,serial=NOTICETVDEMO \
    -device qemu-xhci -drive id=usb,if=none,format=raw,file="$WORK/usb.img" \
    -device usb-storage,drive=usb,bootindex=0 \
    -display none -monitor pipe:"$WORK/monitor" -serial file:"$OUT/serial.log" &
VM=$!

monitor() { echo "$1" > "$WORK/monitor.in"; sleep 0.3; }
shot() { sleep 2; monitor "screendump $WORK/screen.ppm"; sleep 2; pnmtopng "$WORK/screen.ppm" > "$OUT/$1.png"; }
# Each character as the QEMU sendkey name of its key.
type_text() {
    printf '%s\n' "$1" | fold -w 1 | while IFS= read -r c; do
        case "$c" in
        [a-z0-9]) key=$c ;;
        [A-Z]) key="shift-$(echo "$c" | tr 'A-Z' 'a-z')" ;;
        .) key=dot ;;
        /) key=slash ;;
        :) key=shift-semicolon ;;
        -) key=minus ;;
        " ") key=spc ;;
        *) continue ;;
        esac
        monitor "sendkey $key"
    done
}

sleep "$BOOT_SECONDS"
shot confirm
monitor "sendkey ret"
sleep 3
type_text "Studio"
shot wifi
monitor "sendkey ret"
sleep 3
type_text "notice-demo"
shot password
monitor "sendkey ret"
sleep 3
type_text "https://demo.notice.cx/wall"
shot dashboard
monitor quit
wait "$VM" || true
rm -rf "$WORK"
echo "pictures in $OUT"
