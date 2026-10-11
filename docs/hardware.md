# Hardware

## Boxes NoticeTV OS has run on

### Intel Celeron N4500 fanless mini PC

| Part | |
|---|---|
| CPU | Celeron N4500 (Jasper Lake, 2 cores, Gen11 graphics) |
| Memory / disk | 8 GB / Netac 256 GB SATA SSD |
| Wi-Fi | Realtek RTL8821CE (`rtw88_8821ce`) — see the freeze below |
| Display | 4K TV over HDMI at 3840×2160 60 Hz |
| Cooling | none (fan disconnected), `POWER_PROFILE=fanless` |

Settings that box uses: `POWER_PROFILE=fanless`, `VIDEO_MODE=HDMI-A-1:3840x2160@60`,
`DISPLAY_SCALE=2`.

- **Thermals with the fanless profile** (turbo off, 6 W sustained / 10 W burst): about 71 °C
  flat under a 5-minute all-core stress test on a desk, and 71–75 °C idling on the wall at
  about 3.9 W. It has also run at around 85 °C for weeks at a time on the wall: the cap bounds
  the processor's power, not the heat around the box.
- **The UEFI framebuffer is already 4K**, so the boot splash draws at full resolution from the
  first second.
- **Hardware watchdog**: Intel iTCO (`iTCO_wdt`, version 6), armed by systemd at boot. A forced
  freeze has not been run on this board yet, so the reboot itself is untested.
- **BIOS**: set *Restore on AC Power Loss* to *Power On*, so the box comes back after a power cut,
  and disable the fan-failure warning on a box without a fan.

## Known issues

### Realtek RTL8821CE Wi-Fi freezes the whole machine

**Symptom**: the screen freezes on its last frame, the box drops off the network, and it ignores
the power button until held down. Nothing is logged, because the processor stops; the status
bar's last frame showed the Wi-Fi address as gone.

**Cause**: the card's PCIe link power saving (ASPM) together with the firmware's deep power-save
state can stall the PCIe bus, and the processor with it. Reported upstream in March 2026:
["[BUG] wifi: rtw88: Hard system freeze on RTL8821CE when power_save is enabled (LPS/ASPM
conflict)"](https://lkml.iu.edu/hypermail/linux/kernel/2603.1/02883.html), where turning ASPM off
alone was enough.

**Fix**: `os/rootfs/etc/modprobe.d/noticetv-rtw88.conf` sets `disable_aspm=y` and
`disable_lps_deep=y`; the watchdog reboots the box if it freezes anyway. The lasting fix is a
better-supported card: an Intel AX210 fits the same M.2 slot.
