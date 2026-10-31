# AGENTS.md — NoticeTV repo context pack

The facts and conventions an agent needs before touching this repo. Where this file and the
code disagree, the code is the fact and this file is amended.

## What this repo is

NoticeTV includes a self-hosted dashboard and a wall display appliance. The dashboard in `app/`
has a browser editor, a passive TV view, and a Node.js server. It runs independently of the OS.
NoticeTV OS turns a stock DietPi (Debian 13, x86_64) mini PC into an unattended display. It can
show the NoticeTV dashboard, NoticeOS's Wall, or any URL. The OS image does not yet bundle the app.

## Layout

| Path | Owns |
|---|---|
| `app/` | self-hosted dashboard, editor, API, Docker packaging and fixture-only tests; see `app/README.md` |
| `os/install.sh` | installs the layer: idempotent, run as root on the box |
| `os/rootfs/` | files installed verbatim onto the box, at the same paths |
| `os/noticetv.conf.example` | every setting a box can have, with its default |
| `image/` | the NoticeTV OS image build: DietPi's image, baked in a VM with the layer installed |
| `installer/` | the USB installer: Debian's signed boot chain and an initramfs that writes the image to a drive and sets its Wi-Fi and dashboard; its end-to-end test and screenshots |
| `.github/workflows/image.yml` | builds the image and installer, tests the installer, attaches both to `v*` releases |
| `scripts/` | tools run from a developer's machine, e.g. `install-over-ssh.sh` |
| `brand/` | the boot splash source: the lockup page, its font, the renderer |
| `docs/` | tested hardware and its quirks; troubleshooting; how the image and installer are built |
| `docs/images/` | documentation images and provenance; `npm run screenshots` in `app/` captures the dashboard, `render.sh` renders appliance visuals from VM screenshots. Mermaid diagrams live in the root README. `badges/` are saved shields.io badges |

## Conventions

- **Dashboard code is TypeScript.** Browser and server share the versioned document schema in
  `app/shared/dashboard.ts`. Format with Prettier; run the checks in `CONTRIBUTING.md`.
- **Published screens and editing have separate access.** A paired display may read the published
  dashboard but may not read drafts, change configuration, or issue another pairing code.
- **Dashboard themes use semantic colors.** Palettes live in `app/shared/themes.ts`; widgets use
  their CSS variables. Graphite is the default. The editor stays neutral independently of the dashboard.
- **Dashboard tests use local fixtures.** No live cameras, Home Assistant installations, or external
  data services. Runtime data and keys stay in the ignored data directory, outside source control.

- **Box scripts are POSIX sh** and run under dash: no bashisms (`local` is fine).
- **`os/install.sh` converges.** Running it twice changes nothing the second time; a step that
  changes boot (GRUB, initramfs) does so only when its inputs changed, and says a reboot is needed.
- **Nothing about one installation lives in the repo**: no IP addresses, hostnames, Wi-Fi names,
  dashboard URLs or time zones. Those are settings in `/etc/noticetv/noticetv.conf` on the box.
  OS defaults are defined once, in `os/rootfs/usr/local/lib/noticetv/lib.sh`; the example file
  documents them. Dashboard defaults live in `app/shared/dashboard.ts`.
- **Names**: every unit and config file this layer adds carries the `noticetv-` prefix, so
  `ls /etc/systemd/system/noticetv-*` lists all of it. A file `os/install.sh` generates says so in
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
