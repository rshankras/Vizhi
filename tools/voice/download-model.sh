#!/bin/bash
set -euo pipefail

MODEL_DIR="$HOME/.vizhi/voice/models"
MODEL="$MODEL_DIR/ggml-base.en.bin"
mkdir -p "$MODEL_DIR"
curl --fail --location --continue-at - --output "$MODEL" \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
echo "Whisper model installed to $MODEL"
