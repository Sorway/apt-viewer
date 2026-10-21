#!/usr/bin/env bash
set -Eeuo pipefail

readonly app_dir=/opt/apt-viewer
readonly config_file=/etc/apt-viewer.env
readonly unit_file=/etc/systemd/system/apt-viewer.service
readonly account=apt-viewer

work_dir=''
stage_dir=''
backup_dir=''
deployed=false
unit_changed=false
service_stopped=false
was_active=false
was_enabled=false

fail() {
  printf 'Erreur : %s\n' "$*" >&2
  exit 1
}

download() {
  curl --fail --silent --show-error --location --retry 3 \
    --connect-timeout 10 --max-time 180 "$1" --output "$2"
}

cleanup() {
  local status=$?
  local failed_dir
  trap - EXIT
  set +e

  if (( status != 0 )) && { [[ "$deployed" == true || "$unit_changed" == true || "$service_stopped" == true ]] || [[ -n "$backup_dir" ]]; }; then
    systemctl stop apt-viewer.service
    if [[ "$deployed" == true ]]; then
      if failed_dir=$(mktemp -d /opt/apt-viewer.failed.XXXXXX); then
        mv -- "$app_dir" "$failed_dir/app"
        printf 'Installation incomplète conservée dans %s\n' "$failed_dir" >&2
      fi
    fi
    if [[ -n "$backup_dir" && ( -e "$backup_dir" || -L "$backup_dir" ) ]]; then
      if mv -T -- "$backup_dir" "$app_dir"; then
        printf 'Version précédente restaurée.\n' >&2
      fi
    fi
    if [[ "$unit_changed" == true ]]; then
      if [[ "$was_enabled" != true ]]; then systemctl disable apt-viewer.service; fi
      if [[ -f "$work_dir/service.previous" ]]; then
        install -o root -g root -m 0644 "$work_dir/service.previous" "$unit_file"
      else
        rm -f -- "$unit_file"
      fi
    fi
    systemctl daemon-reload
    if [[ "$was_enabled" == true ]]; then
      systemctl enable apt-viewer.service
    fi
    if [[ "$was_active" == true ]]; then
      systemctl start apt-viewer.service
    fi
  fi

  if [[ -n "$stage_dir" && -d "$stage_dir" ]]; then rm -rf -- "$stage_dir"; fi
  if [[ -n "$work_dir" && -d "$work_dir" ]]; then rm -rf -- "$work_dir"; fi
  exit "$status"
}

if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  printf 'Usage : sudo bash install.sh\n\nInstalle apt-viewer sur Debian ou Ubuntu avec systemd.\nConfiguration conservée dans /etc/apt-viewer.env.\n'
  exit 0
fi
(( $# == 0 )) || fail 'Option inconnue. Utiliser --help.'
(( EUID == 0 )) || fail 'Lancer avec sudo bash install.sh.'
[[ "$(uname -s)" == Linux ]] || fail 'Ce script nécessite Linux.'
command -v apt-get >/dev/null || fail 'Debian ou Ubuntu requis.'
[[ -d /run/systemd/system ]] || fail 'systemd doit être actif sur cette machine.'

case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64 | arm64) node_arch=arm64 ;;
  *) fail 'Architectures prises en charge : x86_64 et arm64.' ;;
esac

trap cleanup EXIT
if systemctl is-active --quiet apt-viewer.service; then was_active=true; fi
if systemctl is-enabled --quiet apt-viewer.service; then was_enabled=true; fi

printf 'Installation des dépendances système…\n'
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  acl ca-certificates curl tar xz-utils

work_dir=$(mktemp -d)
mkdir -p /opt
stage_dir=$(mktemp -d /opt/.apt-viewer.XXXXXX)
if [[ -f "$unit_file" ]]; then cp -p -- "$unit_file" "$work_dir/service.previous"; fi

source_dir=''
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
fi
if [[ -z "$source_dir" || ! -f "$source_dir/src/server.js" || ! -f "$source_dir/deploy/apt-viewer.service" ]]; then
  printf "Téléchargement d’apt-viewer…\n"
  source_dir="$work_dir/source"
  mkdir -- "$source_dir"
  download "https://codeload.github.com/Sorway/apt-viewer/tar.gz/${APT_VIEWER_REF:-master}" "$work_dir/source.tar.gz"
  tar -xzf "$work_dir/source.tar.gz" --strip-components=1 -C "$source_dir"
fi

