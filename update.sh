#!/usr/bin/env bash
set -Eeuo pipefail

readonly app_dir=/opt/apt-viewer
readonly config_file=/etc/apt-viewer.env

fail() {
  printf 'Erreur : %s\n' "$*" >&2
  exit 1
}

ref=''
allow_downgrade=false
force=false
while (( $# )); do
  case "$1" in
    --help | -h)
      printf 'Usage : sudo bash update.sh [--allow-downgrade] [--force] [version]\n\nSans version : dernière release stable.\n--allow-downgrade : autoriser une version antérieure.\n--force : réinstaller une version identique.\nLes archives doivent être accompagnées de SHA256SUMS dans la release.\n'
      exit 0 ;;
    --allow-downgrade) allow_downgrade=true ;;
    --force) force=true ;;
    --*) fail "Option inconnue : $1" ;;
    *) [[ -z "$ref" ]] || fail 'Une seule version est acceptée.'; ref="$1" ;;
  esac
  shift
done
(( EUID == 0 )) || fail 'Lancer avec sudo bash update.sh.'
[[ "$(uname -s)" == Linux ]] || fail 'Ce script nécessite Linux.'
[[ -d /run/systemd/system ]] || fail 'systemd doit être actif sur cette machine.'
[[ -f "$app_dir/src/server.js" && -f "$config_file" ]] || fail 'Installation introuvable. Lancer install.sh en premier.'
for command in curl tar sha256sum awk; do
  command -v "$command" >/dev/null || fail "Commande requise : $command."
done

ref="${ref:-${APT_VIEWER_REF:-latest}}"
if [[ "$ref" == latest ]]; then
  release_url=$(curl --fail --silent --show-error --location --head \
    --connect-timeout 10 --max-time 30 --output /dev/null --write-out '%{url_effective}' \
    https://github.com/Sorway/apt-viewer/releases/latest) || fail 'Dernière release stable introuvable sur GitHub.'
  ref="${release_url#https://github.com/Sorway/apt-viewer/releases/tag/}"
fi
[[ ${#ref} -le 100 && "$ref" =~ ^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail 'Le tag de release doit être au format vX.Y.Z ou X.Y.Z.'
readonly ref
readonly target_version="${ref#v}"
readonly node="$app_dir/runtime/bin/node"
[[ -x "$node" ]] || fail "Runtime Node.js introuvable dans l’installation."
version_info=$("$node" - "$app_dir/package.json" "$target_version" <<'NODE'
const { readFileSync } = require('node:fs');
const pkg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const current = pkg.version;
const match = typeof current === 'string' && current.length <= 100 && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(current);
if (pkg.name !== 'apt-viewer' || !match) process.exit(1);
const target = process.argv[3].split('.').map(BigInt);
const installed = match.slice(1, 4).map(BigInt);
let order = 0;
for (let i = 0; i < 3; i++) {
  if (target[i] !== installed[i]) { order = target[i] > installed[i] ? 1 : -1; break; }
}
if (order === 0 && match[4]) order = 1;
console.log(`${current}|${order}`);
NODE
) || fail 'Version installée invalide.'
IFS='|' read -r current_version version_order <<< "$version_info"
printf 'Version installée : %s → %s\n' "$current_version" "$target_version"
if [[ "$version_order" == 0 && "$force" != true ]]; then
  printf 'Déjà à jour.\n'
  exit 0
fi
if [[ "$version_order" == -1 && "$allow_downgrade" != true ]]; then
  fail 'Version antérieure : utiliser --allow-downgrade pour confirmer.'
fi

work_dir=$(mktemp -d)
trap 'rm -rf -- "$work_dir"' EXIT

download() {
  curl --fail --silent --show-error --location --retry 3 \
    --connect-timeout 10 --max-time 180 "$1" --output "$2"
}
readonly archive="apt-viewer-$target_version.tar.gz"
readonly release_base="https://github.com/Sorway/apt-viewer/releases/download/$ref"
printf 'Téléchargement de la version %s…\n' "$ref"
download "$release_base/SHA256SUMS" "$work_dir/SHA256SUMS"
download "$release_base/$archive" "$work_dir/$archive"
expected=$(awk -v name="$archive" '$2 == name && length($1) == 64 && $1 ~ /^[[:xdigit:]]+$/ { print $1 }' "$work_dir/SHA256SUMS")
[[ "$expected" =~ ^[[:xdigit:]]{64}$ ]] || fail 'Empreinte SHA-256 absente ou ambiguë.'
(
  cd -- "$work_dir"
  printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --status
) || fail 'Archive invalide : vérification SHA-256 échouée.'
mkdir -- "$work_dir/source"
tar -xzf "$work_dir/$archive" --strip-components=1 -C "$work_dir/source"

readonly source_dir="$work_dir/source"
for file in install.sh package.json package-lock.json src/server.js deploy/apt-viewer.service; do
  [[ -f "$source_dir/$file" ]] || fail "Archive incomplète : $file manquant."
done
if ! "$node" - "$source_dir/package.json" "$target_version" <<'NODE'
const { readFileSync } = require('node:fs');
const pkg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (pkg.name !== 'apt-viewer' || pkg.version !== process.argv[3]) process.exit(1);
NODE
then
  fail "La version de l’archive ne correspond pas au tag."
fi

printf "Mise à jour d’apt-viewer…\n"
bash "$source_dir/install.sh"
printf '\nMise à jour terminée.\n'
