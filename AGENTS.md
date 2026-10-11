# AGENTS.md — NoticeTV repo context pack

The facts and conventions an agent needs before touching this repo. Where this file and the
code disagree, the code is the fact and this file is amended.

## What this repo is

NoticeTV is a wall display appliance: an x86 mini PC plugged into a TV that boots straight into
a web dashboard and runs unattended. NoticeTV OS is the layer that turns a stock DietPi
(Debian 13, x86_64) install into one. NoticeOS's Wall is one dashboard it can show; any URL
works.

## Layout

| Path | Owns |
|---|---|
| `os/install.sh` | the installer: idempotent, run as root on the box |
| `os/rootfs/` | files installed verbatim onto the box, at the same paths |
| `os/noticetv.conf.example` | every setting a box can have, with its default |
| `scripts/` | tools run from a developer's machine, e.g. `install-over-ssh.sh` |
| `brand/` | the boot splash source: the lockup page, its font, the renderer |
| `docs/` | tested hardware and its quirks; troubleshooting |

## Conventions

- **Box scripts are POSIX sh** and run under dash: no bashisms (`local` is fine).
- **The installer converges.** Running it twice changes nothing the second time; a step that
  changes boot (GRUB, initramfs) does so only when its inputs changed, and says a reboot is needed.
- **Nothing about one installation lives in the repo**: no IP addresses, hostnames, Wi-Fi names,
  dashboard URLs or time zones. Those are settings in `/etc/noticetv/noticetv.conf` on the box.
  Defaults are defined once, in `os/rootfs/usr/local/lib/noticetv/lib.sh`; the example file
  documents them.
- **Names**: every unit and config file this layer adds carries the `noticetv-` prefix, so
  `ls /etc/systemd/system/noticetv-*` lists all of it. A file the installer generates says so in
  its first line.
- **Hardware quirks are documented with their evidence** in `docs/hardware.md`: the symptom, the
  cause and a source (a kernel thread, a bug report).
- **Comments say what the code cannot**: a non-obvious why, an invariant, a trap. No histories.

## Working on a box

- A box is someone's screen. Never leave it unbootable: boot changes go through `update-grub` and
  `update-initramfs`, and the splash has a timeout fallback so a broken kiosk still shows the
  console.
- Deploy with `scripts/install-over-ssh.sh <host>`, then reboot and check: the kiosk is up, X runs
  on VT 1 (`grep "VT number" /var/log/Xorg.0.log`), and `journalctl -t noticetv-health` has a
  line per minute.
- DietPi's default SSH server is Dropbear, which has no SFTP: copy with tar or `ssh host cat`.

## Git

Never amend a commit and never force-push; make a new commit instead.
