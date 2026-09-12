#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
CONFIGURATION="${CHIPPI_BUILD_CONFIGURATION:-release}"
SIGNING_IDENTITY="${CHIPPI_SIGNING_IDENTITY:-}"
NOTARY_PROFILE="${CHIPPI_NOTARY_PROFILE:-}"
if [[ "${CHIPPI_REQUIRE_NOTARIZATION:-0}" == "1" && ( -z "$SIGNING_IDENTITY" || -z "$NOTARY_PROFILE" ) ]]; then
    echo "Customer release requires CHIPPI_SIGNING_IDENTITY and CHIPPI_NOTARY_PROFILE." >&2
    exit 1
fi
if [[ -n "$NOTARY_PROFILE" && -z "$SIGNING_IDENTITY" ]]; then
    echo "Notarization requires a Developer ID signing identity." >&2
    exit 1
fi
if [[ -n "$SIGNING_IDENTITY" && "$SIGNING_IDENTITY" != "Developer ID Application:"* ]]; then
    echo "Use a Developer ID Application identity for distribution." >&2
    exit 1
fi
swift build -c "$CONFIGURATION"
BIN_DIR=$(swift build -c "$CONFIGURATION" --show-bin-path)
APP="$PWD/dist/Chippi.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/Chippi" "$APP/Contents/MacOS/Chippi"
cp Info.plist "$APP/Contents/Info.plist"
ICONSET="$PWD/.build/Chippi.iconset"
mkdir -p "$ICONSET"
for SIZE in 16 32 128 256 512; do
    sips -z "$SIZE" "$SIZE" ../../public/brand/chippi-cookie.png --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
    DOUBLE=$((SIZE * 2))
    sips -z "$DOUBLE" "$DOUBLE" ../../public/brand/chippi-cookie.png --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Chippi.icns"
if [[ -n "$SIGNING_IDENTITY" ]]; then
    codesign --force --options runtime --timestamp --entitlements "$PWD/Entitlements.plist" --sign "$SIGNING_IDENTITY" "$APP"
else
    codesign --force --sign - "$APP"
fi
codesign --verify --strict "$APP"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$PWD/dist/Chippi-macOS.zip"
if [[ -n "$NOTARY_PROFILE" ]]; then
    xcrun notarytool submit "$PWD/dist/Chippi-macOS.zip" --keychain-profile "$NOTARY_PROFILE" --wait
    xcrun stapler staple "$APP"
    xcrun stapler validate "$APP"
    spctl --assess --type execute --verbose "$APP"
    # Rebuild the archive with the stapled ticket included.
    /usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$PWD/dist/Chippi-macOS.zip"
    echo "Notarized release: $APP"
else
    echo "Local package only; notarization has not been verified: $APP"
fi
shasum -a 256 "$PWD/dist/Chippi-macOS.zip"
