#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/scripts/.env.release}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE (copy from scripts/.env.release.example)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Allow orchestrator/runtime override even when ENV_FILE defines MAC_BUILD_KIND.
if [[ -n "${MAC_BUILD_KIND_OVERRIDE:-}" ]]; then
  MAC_BUILD_KIND="$MAC_BUILD_KIND_OVERRIDE"
  export MAC_BUILD_KIND
fi

cd "$ROOT_DIR"

# Ensure node exists in non-interactive SSH shells (nvm/homebrew/common paths)
if ! command -v node >/dev/null 2>&1; then
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    source "$HOME/.nvm/nvm.sh"
    nvm use --silent >/dev/null 2>&1 || true
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  for p in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [[ -x "$p" ]]; then
      export PATH="$(dirname "$p"):$PATH"
      break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node: command not found on mac build host" >&2
  echo "Install Node or make it available in PATH for non-interactive shells." >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
STAMP="$(date +%Y%m%d-%H%M%S)"
BUNDLE_TAG="${BUNDLE_TAG_OVERRIDE:-mac-${MAC_BUILD_KIND}-${VERSION}-${STAMP}}"

REMOTE_DIR="${SIGN_INBOX}/${BUNDLE_TAG}"

SSH_OPTS=(
  -o BatchMode=yes
  -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no
  -o KbdInteractiveAuthentication=no
  -o ControlMaster=auto
  -o ControlPersist=5m
  -o ControlPath="$HOME/.ssh/cm-%r@%h:%p"
)

SSH=(ssh "${SSH_OPTS[@]}")
RSYNC_SSH=(ssh "${SSH_OPTS[@]}")

echo "Build tag: $BUNDLE_TAG"
echo "BUNDLE_TAG=$BUNDLE_TAG"
echo "Building macOS (${MAC_BUILD_KIND}) unsigned..."

rm -rf dist/mac-universal dist/mac-arm64 dist/mac-x64 dist/sign-stage || true

if [[ "${MAC_BUILD_KIND}" == "universal" ]]; then
  CSC_IDENTITY_AUTO_DISCOVERY=false SKIP_AFTER_SIGN=1 yarn mac:dir:universal
  APP_PATH="${ROOT_DIR}/dist/mac-universal/${APP_PRODUCT_FILENAME}.app"
elif [[ "${MAC_BUILD_KIND}" == "arm64" ]]; then
  CSC_IDENTITY_AUTO_DISCOVERY=false SKIP_AFTER_SIGN=1 yarn mac:dir:arm64
  APP_PATH="${ROOT_DIR}/dist/mac-arm64/${APP_PRODUCT_FILENAME}.app"
elif [[ "${MAC_BUILD_KIND}" == "x64" ]]; then
  CSC_IDENTITY_AUTO_DISCOVERY=false SKIP_AFTER_SIGN=1 yarn mac:dir:x64
  if [[ -d "${ROOT_DIR}/dist/mac/${APP_PRODUCT_FILENAME}.app" ]]; then
    APP_PATH="${ROOT_DIR}/dist/mac/${APP_PRODUCT_FILENAME}.app"
  else
    APP_PATH="${ROOT_DIR}/dist/mac-x64/${APP_PRODUCT_FILENAME}.app"
  fi
else
  echo "MAC_BUILD_KIND must be 'arm64', 'x64', or 'universal'" >&2
  exit 1
fi

test -d "$APP_PATH" || { echo "Missing app bundle: $APP_PATH" >&2; exit 1; }

echo "Shipping to signing Mac: ${SIGN_USER}@${SIGN_HOST}:${REMOTE_DIR}"
"${SSH[@]}" "${SIGN_USER}@${SIGN_HOST}" "mkdir -p '$REMOTE_DIR'"

rsync -a --delete -e "${RSYNC_SSH[*]}" \
  "$APP_PATH" \
  "${SIGN_USER}@${SIGN_HOST}:${REMOTE_DIR}/"

rsync -a -e "${RSYNC_SSH[*]}" \
  "${ROOT_DIR}/${ENTITLEMENTS_FILE}" \
  "${SIGN_USER}@${SIGN_HOST}:${SIGN_INBOX}/${ENTITLEMENTS_FILE}"

SIGN_GIT_PULL_CMD="${SIGN_GIT_PULL_CMD:-cd '${SIGN_INBOX}' && git pull --ff-only}"
echo "Updating signing host repo..."
SIGN_GIT_PULL_CMD_ESCAPED="$(printf '%q' "$SIGN_GIT_PULL_CMD")"
"${SSH[@]}" "${SIGN_USER}@${SIGN_HOST}" "bash -lc $SIGN_GIT_PULL_CMD_ESCAPED"

echo "Trigger signing/notarization on Intel..."
"${SSH[@]}" "${SIGN_USER}@${SIGN_HOST}" \
  "bash -lc '\"${SIGN_INBOX}/scripts/sign-mac-on-intel.sh\" \"$BUNDLE_TAG\"'"

echo "Done. Artifacts are on Intel Mac under: ${SIGN_OUTPUT_DIR}/${BUNDLE_TAG}"
