#!/usr/bin/env bash
set -Eeuo pipefail

(( $# == 1 )) || { printf 'Usage : bash scripts/package-release.sh dossier-sortie\n' >&2; exit 1; }
output=$(realpath -m -- "$1")
[[ "$output" != "$(git rev-parse --show-toplevel)" ]] || { printf 'Choisir un dossier de sortie distinct du dépôt.\n' >&2; exit 1; }
version=$(git show HEAD:package.json | node -p 'JSON.parse(require("node:fs").readFileSync(0, "utf8")).version')
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { printf 'Version stable requise.\n' >&2; exit 1; }
mkdir -p -- "$output"
archive="apt-viewer-$version.tar.gz"
git archive --format=tar --prefix=apt-viewer/ HEAD | gzip -n > "$output/$archive"
git show HEAD:install.sh > "$output/install.sh"
git show HEAD:update.sh > "$output/update.sh"
(
  cd -- "$output"
  sha256sum "$archive" install.sh update.sh > SHA256SUMS
  sha256sum --check --strict SHA256SUMS
)
