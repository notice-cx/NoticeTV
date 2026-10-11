# NoticeTV

![The NoticeTV boot screen](brand/preview.png)

NoticeTV turns a small x86 mini PC and a TV into a wall display for any web dashboard. It boots
straight into your dashboard in a full-screen browser and is built to run unattended, around the
clock.

**NoticeTV OS** is a layer on top of [DietPi](https://dietpi.com), a lightweight Debian.

## What it does

- **Boots straight to your dashboard.** Chromium in kiosk mode, scaled for the TV, behind the
  NoticeTV boot screen, with no console text on the way.
- **Recovers on its own.** A hardware watchdog reboots the box if it ever locks up, the kernel
  reboots itself after a crash, Wi-Fi reconnects after a real outage (and only then), and the
  kiosk restarts every night at 04:00.
- **Leaves evidence.** Logs stay on disk, with one line of health every minute (temperature,
  power, network), so a freeze can be diagnosed after the fact.
- **Stays patched.** Debian security updates install unattended and reboot at 04:30 when one
  needs it.
- **Runs fanless.** An optional power profile caps the processor's power so a passively cooled
  box holds a steady temperature under load.
- **Shows its vitals.** A status bar in the corner, under the NoticeTV mark: network,
  temperature, power, load, memory, disk and uptime.

Status: early. NoticeTV OS runs the maintainer's wall display; scan-to-set-up (a QR code on the
screen that opens a settings page on your phone) is in development.

## Install

You need an x86_64 mini PC with [DietPi](https://dietpi.com/#download) installed, on your
network, with SSH enabled. [docs/hardware.md](docs/hardware.md) lists the boxes it has run on.

From a computer with this repository:

```sh
scripts/install-over-ssh.sh root@<the box's IP address>
ssh root@<the box's IP address> reboot
```

Then choose what the screen shows: set `DASHBOARD_URL` in `/etc/noticetv/noticetv.conf` on the
box and run the installer again. Every setting, with its default, is in
[os/noticetv.conf.example](os/noticetv.conf.example).

The installer is safe to run again at any time, for example after pulling a newer version.

## When something goes wrong

[docs/troubleshooting.md](docs/troubleshooting.md): reading the health log, finding out why the
box rebooted, seeing the boot messages behind the splash.

## License

NoticeTV is licensed under the [GNU AGPL v3](LICENSE). The Stack Sans Notch font in
`brand/fonts` is licensed under the SIL Open Font License 1.1, and the
[Lucide](https://lucide.dev) icons in `brand/icons` under the ISC License.
