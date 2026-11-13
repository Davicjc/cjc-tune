#!/bin/bash
# Put your audio back to normal if CJC Tune could not do it itself.
#
# CJC Tune adds an "CJC Tune" output device while it runs and removes it when it
# quits. If it is killed outright (or crashes), that device can be left as the
# default output with nothing listening to it, so you hear no sound. Starting
# CJC Tune again also cleans this up; this script does it without CJC Tune.
#
# Usage: ./scripts/reset-audio.sh [output-device-name]
#   With no argument, the first output device that is not CJC Tune's is used.

set -euo pipefail

if ! pactl info >/dev/null 2>&1; then
    echo "❌ No PulseAudio/PipeWire server answering (is pactl installed?)"
    exit 1
fi

TARGET="${1:-$(pactl list short sinks | awk '$2 != "cjc_tune_sink" && $2 != "auto_null" {print $2; exit}')}"

# Unload CJC Tune's device, plus any loopback early development builds wired
# into it (scripts/setup-audio.sh in 1.1.x).
MODULES=$(pactl list short modules | awk '/sink_name=cjc_tune_sink/ || (/module-loopback/ && /cjc_tune_sink/) {print $1}')
if [ -z "$MODULES" ]; then
    echo "✓ No CJC Tune device present."
else
    for m in $MODULES; do
        pactl unload-module "$m" && echo "✓ Removed CJC Tune module #$m"
    done
fi

if [ -n "$TARGET" ]; then
    pactl set-default-sink "$TARGET"
    echo "✓ Default output: $TARGET"
else
    echo "⚠️  No other output device found; choose one in your sound settings."
fi
