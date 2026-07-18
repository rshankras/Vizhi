#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dotnet_bin="${DOTNET_BIN:-}"

if [[ -z "$dotnet_bin" && -x /opt/homebrew/opt/dotnet/bin/dotnet ]]; then
  dotnet_bin=/opt/homebrew/opt/dotnet/bin/dotnet
fi

if [[ -z "$dotnet_bin" ]]; then
  dotnet_bin="$(command -v dotnet || true)"
fi

if [[ -z "$dotnet_bin" ]]; then
  echo "error: .NET SDK not found. Set DOTNET_BIN to the SDK used by Logi Plugin Service." >&2
  exit 1
fi

bash "$repo_root/tools/voice/build.sh" --package-only
node "$repo_root/tools/generate-default-profile.mjs" "$repo_root/VizhiPlugin/src/package"

exec "$dotnet_bin" build "$repo_root/VizhiPlugin/VizhiPlugin.sln" -c Debug "$@"
