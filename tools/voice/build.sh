#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/tools/voice/VizhiVoiceHelper.app"
RUNTIME="$HOME/.vizhi/voice/VizhiVoiceHelper.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$ROOT/tools/voice/Info.plist" "$APP/Contents/Info.plist"
swiftc -O "$ROOT/tools/voice/VizhiVoiceHelper.swift" -o "$APP/Contents/MacOS/VizhiVoiceHelper" \
  -framework Foundation -framework AVFoundation -framework AppKit
codesign --force --sign - --identifier com.rshankar.vizhi.voicehelper "$APP"

mkdir -p "$(dirname "$RUNTIME")"
rm -rf "$RUNTIME"
ditto "$APP" "$RUNTIME"
echo "Vizhi voice helper installed to $RUNTIME"