cp -- "$source_dir/package.json" "$source_dir/package-lock.json" "$source_dir/LICENSE" "$stage_dir/"
cp -- "$source_dir/deploy/apt-viewer.service" "$work_dir/service.new"
for directory in src views public; do cp -R -- "$source_dir/$directory" "$stage_dir/"; done

printf 'Installation de Node.js 24…\n'
node_dist=https://nodejs.org/dist/latest-v24.x
download "$node_dist/SHASUMS256.txt" "$work_dir/SHASUMS256.txt"
node_archive=$(awk -v arch="$node_arch" '$2 ~ ("^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") { print $2; exit }' "$work_dir/SHASUMS256.txt")
[[ -n "$node_archive" ]] || fail 'Archive Node.js 24 introuvable.'
download "$node_dist/$node_archive" "$work_dir/$node_archive"
(
  cd -- "$work_dir"
  awk -v file="$node_archive" '$2 == file { print }' SHASUMS256.txt | sha256sum --check --status
)
mkdir -- "$stage_dir/runtime"
tar -xJf "$work_dir/$node_archive" --strip-components=1 -C "$stage_dir/runtime"
"$stage_dir/runtime/bin/node" --version
PATH="$stage_dir/runtime/bin:$PATH" "$stage_dir/runtime/bin/npm" ci \
  --prefix "$stage_dir" --omit=dev --ignore-scripts --no-audit --no-fund
chown -R root:root "$stage_dir"
chmod -R a+rX "$stage_dir"

printf 'Configuration du compte et du journal…\n'
if ! getent group "$account" >/dev/null; then groupadd --system "$account"; fi
if ! id -u "$account" >/dev/null 2>&1; then
  useradd --system --gid "$account" --home-dir /nonexistent --no-create-home \
    --shell /usr/sbin/nologin "$account"
fi
if [[ ! -e "$config_file" ]]; then
  install -o root -g "$account" -m 0640 "$source_dir/.env.example" "$config_file"
else
  chown root:"$account" "$config_file"
  chmod 0640 "$config_file"
  printf 'Configuration existante conservée : %s\n' "$config_file"
fi

read_setting() {
  env -u "$1" "$stage_dir/runtime/bin/node" "--env-file=$config_file" \
    -p "process.env['$1'] || '$2'"
}

log_path=$(read_setting LOG_PATH /var/log/apt-cacher-ng/apt-cacher.log)
port=$(read_setting PORT 3000)
host=$(read_setting HOST 127.0.0.1)
[[ "$log_path" == /* && "$log_path" != *$'\n'* ]] || fail 'LOG_PATH doit être un chemin absolu.'
[[ -f "$log_path" ]] || fail "Journal introuvable : $log_path. Modifier LOG_PATH dans $config_file puis relancer."
if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  fail 'PORT invalide.'
fi

directory=$(dirname -- "$log_path")
while [[ "$directory" != / ]]; do
  setfacl -m "u:$account:--x" "$directory"
  directory=$(dirname -- "$directory")
done
setfacl -m "u:$account:r--" "$log_path"
setfacl -m "d:u:$account:r-X" "$(dirname -- "$log_path")"
runuser -u "$account" -- test -r "$log_path" || fail "Le compte $account ne peut pas lire le journal."

case "$host" in
  0.0.0.0) host=127.0.0.1 ;;
  ::) host=::1 ;;
esac
if [[ "$host" == *:* ]]; then host="[$host]"; fi
url="http://$host:$port"

printf 'Installation du service…\n'
if [[ "$was_active" == true ]]; then
  systemctl stop apt-viewer.service
  service_stopped=true
fi
if [[ -e "$app_dir" || -L "$app_dir" ]]; then
  backup_dir=$(mktemp -d /opt/apt-viewer.backup.XXXXXX)
  rmdir -- "$backup_dir"
  mv -T -- "$app_dir" "$backup_dir"
fi
mv -T -- "$stage_dir" "$app_dir"
stage_dir=''
deployed=true
unit_changed=true
install -o root -g root -m 0644 "$work_dir/service.new" "$unit_file"
systemctl daemon-reload
systemctl enable apt-viewer.service
systemctl restart apt-viewer.service

ready=false
for _ in {1..15}; do
  if curl --noproxy '*' --fail --silent --connect-timeout 1 --max-time 2 "$url/healthz" >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  journalctl -u apt-viewer.service -n 30 --no-pager >&2
  fail 'Le service ne répond pas correctement. Restauration de la version précédente.'
fi

printf '\nInstallation terminée.\nInterface : %s\nConfiguration : %s\n' "$url" "$config_file"
if [[ -n "$backup_dir" ]]; then printf 'Version précédente : %s\n' "$backup_dir"; fi
