# Building NoticeTV OS and its installer

`image/build.sh` turns DietPi's official x86_64 UEFI image into a NoticeTV OS image that boots
straight into the kiosk, with nothing left to install:

1. **Download** DietPi's image and check it against DietPi's published SHA-256.
2. **Set the first boot** in its `/boot/dietpi.txt` (`image/dietpi-settings`): unattended, the
   Chromium kiosk, no SSH server, logs on disk. `image/Automation_Custom_Script.sh` goes in beside
   it. The root filesystem is edited with `debugfs`, so the build needs neither root nor mounts.
3. **Bake it in a VM.** QEMU boots the image with the NoticeTV layer (`os/`) on a second disk.
   DietPi's first run installs everything, then runs the custom script, which runs
   `os/install.sh` and reboots. On that second boot, `image/bake/finalize.sh` checks that the
   kiosk came up, saves the logs and a screenshot, removes everything specific to the VM (machine
   ID, caches, logs, Chromium profile), re-arms DietPi's resize of the root partition to fill the
   target disk, and powers off.
4. **Compress** the result to `dist/noticetv-os-<version>-x86_64.img.xz` with its `.sha256`.

`dist/bake/` is the first thing to read when a build fails: the VM's serial log, `screen.ppm`
(its screen, refreshed every 5 minutes and on a timeout: DietPi's first run shows only there),
and in `noticetv-bake/` DietPi's first-run logs, the journal of the second boot and
`screenshot.png` of the kiosk.

## The installer

`installer/build.sh dist/noticetv-os-<version>-x86_64.img.xz` makes
`dist/noticetv-installer-<version>-x86_64.img`: a USB stick image with one FAT32 EFI partition
holding

- Debian's signed boot chain (shim as `EFI/BOOT/BOOTX64.EFI`, the removable-media GRUB, the
  kernel), so it boots with Secure Boot on;
- an initramfs (`installer/initramfs`, Debian's own with `MODULES=most` for drivers) whose
  `noticetv-installer` script is the installer: it lists the drives it can use (never the stick
  itself, never one too small), asks before erasing, asks for the Wi-Fi network and password and
  the dashboard's address, writes the image, checks it against its SHA-256, writes the settings
  into the installed system (the Wi-Fi key as `wpa_passphrase`'s hash, in DietPi's Wi-Fi
  database and `wpa_supplicant.conf`), adds a NoticeTV boot entry first in the boot order and
  restarts. On a drive that already has NoticeTV it can change those settings without
  reinstalling;
- the NoticeTV OS image with its size and checksum.

It has to run on Debian 13, for Debian's signed shim, GRUB and kernel; elsewhere, in a
`debian:trixie` container (`--platform linux/amd64` on an Apple Silicon Mac), with the packages
listed at the top of the script.

`installer/test.sh dist/noticetv-installer-<version>-x86_64.img` tests it end to end in QEMU with
Secure Boot on: the installer boots from a USB stick onto a blank NVMe drive (in a test mode that
takes its answers from the kernel command line), then that drive boots alone, and the test checks
that NoticeTV grew into the drive, started its kiosk, and holds the Wi-Fi network and dashboard it
was given, with no password stored as typed. Its logs and the final screen are in
`dist/installer-test/`.

## On GitHub

The **Image** workflow builds the image and the installer, and tests the installer, on demand
from the Actions tab and for every `v*` tag, attaching both to the tag's release. Its runner has
KVM, so the build VMs run at native speed.

## On your own machine

On Linux with `qemu-system-x86`, `ovmf`, `e2fsprogs`, `gdisk`, `mtools`, `xz-utils` and `curl`:

```sh
image/build.sh
```

Without KVM (any Mac, or Linux in a VM) the build VM is emulated and the bake takes an hour or
more; give it time with `BAKE_MINUTES=300`. On a Mac, in Docker:

```sh
docker run --rm -v "$PWD":/src -v noticetv-build:/work -e WORK=/work -e DIST=/src/dist \
  -e VERSION="$(git describe --tags --always --dirty)" -e BAKE_MINUTES=300 ubuntu:24.04 sh -c '
    apt-get update -qq &&
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq qemu-system-x86 ovmf e2fsprogs gdisk mtools xz-utils curl ca-certificates &&
    /src/image/build.sh'
```

`WORK` caches the DietPi download between builds. `VM_MEMORY` (MiB, default 3072) and `VM_CPUS`
(default 2) size the build VM.

## Screenshots

`image/screenshots.sh dist/noticetv-os-<version>-x86_64.img.xz [dashboard URL]` boots an image in
a VM with a 4K screen, running this checkout's NoticeTV scripts, and saves the screen every 15
seconds to `dist/screenshots/`. `installer/screenshots.sh dist/noticetv-installer-<version>-x86_64.img`
answers the installer's questions with key presses and keeps each screen in
`dist/installer-screens/`. `docs/images/render.sh TV_SCREEN dist/installer-screens` turns them
into the README's images.

## Trying an image

Boot it in QEMU on any machine, with a window showing the TV's view:

```sh
xz -dk dist/noticetv-os-*-x86_64.img.xz
qemu-system-x86_64 -machine q35 -m 3072 -smp 2 \
  -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
  -drive file=dist/noticetv-os-<version>-x86_64.img,format=raw \
  -nic user,model=e1000
```

On a Mac with Homebrew's QEMU, the firmware is
`/opt/homebrew/share/qemu/edk2-x86_64-code.fd`.
