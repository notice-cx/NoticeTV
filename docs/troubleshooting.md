# Troubleshooting

All commands run on the box as root (`ssh root@<the box>`).

## How has the box been doing?

The health log has one line per minute: processor and board temperature, package power, clock
speed, load, free memory, IP address and Wi-Fi signal.

```sh
journalctl -t noticetv-health --since "-2h"
```

## Why did it reboot, or what happened before it froze?

Logs survive reboots. List the boots, then read the end of the previous one:

```sh
journalctl --list-boots
journalctl -b -1 -e
journalctl -b -1 -t noticetv-health | tail   # its last minutes
```

A boot that ends mid-sentence, with no shutdown messages, ended in a freeze or a power cut. With
the watchdog armed (`wdctl` shows the timeout), a freeze reboots the box within about a minute.

## What is on the screen right now?

```sh
DISPLAY=:0 XAUTHORITY=/root/.Xauthority scrot -o /tmp/screen.png
```

Then from your computer: `ssh root@<the box> cat /tmp/screen.png > screen.png`.

## The kiosk is stuck or shows an old page

Restart the kiosk session (X and Chromium), the same thing the nightly 04:00 restart does:

```sh
systemctl restart getty@tty1
```

## Seeing the boot messages behind the splash

Press **Esc** on a keyboard plugged into the box while the NoticeTV logo is up. If the kiosk never
starts, the splash steps aside by itself after 2 minutes and leaves the text console on screen.

## The status bar is missing

It starts a few seconds after Chromium and is raised above it every 30 seconds, so give it a
minute after a boot or kiosk restart. Otherwise: `systemctl status noticetv-statusbar`, and check
`STATUSBAR=yes` in `/etc/noticetv/noticetv.conf`.
