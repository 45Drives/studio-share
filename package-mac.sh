#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# 45Studio-Filesharing — macOS packaging script
#
# What this does (mirrors the steps we used to get a clean build):
#   1) Build with electron-builder (already signs the .app if cert is present)
#   2) Clear quarantine on the built .app (prevents opaque signing issues)
#   3) Codesign the .app bundle once (no per-file signing; let codesign recurse)
#   4) Verify codesign locally
#   5) Create a compressed DMG with Applications symlink
#   6) Notarize the DMG with notarytool (Apple ID creds or app-specific pw)
#   7) Staple the DMG (retry with sudo if needed)
#   8) Gatekeeper check (mount DMG, validate the app, spctl verdict)
#
# Notes:
#  - We keep asar disabled (your choice). Signing still works.
#  - We DO NOT try to sign non-code resources; let electron-builder exclusions
#    (signIgnore) handle that in your electron-builder.json.
#  - Stapling the DMG is enough for distribution. The app inside will verify
#    offline even if the app itself isn’t stapled.
# -----------------------------------------------------------------------------

# # from repo root
# set -a
# source ./.env.macos-build
# set +a

# then run the script
# bash ./package-mac.sh

#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# 45Studio-Filesharing — macOS packaging (env-driven)
# Reads credentials and identity from environment variables (see .env.macos-build)
# -----------------------------------------------------------------------------

set -euo pipefail

# ---- Required tools ----------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: missing $1" >&2; exit 1; }; }
for bin in node yarn xcrun codesign hdiutil xattr ditto; do need "$bin"; done

# ---- App metadata ------------------------------------------------------------
PRODUCT_NAME="45Studio-Filesharing"
APP_BUNDLE="${PRODUCT_NAME}.app"
APP_VERSION="$(node -p "require('./package.json').version")"
DMG_BASENAME="${PRODUCT_NAME}-${APP_VERSION}-mac-x64"

OUTPUT_DIR="dist/mac"
DIST_DIR="dist"
ENTITLEMENTS_FILE="entitlements.mac.plist"

# ---- Credentials / Identity (from env) --------------------------------------
APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_AC_PROFILE="${APPLE_AC_PROFILE:-}"          # notarytool keychain profile (preferred)
APPLE_APP_PW="${APPLE_APP_PW:-}"                  # fallback if no profile
NOTARY_ADDITIONAL_ARGS="${NOTARY_ADDITIONAL_ARGS:-}"

# Identity: allow override, else derive a sensible default
DEV_ID_APP_STRING="${DEV_ID_APP_STRING:-}"
if [[ -z "${DEV_ID_APP_STRING}" && -n "${APPLE_TEAM_ID}" ]]; then
  DEV_ID_APP_STRING="Developer ID Application: Protocase Incorporated (${APPLE_TEAM_ID})"
fi

# Electron-builder helpers (optional)
export CSC_IDENTITY_AUTO="${CSC_IDENTITY_AUTO:-true}"
export CSC_NAME="${CSC_NAME:-$DEV_ID_APP_STRING}"

# ---- Utilities ---------------------------------------------------------------
step(){ echo; echo "===== $* ====="; }

die(){
  echo "ERROR: $*" >&2
  exit 1
}

notary_submit(){
  # Usage: notary_submit <file>
  local file="$1"
  [[ -f "$file" ]] || die "notary_submit: file not found: $file"

  if [[ -n "$APPLE_AC_PROFILE" ]]; then
    # Preferred: uses a stored keychain profile (no plain-text password)
    xcrun notarytool submit "$file" \
      --keychain-profile "$APPLE_AC_PROFILE" \
      ${NOTARY_ADDITIONAL_ARGS} \
      --wait
  else
    [[ -n "$APPLE_ID" && -n "$APPLE_TEAM_ID" && -n "$APPLE_APP_PW" ]] \
      || die "Set APPLE_AC_PROFILE or APPLE_ID/APPLE_TEAM_ID/APPLE_APP_PW in environment"

    xcrun notarytool submit "$file" \
      --apple-id "$APPLE_ID" \
      --team-id "$APPLE_TEAM_ID" \
      --password "$APPLE_APP_PW" \
      ${NOTARY_ADDITIONAL_ARGS} \
      --wait
  fi
}

