#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
metadata="$repo_root/VizhiPlugin/src/package/metadata/LoupedeckPackage.yaml"
version="$(sed -nE 's/^version:[[:space:]]*([0-9]+(\.[0-9]+){2})[[:space:]]*$/\1/p' "$metadata")"
plugin_tool="${LOGI_PLUGIN_TOOL:-}"

if [[ -z "$version" ]]; then
  echo "error: expected a semantic version in $metadata" >&2
  exit 1
fi

if [[ -z "$plugin_tool" && -x "$HOME/.dotnet/tools/logiplugintool" ]]; then
  plugin_tool="$HOME/.dotnet/tools/logiplugintool"
fi

if [[ -z "$plugin_tool" ]]; then
  plugin_tool="$(command -v logiplugintool || true)"
fi

if [[ -z "$plugin_tool" ]]; then
  echo "error: logiplugintool not found. Install the Logi Actions SDK tooling first." >&2
  exit 1
fi

"$repo_root/tools/plugin-build.sh"

package_root="$repo_root/VizhiPlugin/bin/Debug"
package_path="$repo_root/VizhiPlugin/bin/Vizhi_${version}.lplug4"

"$plugin_tool" pack "$package_root" "$package_path"
"$plugin_tool" verify "$package_path"

printf 'Package verified: %s\n' "$package_path"
