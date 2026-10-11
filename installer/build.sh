#!/bin/sh
# Build the NoticeTV installer: a USB stick image that boots on UEFI PCs, Secure Boot included,
# and writes NoticeTV OS to the computer's internal drive.
#   installer/build.sh dist/noticetv-os-<version>-x86_64.img.xz
# Output: dist/noticetv-installer-<version>-x86_64.img, to write to a USB stick of 2 GB or more.
# Runs on Debian 13 with linux-image-amd64, initramfs-tools, busybox, xz-utils, efibootmgr,
# util-linux, shim-signed, grub-efi-amd64-signed, dosfstools, mtools, gdisk, zstd and
# wpasupplicant: Debian's own signed shim, GRUB and kernel are what let it boot with Secure Boot on.
set -eu

cd "$(dirname "$0")/.."
OS_IMAGE=${1:?usage: installer/build.sh dist/noticetv-os-<version>-x86_64.img.xz}
WORK=${WORK:-build}/installer
DIST=${DIST:-dist}
VERSION=$(basename "$OS_IMAGE" | sed -n 's/^noticetv-os-\(.*\)-x86_64\.img\.xz$/\1/p')
OUT=noticetv-installer-$VERSION-x86_64.img
KVER=$(ls /lib/modules | sort -V | tail -n 1)
export MTOOLS_SKIP_CHECK=1

step() { echo "==> $*"; }
[ -n "$VERSION" ] || { echo "installer/build.sh: $OS_IMAGE is not a noticetv-os image" >&2; exit 1; }

rm -rf "$WORK"
ESP=$WORK/esp
mkdir -p "$ESP/EFI/BOOT" "$ESP/boot/grub" "$ESP/.disk" "$ESP/noticetv" "$DIST"

step "Installer system (Debian kernel $KVER)"
cp "/boot/vmlinuz-$KVER" "$ESP/noticetv/vmlinuz"
mkinitramfs -d installer/initramfs -o "$ESP/noticetv/initrd.img" "$KVER"

step "Boot chain: Debian's signed shim and GRUB"
cp /usr/lib/shim/shimx64.efi.signed "$ESP/EFI/BOOT/BOOTX64.EFI"
cp /usr/lib/shim/mmx64.efi.signed "$ESP/EFI/BOOT/mmx64.efi"
# The removable-media GRUB: it finds its config through /.disk/info, as on Debian's own media.
cp /usr/lib/grub/x86_64-efi-signed/gcdx64.efi.signed "$ESP/EFI/BOOT/grubx64.efi"
echo "NoticeTV installer $VERSION" > "$ESP/.disk/info"
cp installer/grub.cfg "$ESP/boot/grub/grub.cfg"

step "NoticeTV OS $VERSION"
cp "$OS_IMAGE" "$ESP/noticetv/"
# What the installer checks the written drive against: the image's size and checksum.
xz --robot -l "$OS_IMAGE" | awk '$1 == "totals" {print $5}' > "$ESP/noticetv/image-bytes"
xz -dc "$OS_IMAGE" | sha256sum | cut -d ' ' -f 1 > "$ESP/noticetv/image-sha256"

step "USB stick image"
# One FAT32 EFI system partition at 1 MiB, sized to its contents plus room for FAT itself.
ESP_KB=$(($(du -sk "$ESP" | cut -f 1) * 105 / 100 + 32768))
rm -f "$WORK/esp.img"
mkfs.vfat -F 32 -n NOTICETVUSB -C "$WORK/esp.img" "$ESP_KB" >/dev/null
mcopy -s -i "$WORK/esp.img" "$ESP/EFI" "$ESP/boot" "$ESP/.disk" "$ESP/noticetv" ::/
rm -f "$DIST/$OUT"
truncate -s $(((2048 + ESP_KB * 2 + 34) * 512)) "$DIST/$OUT"
sgdisk -n 1:2048:0 -t 1:EF00 -c 1:"NoticeTV installer" "$DIST/$OUT" >/dev/null
dd if="$WORK/esp.img" of="$DIST/$OUT" bs=1M seek=1 conv=notrunc status=none
(cd "$DIST" && sha256sum "$OUT" > "$OUT.sha256")
rm -rf "$WORK"
echo "built $DIST/$OUT"