retry_sudo_staple(){
  local target="$1"
  if xcrun stapler staple "$target"; then
    return 0
  fi
  echo "stapler failed; retrying with sudo…"
  sudo xcrun stapler staple "$target"
}

# ---- Build with electron-builder --------------------------------------------
step "BUILD (electron-builder --mac)"
yarn build:mac

APP_PATH="${OUTPUT_DIR}/${APP_BUNDLE}"
[[ -d "$APP_PATH" ]] || die "Built app not found at: $APP_PATH"

# ---- Clear quarantine (prevents opaque signing errors) ----------------------
step "CLEAR QUARANTINE"
xattr -dr com.apple.quarantine "$APP_PATH" || true

# ---- Codesign bundle (one recursive pass) -----------------------------------
[[ -n "$DEV_ID_APP_STRING" ]] || die "DEV_ID_APP_STRING is empty. Set it in the environment."
step "CODESIGN APP BUNDLE"
codesign --deep -f --timestamp --options runtime \
  --entitlements "$ENTITLEMENTS_FILE" \
  --sign "$DEV_ID_APP_STRING" \
  "$APP_PATH"

# ---- Verify signature --------------------------------------------------------
step "VERIFY SIGNATURE"
codesign -vvv --deep --strict --verify "$APP_PATH"
spctl -a -vv --type execute "$APP_PATH" || true

# ---- Create DMG --------------------------------------------------------------
step "CREATE DMG"
TMP_DIR="${OUTPUT_DIR}/_dmg_tmp"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"
cp -R "$APP_PATH" "$TMP_DIR/"
ln -sf /Applications "$TMP_DIR/Applications"

DMG_PATH="${DIST_DIR}/${DMG_BASENAME}.dmg"
hdiutil create \
  -volname "$PRODUCT_NAME" \
  -srcfolder "$TMP_DIR" \
  -ov -fs HFS+ -format UDZO -imagekey zlib-level=9 \
  "$DMG_PATH"

# Optional: sign DMG container
step "SIGN DMG CONTAINER (optional)"
codesign --deep -f --timestamp --options runtime \
  --sign "$DEV_ID_APP_STRING" \
  "$DMG_PATH" || true
codesign --verify -dv "$DMG_PATH" || true

# ---- Notarize DMG (preferred distribution artifact) -------------------------
step "NOTARIZE DMG"
notary_submit "$DMG_PATH"

# ---- Staple DMG (retry with sudo if needed) ---------------------------------
step "STAPLE DMG"
retry_sudo_staple "$DMG_PATH"

# ---- Gatekeeper sanity check (on the app inside the DMG) --------------------
step "GATEKEEPER CHECK (mounted DMG)"
MNT="$(mktemp -d /tmp/vol.XXXXXX)"
hdiutil attach "$DMG_PATH" -nobrowse -mountpoint "$MNT" >/dev/null
APP_ON_VOL="$(find "$MNT" -maxdepth 1 -name '*.app' -print -quit || true)"
if [[ -n "$APP_ON_VOL" ]]; then
  xcrun stapler validate -v "$APP_ON_VOL" || true
  spctl -a -vv --type execute "$APP_ON_VOL" || true
else
  echo "Warning: Could not locate .app on mounted volume."
fi
hdiutil detach "$MNT" >/dev/null

# ---- OPTIONAL: Notarize a ZIP of the app (if you ship ZIP instead of DMG) ---
# Uncomment if you want a notarized, stapled .app:
# step "OPTIONAL — NOTARIZE APP ZIP"
# APP_ZIP="${DIST_DIR}/${PRODUCT_NAME// /-}.app.zip"
# rm -f "$APP_ZIP"
# ditto -c -k --keepParent "$APP_PATH" "$APP_ZIP"
# notary_submit "$APP_ZIP"
# xcrun stapler staple "$APP_PATH" || true
# xcrun stapler validate -v "$APP_PATH" || true

# ---- Summary -----------------------------------------------------------------
step "SUMMARY"
echo "App:  $APP_PATH"
echo "DMG:  $DMG_PATH"
echo "Team: ${APPLE_TEAM_ID:-<unset>}"
echo "ID:   ${APPLE_ID:-<unset>}"
echo
echo "Done. Ship the stapled DMG above."
