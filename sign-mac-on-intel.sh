#!/usr/bin/env bash
set -euo pipefail

BUNDLE_TAG="${1:?bundle tag required}"

ENV_FILE="$HOME/scripts/.env.release"

# --- Load env (export everything) ---
if [[ -f "$ENV_FILE" ]]; then
  # Normalize CRLF -> LF
  if /usr/bin/file "$ENV_FILE" | /usr/bin/grep -qi 'CRLF'; then
    /usr/bin/perl -pi -e 's/\r\n/\n/g' "$ENV_FILE"
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${APP_PRODUCT_FILENAME:?}"
: "${ENTITLEMENTS_FILE:?}"
: "${CODESIGN_IDENTITY:?}"
: "${NOTARY_PROFILE:?}"
: "${SIGN_INBOX:?}"
: "${SIGN_OUTPUT_DIR:?}"

: "${SIGN_KEYCHAIN:=$HOME/Library/Keychains/login.keychain-db}"
: "${SIGN_KEYCHAIN_PASSWORD:?SIGN_KEYCHAIN_PASSWORD is required for non-interactive signing}"

IN_DIR="${SIGN_INBOX}/${BUNDLE_TAG}"
APP_BUNDLE="${IN_DIR}/${APP_PRODUCT_FILENAME}.app"

