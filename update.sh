#!/usr/bin/env bash
set -Eeuo pipefail

readonly app_dir=/opt/apt-viewer
readonly config_file=/etc/apt-viewer.env

fail() {
  printf 'Erreur : %s\n' "$*" >&2
  exit 1
}

if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  printf 'Usage : sudo bash update.sh [référence]\n\nMet à jour apt-viewer depuis GitHub.\nRéférence : branche, tag ou commit ; master par défaut.\nLa configuration existante est conservée.\n'
  exit 0
fi
(( $# <= 1 )) || fail 'Une seule référence Git est acceptée.'
(( EUID == 0 )) || fail 'Lancer avec sudo bash update.sh.'
[[ "$(uname -s)" == Linux ]] || fail 'Ce script nécessite Linux.'
[[ -d /run/systemd/system ]] || fail 'systemd doit être actif sur cette machine.'
[[ -f "$app_dir/src/server.js" && -f "$config_file" ]] || fail 'Installation introuvable. Lancer install.sh en premier.'
for command in curl tar; do
  command -v "$command" >/dev/null || fail "Commande requise : $command."
done

readonly ref="${1:-${APT_VIEWER_REF:-master}}"
[[ "$ref" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$ ]] || fail 'Référence Git invalide.'

work_dir=$(mktemp -d)
trap 'rm -rf -- "$work_dir"' EXIT

printf 'Téléchargement de la version %s…\n' "$ref"
curl --fail --silent --show-error --location --retry 3 \
  --connect-timeout 10 --max-time 180 \
  "https://codeload.github.com/Sorway/apt-viewer/tar.gz/$ref" \
  --output "$work_dir/source.tar.gz"
mkdir -- "$work_dir/source"
tar -xzf "$work_dir/source.tar.gz" --strip-components=1 -C "$work_dir/source"

readonly source_dir="$work_dir/source"
for file in install.sh package.json package-lock.json src/server.js deploy/apt-viewer.service; do
  [[ -f "$source_dir/$file" ]] || fail "Archive incomplète : $file manquant."
done

printf "Mise à jour d’apt-viewer…\n"
bash "$source_dir/install.sh"
printf '\nMise à jour terminée.\n'
