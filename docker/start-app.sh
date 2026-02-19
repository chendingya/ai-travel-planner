#!/bin/sh
set -eu

MODEL_PATH="${TTS_PIPER_MODEL:-/app/runtime/piper/model.onnx}"
CONFIG_PATH="${TTS_PIPER_CONFIG:-/app/runtime/piper/model.onnx.json}"
MODEL_URL="${TTS_PIPER_MODEL_URL:-}"
CONFIG_URL="${TTS_PIPER_CONFIG_URL:-}"

mkdir -p /app/runtime/audio
mkdir -p "$(dirname "$MODEL_PATH")"

if [ "${TTS_PROVIDER:-}" = "piper" ]; then
  if [ ! -f "$MODEL_PATH" ]; then
    if [ -n "$MODEL_URL" ]; then
      echo "Downloading Piper model to $MODEL_PATH"
      curl -fsSL "$MODEL_URL" -o "$MODEL_PATH"
    else
      echo "WARN: piper model not found at $MODEL_PATH and TTS_PIPER_MODEL_URL is empty" >&2
    fi
  fi

  if [ -n "$CONFIG_URL" ] && [ ! -f "$CONFIG_PATH" ]; then
    echo "Downloading Piper model config to $CONFIG_PATH"
    curl -fsSL "$CONFIG_URL" -o "$CONFIG_PATH"
  fi
fi

exec node src/index.js