# Resolve entitlements path
if [[ "${ENTITLEMENTS_FILE}" != /* ]]; then
  if [[ -f "${SIGN_INBOX}/${ENTITLEMENTS_FILE}" ]]; then
    ENTITLEMENTS_FILE="${SIGN_INBOX}/${ENTITLEMENTS_FILE}"
  else
    ENTITLEMENTS_FILE="${IN_DIR}/${ENTITLEMENTS_FILE}"
  fi
fi

MAIN_ENT="${ENTITLEMENTS_FILE}"
INHERIT_ENT="${SIGN_INBOX}/entitlements.mac.inherit.plist"

# Ensure inherit entitlements exists
if [[ ! -f "$INHERIT_ENT" ]]; then
  cat > "$INHERIT_ENT" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.inherit</key>
  <true/>
</dict>
</plist>
EOF
  /usr/bin/plutil -lint "$INHERIT_ENT" >/dev/null
fi

test -d "$APP_BUNDLE" || { echo "Missing app bundle: $APP_BUNDLE" >&2; exit 1; }
test -f "$MAIN_ENT" || { echo "Missing entitlements file: $MAIN_ENT" >&2; exit 1; }

VERSION="$(/usr/bin/defaults read "${APP_BUNDLE}/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "unknown")"
OUT_DIR="${SIGN_OUTPUT_DIR}/${BUNDLE_TAG}"
/bin/mkdir -p "$OUT_DIR"

ZIP_PATH="${OUT_DIR}/${APP_PRODUCT_FILENAME}-${VERSION}-mac.zip"
DMG_PATH="${OUT_DIR}/${APP_PRODUCT_FILENAME}-${VERSION}-mac.dmg"

echo "Signing bundle tag: $BUNDLE_TAG"
echo "App: $APP_BUNDLE"
echo "Main entitlements: $MAIN_ENT"
echo "Inherit entitlements: $INHERIT_ENT"
echo "Output: $OUT_DIR"

echo "Preparing keychain for non-interactive codesign..."
echo "  SIGN_KEYCHAIN=$SIGN_KEYCHAIN"

/usr/bin/security unlock-keychain -p "$SIGN_KEYCHAIN_PASSWORD" "$SIGN_KEYCHAIN" >/dev/null 2>&1 || true
/usr/bin/security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
  -k "$SIGN_KEYCHAIN_PASSWORD" "$SIGN_KEYCHAIN" >/dev/null 2>&1 || true

# Make sure the keychain is in the user search list (don’t wipe the list)
CURRENT_KCS="$(/usr/bin/security list-keychains -d user 2>/dev/null | /usr/bin/sed -E 's/^[[:space:]]*"//; s/"[[:space:]]*$//')"
if ! printf "%s\n" "$CURRENT_KCS" | /usr/bin/grep -Fx "$SIGN_KEYCHAIN" >/dev/null; then
  /usr/bin/security list-keychains -d user -s "$SIGN_KEYCHAIN" $CURRENT_KCS >/dev/null 2>&1 || true
fi

# Sanity check identity visibility (global)
if ! /usr/bin/security find-identity -v -p codesigning 2>/dev/null | /usr/bin/grep -F "$CODESIGN_IDENTITY" >/dev/null; then
  echo "ERROR: Could not locate identity in global keychain view: $CODESIGN_IDENTITY" >&2
  /usr/bin/security find-identity -v -p codesigning 2>/dev/null || true
  exit 1
fi

echo "Sanitizing app bundle..."
/usr/bin/xattr -cr "$APP_BUNDLE" || true
/bin/chmod -R u+rwX,go+rX,go-w "$APP_BUNDLE" || true
/bin/chmod -RN "$APP_BUNDLE" 2>/dev/null || true

sign_one() {
  local target="$1"
  local ent="$2"
  /usr/bin/codesign --force --timestamp --options runtime \
    --sign "$CODESIGN_IDENTITY" \
    --entitlements "$ent" \
    "$target"
}

is_macho() {
  # Return 0 if file looks like a Mach-O binary/library/bundle
  /usr/bin/file -b "$1" 2>/dev/null | /usr/bin/grep -Eq 'Mach-O'
}

echo "Removing any existing signatures (best-effort)..."
# Remove signatures from likely code objects (ignore failures)
# Files
/usr/bin/find "$APP_BUNDLE" -type f \( -name "*.dylib" -o -name "*.so" -o -name "*.node" -o -perm -111 \) -print0 2>/dev/null | \
  /usr/bin/xargs -0 -I{} /usr/bin/codesign --remove-signature "{}" 2>/dev/null || true
# Directories (frameworks + nested apps)
usr/bin/find "$APP_BUNDLE/Contents/Frameworks" -maxdepth 2 -type d \( -name "*.framework" -o -name "*.app" \) -print0 2>/dev/null | \
  /usr/bin/xargs -0 -I{} /usr/bin/codesign --remove-signature "{}" 2>/dev/null || true
/usr/bin/codesign --remove-signature "$APP_BUNDLE" 2>/dev/null || true

echo "Signing all Mach-O files inside bundle (deep-first)..."
# Sign every Mach-O file first, deepest paths first, so frameworks verify cleanly later.
# This includes crashpad handler inside Electron Framework.framework.
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if is_macho "$f"; then
    sign_one "$f" "$INHERIT_ENT"
  fi
done < <(
  /usr/bin/find "$APP_BUNDLE" -type f \( -name "*.dylib" -o -name "*.so" -o -name "*.node" -o -perm -111 \) -print0 2>/dev/null \
    | /usr/bin/xargs -0 -I{} printf "%s\n" "{}" \
    | /usr/bin/awk '{ print length($0) "\t" $0 }' \
    | /usr/bin/sort -nr \
    | /usr/bin/cut -f2-
)

echo "Signing frameworks (*.framework) directories..."
while IFS= read -r -d '' fw; do
  sign_one "$fw" "$INHERIT_ENT"
done < <(/usr/bin/find "$APP_BUNDLE/Contents/Frameworks" -maxdepth 2 -type d -name "*.framework" -print0 2>/dev/null)

echo "Signing helper apps (*.app) directories..."
while IFS= read -r -d '' ha; do
  sign_one "$ha" "$INHERIT_ENT"
done < <(/usr/bin/find "$APP_BUNDLE/Contents/Frameworks" -maxdepth 2 -type d -name "*.app" -print0 2>/dev/null)

echo "Signing top-level app with main entitlements..."
sign_one "$APP_BUNDLE" "$MAIN_ENT"

echo "Verifying signature..."
/usr/bin/codesign --verify --strict --deep -dvv "$APP_BUNDLE"
# spctl may fail if run on unsigned-notarized intermediate states; keep it non-fatal
/usr/sbin/spctl -a -vv "$APP_BUNDLE" || true

echo "Packaging ZIP (for auto-updates)..."
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE" "$ZIP_PATH"

echo "Packaging DMG (for downloads)..."
/usr/bin/hdiutil create -volname "$APP_PRODUCT_FILENAME" -srcfolder "$APP_BUNDLE" -ov -format UDZO "$DMG_PATH"

echo "Notarizing ZIP..."
/usr/bin/xcrun notarytool submit "$ZIP_PATH" --keychain-profile "$NOTARY_PROFILE" --wait

echo "Notarizing DMG..."
/usr/bin/xcrun notarytool submit "$DMG_PATH" --keychain-profile "$NOTARY_PROFILE" --wait

echo "Stapling DMG..."
/usr/bin/xcrun stapler staple "$DMG_PATH"

echo "Artifacts complete:"
/bin/ls -la "$OUT_DIR"
echo "ZIP: $ZIP_PATH"
echo "DMG: $DMG_PATH"

