#!/bin/sh
set -eu

MODEL_PATH="${TTS_PIPER_MODEL:-/app/runtime/piper/model.onnx}"
CONFIG_PATH="${TTS_PIPER_CONFIG:-/app/runtime/piper/model.onnx.json}"
MODEL_URL="${TTS_PIPER_MODEL_URL:-}"
CONFIG_URL="${TTS_PIPER_CONFIG_URL:-}"
DOWNLOAD_RETRIES="${TTS_PIPER_DOWNLOAD_RETRIES:-3}"
DOWNLOAD_CONNECT_TIMEOUT="${TTS_PIPER_CONNECT_TIMEOUT:-20}"
DOWNLOAD_MAX_TIME="${TTS_PIPER_MAX_TIME:-180}"
MIRROR_HOST="${TTS_PIPER_MIRROR_HOST:-hf-mirror.com}"

download_with_fallback() {
  url="$1"
  out="$2"
  label="$3"
  if curl -fSL --retry "$DOWNLOAD_RETRIES" --connect-timeout "$DOWNLOAD_CONNECT_TIMEOUT" --max-time "$DOWNLOAD_MAX_TIME" "$url" -o "$out"; then
    return 0
  fi

  case "$url" in
    https://huggingface.co/*)
      mirror_url="https://${MIRROR_HOST}/${url#https://huggingface.co/}"
      echo "Retrying ${label} download via mirror: ${mirror_url}"
      curl -fSL --retry "$DOWNLOAD_RETRIES" --connect-timeout "$DOWNLOAD_CONNECT_TIMEOUT" --max-time "$DOWNLOAD_MAX_TIME" "$mirror_url" -o "$out"
      return $?
      ;;
    http://huggingface.co/*)
      mirror_url="https://${MIRROR_HOST}/${url#http://huggingface.co/}"
      echo "Retrying ${label} download via mirror: ${mirror_url}"
      curl -fSL --retry "$DOWNLOAD_RETRIES" --connect-timeout "$DOWNLOAD_CONNECT_TIMEOUT" --max-time "$DOWNLOAD_MAX_TIME" "$mirror_url" -o "$out"
      return $?
      ;;
    *)
      return 1
      ;;
  esac
}

mkdir -p /app/runtime/audio
mkdir -p "$(dirname "$MODEL_PATH")"

if [ "${TTS_PROVIDER:-}" = "piper" ]; then
  if [ ! -f "$MODEL_PATH" ]; then
    if [ -n "$MODEL_URL" ]; then
      echo "Downloading Piper model to $MODEL_PATH"
      if ! download_with_fallback "$MODEL_URL" "$MODEL_PATH" "model"; then
        echo "WARN: failed to download Piper model from $MODEL_URL" >&2
      fi
    else
      echo "WARN: piper model not found at $MODEL_PATH and TTS_PIPER_MODEL_URL is empty" >&2
    fi
  fi

  if [ -n "$CONFIG_URL" ] && [ ! -f "$CONFIG_PATH" ]; then
    echo "Downloading Piper model config to $CONFIG_PATH"
    if ! download_with_fallback "$CONFIG_URL" "$CONFIG_PATH" "config"; then
      echo "WARN: failed to download Piper model config from $CONFIG_URL" >&2
    fi
  fi

  if [ ! -f "$MODEL_PATH" ]; then
    echo "WARN: Piper model is missing; app will start but TTS requests will fail until model is available." >&2
  fi
fi

exec node src/index.js
