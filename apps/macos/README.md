# Chippi for Mac

Native SwiftUI application for macOS 14+, displaying the existing Chippi CRM
through WebKit. Requires an internet connection and an existing Chippi account.
It opens https://www.usechippi.com/sign-in; the normal account/brokerage redirect and
tenant permissions remain server-owned. Website updates appear in the Mac app
when deployed; local web changes are not bundled into this application.

## Build and run

Requires the Swift 6 toolchain on macOS. No third-party Swift dependencies.

```sh
cd apps/macos
swift test
./package.sh
open dist/Chippi.app
```

`dist/Chippi.app` and `dist/Chippi-macOS.zip` are local, ad-hoc signed artifacts
for the build machine's architecture. They are not notarized customer releases.
For a local CRM preview, launch the executable directly:

```sh
CHIPPI_APP_URL=http://localhost:3000/sign-in dist/Chippi.app/Contents/MacOS/Chippi
```

The app retains WebKit session cookies, supports back/forward gestures, ⌘[/⌘],
⌘R reload, ⇧⌘O open in browser, file pickers and download save panels. Standard
editing shortcuts remain native. External clicked links open in the browser;
redirects and service popups retain WebKit context. There is no JavaScript bridge
into native shell execution or filesystem access.

## Distribution and remaining verification

Sign a release build using the team's Developer ID, enable the hardened runtime,
notarize through Apple's service and staple the ticket before customer delivery.
No signing credentials are checked into this project. A universal release needs
both arm64 and x86_64 builds; the local script intentionally builds only the host.

Exercise live Clerk sign-in, sign-out/session persistence, Google/Microsoft
connections, voice permission prompts, real downloads and deep-link navigation
before release. Some OAuth providers reject embedded user agents; the browser
fallback provides access to the web app but does not transfer browser cookies
into WebKit. This remains a release gate, not a claimed completed integration.

### Release packaging

The packager now defaults to an optimized `release` build. Local builds remain
ad-hoc signed and are explicitly labeled as not notarized.

For customer distribution, install the team's Developer ID Application
certificate and configure a `notarytool` keychain profile, then run:

```sh
CHIPPI_SIGNING_IDENTITY='Developer ID Application: <organization> (<team>)' \
CHIPPI_NOTARY_PROFILE='<keychain-profile>' \
CHIPPI_REQUIRE_NOTARIZATION=1 ./package.sh
```

This signs with hardened runtime and camera/microphone entitlements, submits the
archive, staples and validates the ticket, runs Gatekeeper assessment, recreates
the stapled archive, and prints its SHA-256. Required-notarization mode refuses to
build when the identity or profile is missing. No signing secrets belong in the
repository. Live OAuth and other distribution checks above still apply.
