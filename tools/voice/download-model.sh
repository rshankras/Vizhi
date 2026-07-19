#!/bin/bash
set -euo pipefail
umask 077

MODEL_DIR="$HOME/.vizhi/voice/models"
MODEL="$MODEL_DIR/ggml-base.en.bin"
MODEL_SHA256="a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002"
/bin/mkdir -p "$MODEL_DIR"
/bin/chmod 700 "$MODEL_DIR"
DOWNLOAD="$(/usr/bin/mktemp "$MODEL_DIR/.ggml-base.en.XXXXXX.download")"
cleanup() {
  /bin/rm -f -- "$DOWNLOAD"
}
trap cleanup ERR INT TERM
/usr/bin/curl --fail --location --proto =https --proto-redir =https --retry 2 --connect-timeout 30 --output "$DOWNLOAD" \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
ACTUAL_SHA256="$(/usr/bin/shasum -a 256 "$DOWNLOAD" | /usr/bin/awk '{print $1}')"
if [[ "$ACTUAL_SHA256" != "$MODEL_SHA256" ]]; then
  echo "Whisper model integrity verification failed." >&2
  exit 1
fi
/bin/chmod 600 "$DOWNLOAD"
/bin/mv -f "$DOWNLOAD" "$MODEL"
/bin/chmod 600 "$MODEL"
trap - ERR INT TERM
echo "Whisper model installed to $MODEL"
