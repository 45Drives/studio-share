#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/scripts/.env.release"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE (copy from scripts/.env.release.example)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
STAMP="$(date +%Y%m%d-%H%M%S)"
BUNDLE_TAG="mac-${MAC_BUILD_KIND}-${VERSION}-${STAMP}"
LOCAL_STAGE="${ROOT_DIR}/dist/sign-stage/${BUNDLE_TAG}"

echo "Building macOS app dir on ARM: kind=${MAC_BUILD_KIND}, version=${VERSION}"

mkdir -p "$LOCAL_STAGE"

if [[ "${MAC_BUILD_KIND}" == "universal" ]]; then
  yarn mac:dir:universal
elif [[ "${MAC_BUILD_KIND}" == "arm64" ]]; then
  yarn mac:dir:arm64
else
  echo "MAC_BUILD_KIND must be 'arm64' or 'universal'" >&2
  exit 1
fi

# Find the produced .app (electron-builder --dir outputs into dist/mac*/ by default)
APP_PATH="$(find "${ROOT_DIR}/dist" -maxdepth 4 -type d -name "*.app" | head -n 1 || true)"
if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "Could not find .app under dist/. Build failed?" >&2
  exit 1
fi

echo "Found app bundle: $APP_PATH"
rsync -a --delete "$APP_PATH" "${LOCAL_STAGE}/"

echo "Shipping to signing Mac..."
REMOTE_DIR="${SIGN_INBOX}/${BUNDLE_TAG}"
ssh "${SIGN_USER}@${SIGN_HOST}" "mkdir -p '${REMOTE_DIR}'"
rsync -a --delete "${LOCAL_STAGE}/" "${SIGN_USER}@${SIGN_HOST}:${REMOTE_DIR}/"

echo "Trigger signing on Intel..."
ssh "${SIGN_USER}@${SIGN_HOST}" "bash -lc 'cd \"${REMOTE_DIR}\" && \"${SIGN_INBOX}/sign-mac-on-intel.sh\" \"${BUNDLE_TAG}\"'"

echo "Done."
echo "Signing inbox on Intel: ${REMOTE_DIR}"
