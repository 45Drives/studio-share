#!/bin/bash
set -euo pipefail

# --- bootstrap & env ----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${ENV_FILE:-.env.macos-build}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^\s*#' "$ENV_FILE" | grep -E '^\s*[A-Za-z_][A-Za-z0-9_]*=' | xargs -I {} bash -lc 'k="${0%%=*}"; v="${0#*=}"; printf "%s=%q\n" "$k" "$v"' {})
fi

start_time=$(date +%s)
echo "----- Packaging for macOS -----"

# --- app metadata -------------------------------------------------------------
# Prefer explicit APP_NAME from env; otherwise derive productName from package.json (electron-builder's "build.productName"), else fallback to package.json "name"
APP_NAME="${APP_NAME:-$(node -p "(() => { try {
  const p=require('./package.json'); 
  if (p.build && p.build.productName) return p.build.productName;
  return p.productName || p.name || '';
} catch(e){ process.exit(1) } })()")}"

if [[ -z "${APP_NAME:-}" ]]; then
  echo "Could not determine APP_NAME. Set APP_NAME in $ENV_FILE or ensure package.json has build.productName/productName/name."
  exit 1
fi

APP_VERSION="$(node -p "require('./package.json').version")"
OUTPUT_DIR="${OUTPUT_DIR:-dist/mac}"
ENTITLEMENTS_FILE="${ENTITLEMENTS_FILE:-entitlements.mac.plist}"

# --- signing & notarization config -------------------------------------------
DEV_ID_APP_STRING="${DEV_ID_APP_STRING:-}"
APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_APP_PW="${APPLE_APP_PW:-}"
APPLE_AC_PROFILE="${APPLE_AC_PROFILE:-}"   # optional keychain profile name
NOTARY_ADDITIONAL_ARGS="${NOTARY_ADDITIONAL_ARGS:-}"
RESIGN_APP_BUNDLE="${RESIGN_APP_BUNDLE:-false}" # set to "true" to force a re-sign of the .app

# These env vars help electron-builder pick the correct identity automatically
export CSC_IDENTITY_AUTO="${CSC_IDENTITY_AUTO:-true}"
if [[ -n "${CSC_NAME:-}" || -n "$DEV_ID_APP_STRING" ]]; then
  export CSC_NAME="${CSC_NAME:-$DEV_ID_APP_STRING}"
fi

echo "Build Version: $APP_VERSION"
echo "App Name: $APP_NAME"

# --- build with electron-builder ---------------------------------------------
echo "----- BUILD APP (electron-builder) -----"
if yarn -v >/dev/null 2>&1; then
  yarn build:mac
else
  npm run build:mac
fi
echo ".....DONE."

# --- verify outputs -----------------------------------------------------------
APP_BUNDLE="$OUTPUT_DIR/$APP_NAME.app"
if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "App bundle not found at: $APP_BUNDLE"
  echo "Ensure your electron-builder config's productName matches \"$APP_NAME\"."
  exit 1
fi

# Find the DMG that electron-builder produced for this version & app
# Examples:
#   dist/<AppName>-<version>-mac-x64.dmg
#   dist/<AppName>-<version>-arm64.dmg
#   dist/<AppName>-<version>-universal.dmg
#   dist/mac/<AppName>-<version>.dmg  (rare)
DMG_CANDIDATES=(
  "dist/${APP_NAME}-${APP_VERSION}-*.dmg"
  "dist/mac/${APP_NAME}-${APP_VERSION}-*.dmg"
  "dist/${APP_NAME}-${APP_VERSION}.dmg"
  "dist/mac/${APP_NAME}-${APP_VERSION}.dmg"
)
EB_DMG=""
for pattern in "${DMG_CANDIDATES[@]}"; do
  # shellcheck disable=SC2086
  match=( $pattern )
  if [[ -f "${match[0]:-}" ]]; then
    EB_DMG="${match[0]}"
    break
  fi
done
if [[ -z "$EB_DMG" ]]; then
  echo "DMG not found. Checked:"
  printf '  - %s\n' "${DMG_CANDIDATES[@]}"
  exit 1
fi

echo "----- VERIFY OUTPUTS -----"
ls -la "$OUTPUT_DIR" || true
echo "Using bundle: $APP_BUNDLE"
echo "Using DMG:    $EB_DMG"

# --- optional re-sign (electron-builder usually signs already) ---------------
if [[ "$RESIGN_APP_BUNDLE" == "true" ]]; then
  if [[ -z "$DEV_ID_APP_STRING" ]]; then
    echo "RESIGN_APP_BUNDLE=true but DEV_ID_APP_STRING is empty."
    exit 1
  fi
  echo "----- RE-SIGN APP BUNDLE -----"
  codesign --deep -dvv --force --timestamp --options=runtime \
    --entitlements "$ENTITLEMENTS_FILE" \
    --sign "$DEV_ID_APP_STRING" \
    "$APP_BUNDLE"
  echo "----- VERIFY SIGNATURE -----"
  codesign --verify --strict -dvv "$APP_BUNDLE"
  echo ".....DONE."
else
  echo "Skipping manual re-sign; relying on electron-builder signing."
fi

# --- notarization -------------------------------------------------------------
echo "----- NOTARIZE DMG -----"

if [[ -n "$APPLE_AC_PROFILE" ]]; then
  # Preferred: keychain profile (no password printed/handled here)
  xcrun notarytool submit "$EB_DMG" \
    --keychain-profile "$APPLE_AC_PROFILE" \
    --team-id "$APPLE_TEAM_ID" \
    --wait \
    $NOTARY_ADDITIONAL_ARGS
else
  # Fallback: Apple ID + app-specific password
  if [[ -z "$APPLE_ID" || -z "$APPLE_TEAM_ID" || -z "$APPLE_APP_PW" ]]; then
    echo "Notarization credentials missing. Provide APPLE_AC_PROFILE or APPLE_ID, APPLE_TEAM_ID, and APPLE_APP_PW in $ENV_FILE."
    exit 1
  fi
  xcrun notarytool submit "$EB_DMG" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_PW" \
    --wait \
    $NOTARY_ADDITIONAL_ARGS
fi

xcrun stapler staple "$EB_DMG"
echo ".....DONE."

# --- elapsed -----------------------------------------------------------------
end_time=$(date +%s)
elapsed=$(( end_time - start_time ))
printf '--------------------------------------------------------\n'
printf 'Elapsed time: %d minutes and %d seconds!\n' $((elapsed/60)) $((elapsed%60))
printf '--------------------------------------------------------\n'
