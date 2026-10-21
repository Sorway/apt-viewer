#!/usr/bin/env bash
set -Eeuo pipefail

url=''
output=''
args=("$@")
while (( $# )); do
  case "$1" in
    --output | -o) output="$2"; shift ;;
    https://github.com/Sorway/apt-viewer/releases/*) url="$1" ;;
  esac
  shift
done
if [[ -z "$url" ]]; then exec /usr/bin/curl "${args[@]}"; fi
root="${APT_VIEWER_FIXTURE_DIR:?Release fixture directory missing}"
if [[ "$url" == https://github.com/Sorway/apt-viewer/releases/latest ]]; then
  tag=$(cat -- "$root/latest")
  printf 'https://github.com/Sorway/apt-viewer/releases/tag/%s' "$tag"
elif [[ "$url" == https://github.com/Sorway/apt-viewer/releases/download/* ]]; then
  relative="${url#https://github.com/Sorway/apt-viewer/releases/download/}"
  [[ "$relative" != *..* && -n "$output" && -f "$root/versions/$relative" ]] || exit 22
  cp -- "$root/versions/$relative" "$output"
else
  printf 'Unexpected GitHub request in release fixture: %s\n' "$url" >&2
  exit 22
fi
