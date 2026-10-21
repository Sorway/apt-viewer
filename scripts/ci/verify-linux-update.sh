#!/usr/bin/env bash
set -Eeuo pipefail

fixture="${1:?Usage: bash scripts/ci/verify-linux-update.sh fixture}"
tag=$(cat -- "$fixture/latest")
update() {
  sudo env PATH="$fixture/bin:$PATH" APT_VIEWER_FIXTURE_DIR="$fixture" \
    bash /opt/apt-viewer/update.sh "$@"
}
health() {
  /usr/bin/curl --fail --silent http://127.0.0.1:3100/healthz
  sudo cmp /etc/apt-viewer.env /tmp/apt-viewer.env.expected
  systemctl is-active --quiet apt-viewer.service
}
health
update
health
installed=$(/opt/apt-viewer/runtime/bin/node -p 'require("/opt/apt-viewer/package.json").version')
[[ "$installed" == "${tag#v}" ]]
pid=$(systemctl show -p MainPID --value apt-viewer.service)
update
[[ "$pid" == "$(systemctl show -p MainPID --value apt-viewer.service)" ]]
if update v0.0.0; then
  printf 'A downgrade without --allow-downgrade was accepted.\n' >&2
  exit 1
fi
[[ "$pid" == "$(systemctl show -p MainPID --value apt-viewer.service)" ]]

manifest="$fixture/versions/$tag/SHA256SUMS"
cp -- "$manifest" "$fixture/manifest.original"
printf '%064d  apt-viewer-%s.tar.gz\n' 0 "${tag#v}" > "$manifest"
if update --force; then
  printf 'An archive with a wrong checksum was accepted.\n' >&2
  exit 1
fi
cp -- "$fixture/manifest.original" "$manifest"
[[ "$pid" == "$(systemctl show -p MainPID --value apt-viewer.service)" ]]
health

update --allow-downgrade v0.0.0
[[ "$(/opt/apt-viewer/runtime/bin/node -p 'require("/opt/apt-viewer/package.json").version')" == 0.0.0 ]]
health
printf '\nPASS: latest upgrade, identical-version no-op, downgrade guard, SHA-256 rejection and explicit downgrade.\n'
