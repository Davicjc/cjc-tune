#!/bin/bash
# Build CJC Tune and run the audio-routing suite in a throwaway container.
# Usage: tests/audio-routing/run-in-docker.sh [pw|pa]
# Needs the frontend built first (npm ci && npm run build).
set -euo pipefail
MODE="${1:-pw}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER=$([ "$MODE" = "pa" ] && echo pulseaudio || echo pipewire)
[ -f "$ROOT/dist/index.html" ] || { echo "Build the frontend first: npm ci && npm run build" >&2; exit 1; }

docker build --build-arg SERVER="$SERVER" -t "cjctune-routing-$MODE" "$ROOT/tests/audio-routing"
docker volume create cjctune-routing-cargo >/dev/null
docker volume create "cjctune-routing-target-$MODE" >/dev/null
docker run --rm -u root -v cjctune-routing-cargo:/c -v "cjctune-routing-target-$MODE":/t \
    "cjctune-routing-$MODE" chown -R tester:tester /c /t
docker run --rm -v "$ROOT":/src \
    -v cjctune-routing-cargo:/home/tester/.cargo/registry \
    -v "cjctune-routing-target-$MODE":/home/tester/target \
    -e CARGO_TARGET_DIR=/home/tester/target \
    -e APP_BIN=/home/tester/target/debug/cjc-tune \
    "cjctune-routing-$MODE" bash -c \
    "cd /src/src-tauri && cargo build --features tauri/custom-protocol && /src/tests/audio-routing/verify.sh $MODE"
