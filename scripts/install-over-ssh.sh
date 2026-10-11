#!/bin/sh
# Copy the NoticeTV OS layer to a box over SSH and run its installer there.
#   scripts/install-over-ssh.sh <ssh-host>        e.g. root@192.168.1.50
# Streams a tar archive rather than using scp: DietPi's default SSH server (Dropbear) has no SFTP.
set -eu

HOST=${1:?usage: scripts/install-over-ssh.sh <ssh-host>}
cd "$(dirname "$0")/../os"
# macOS tar (bsdtar) would add ._ metadata files and extended-attribute headers that GNU tar on
# the box warns about; COPYFILE_DISABLE and --no-xattrs leave them out.
TAR_FLAGS=""
if tar --version | grep -q bsdtar; then
    TAR_FLAGS=--no-xattrs
fi
# shellcheck disable=SC2086  # TAR_FLAGS is empty or one flag
COPYFILE_DISABLE=1 tar $TAR_FLAGS -cf - . | ssh "$HOST" \
    'rm -rf /opt/noticetv && mkdir -p /opt/noticetv && tar -C /opt/noticetv -xf - --no-same-owner && /opt/noticetv/install.sh'
