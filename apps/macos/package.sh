#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
swift build
BIN_DIR=$(swift build --show-bin-path)
APP="$PWD/dist/Chippi.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/Chippi" "$APP/Contents/MacOS/Chippi"
cp Info.plist "$APP/Contents/Info.plist"
ICONSET="$PWD/.build/Chippi.iconset"
mkdir -p "$ICONSET"
for SIZE in 16 32 128 256 512; do
    sips -z "$SIZE" "$SIZE" ../../public/favicon.png --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
    DOUBLE=$((SIZE * 2))
    sips -z "$DOUBLE" "$DOUBLE" ../../public/favicon.png --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Chippi.icns"
# Local ad-hoc signature. Customer distribution requires Developer ID + notarization.
codesign --force --sign - "$APP"
codesign --verify --strict "$APP"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$PWD/dist/Chippi-macOS.zip"
echo "$APP"
