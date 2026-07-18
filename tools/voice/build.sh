#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/tools/voice/VizhiVoiceHelper.app"
PACKAGE="$ROOT/VizhiPlugin/src/package/voice/VizhiVoiceHelper.app"
RUNTIME="$HOME/.vizhi/voice/VizhiVoiceHelper.app"
MODE="${1:-install}"

if [[ "$MODE" != "install" && "$MODE" != "--package-only" ]]; then
  echo "usage: $0 [--package-only]" >&2
  exit 2
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$ROOT/tools/voice/Info.plist" "$APP/Contents/Info.plist"
swiftc -O "$ROOT/tools/voice/VizhiVoiceHelper.swift" -o "$APP/Contents/MacOS/VizhiVoiceHelper" \
  -framework Foundation -framework AVFoundation -framework AppKit
codesign --force --sign - --identifier com.rshankar.vizhi.voicehelper "$APP"
codesign --verify --deep --strict "$APP"

rm -rf "$PACKAGE"
mkdir -p "$(dirname "$PACKAGE")"
ditto "$APP" "$PACKAGE"
echo "Vizhi voice helper bundled at $PACKAGE"

if [[ "$MODE" == "--package-only" ]]; then
  exit 0
fi

mkdir -p "$(dirname "$RUNTIME")"
rm -rf "$RUNTIME"
ditto "$APP" "$RUNTIME"
echo "Vizhi voice helper installed to $RUNTIME"
