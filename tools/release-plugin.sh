#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
metadata="$repo_root/VizhiPlugin/src/package/metadata/LoupedeckPackage.yaml"
version="$(sed -nE 's/^version:[[:space:]]*([0-9]+(\.[0-9]+){2})[[:space:]]*$/\1/p' "$metadata")"
bin_directory="$repo_root/VizhiPlugin/bin"
release_directory="$repo_root/release/v$version"
package_name="Vizhi_$version.lplug4"
package_path="$bin_directory/$package_name"

if [[ -z "$version" ]]; then
  echo "error: expected a semantic version in $metadata" >&2
  exit 1
fi

"$repo_root/tools/package-plugin.sh"

if [[ ! -f "$package_path" ]]; then
  echo "error: expected package at $package_path" >&2
  exit 1
fi

mkdir -p "$release_directory"
find "$release_directory" -maxdepth 1 -type f -name 'Vizhi_*.lplug4' -delete
cp "$package_path" "$release_directory/$package_name"
(
  cd "$release_directory"
  shasum -a 256 "$package_name" > SHA256SUMS.txt
)

find "$bin_directory" -maxdepth 1 -type f \( -name 'Vizhi_*.lplug4' -o -name 'VizhiPlugin.lplug4' \) ! -name "$package_name" -delete

printf 'Release prepared: %s\n' "$release_directory/$package_name"
printf 'Checksum written: %s\n' "$release_directory/SHA256SUMS.txt"
