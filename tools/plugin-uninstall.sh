#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_tool="${LOGI_PLUGIN_TOOL:-}"
purge=false
cleanup_only=false

for argument in "$@"; do
  case "$argument" in
    --cleanup-only) cleanup_only=true ;;
    --purge) purge=true ;;
    -h|--help)
      cat <<'EOF'
Usage:
  npm run plugin:uninstall [-- --purge]
  npm run plugin:cleanup [-- --purge]

plugin:uninstall also removes the Vizhi Logi plugin through LogiPluginTool.
plugin:cleanup is for after removing the plugin in Logi Options+; it removes
Vizhi's marked Codex hook block, local hook files, offline Voice helper and
model, and temporary runtime state. Saved prompt templates are preserved unless
--purge is supplied.
EOF
      exit 0
      ;;
    *)
      echo "error: unknown option '$argument'. Use --purge or --help." >&2
      exit 2
      ;;
  esac
done

if [[ "$purge" == true ]]; then
  node "$repo_root/dist/cli.js" uninstall-codex-hooks --purge
else
  node "$repo_root/dist/cli.js" uninstall-codex-hooks
fi

if [[ "$(uname -s)" == "Darwin" && -x /usr/bin/tccutil ]]; then
  if /usr/bin/tccutil reset Microphone com.rshankar.vizhi.voicehelper; then
    echo "Reset the Vizhi Voice Helper microphone permission."
  else
    echo "warning: could not reset the Vizhi Voice Helper microphone permission." >&2
  fi
fi

cat <<'EOF'
Shared LogiPluginService permissions were intentionally left unchanged. They
belong to Logi's host service, not just Vizhi, and may be used by other Logi
plugins. If you no longer use any such actions, disable LogiPluginService in
Accessibility, Automation, and Screen & System Audio Recording manually.
EOF

if [[ "$cleanup_only" == true ]]; then
  exit 0
fi

if [[ -z "$plugin_tool" && -x "$HOME/.dotnet/tools/logiplugintool" ]]; then
  plugin_tool="$HOME/.dotnet/tools/logiplugintool"
fi

if [[ -z "$plugin_tool" ]]; then
  plugin_tool="$(command -v logiplugintool || true)"
fi

if [[ -z "$plugin_tool" ]]; then
  echo "warning: logiplugintool was not found; remove Vizhi from Logi Options+ manually." >&2
  exit 0
fi

if "$plugin_tool" uninstall Vizhi; then
  echo "Uninstalled the Vizhi Logi plugin. Restart Codex and reopen Logi Options+ if either is running."
else
  echo "warning: LogiPluginTool could not remove Vizhi. Remove it from Logi Options+ manually if it is still installed." >&2
fi
