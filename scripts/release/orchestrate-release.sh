#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_ENV_FILE="${ROOT_DIR}/scripts/release/.env.orchestrator"
ENV_FILE="${1:-${ORCH_ENV_FILE:-$DEFAULT_ENV_FILE}}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing orchestrator env file: $ENV_FILE" >&2
  echo "Copy from scripts/release/.env.orchestrator.example" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$ROOT_DIR"

# Backward-compatible aliases (old single-host vars -> new split vars)
WIN_BUILD_HOST="${WIN_BUILD_HOST:-${WIN_HOST:-}}"
WIN_BUILD_PORT="${WIN_BUILD_PORT:-${WIN_PORT:-22}}"
WIN_BUILD_USER="${WIN_BUILD_USER:-${WIN_USER:-}}"
WIN_BUILD_PASSWORD="${WIN_BUILD_PASSWORD:-${WIN_PASSWORD:-}}"
WIN_BUILD_REMOTE_DIR="${WIN_BUILD_REMOTE_DIR:-${WIN_REMOTE_DIR:-studio-share}}"
WIN_BUILD_PREPARE_CMD="${WIN_BUILD_PREPARE_CMD:-${WIN_PREPARE_CMD:-}}"
WIN_BUILD_CMD="${WIN_BUILD_CMD:-cd ${WIN_BUILD_REMOTE_DIR} && yarn install && yarn build:win}"
WIN_BUILD_EXE_GLOB="${WIN_BUILD_EXE_GLOB:-${WIN_EXE_GLOB:-${WIN_BUILD_REMOTE_DIR}/dist/*-win-*.exe}}"

WIN_SIGN_HOST="${WIN_SIGN_HOST:-$WIN_BUILD_HOST}"
WIN_SIGN_PORT="${WIN_SIGN_PORT:-$WIN_BUILD_PORT}"
WIN_SIGN_USER="${WIN_SIGN_USER:-$WIN_BUILD_USER}"
WIN_SIGN_PASSWORD="${WIN_SIGN_PASSWORD:-$WIN_BUILD_PASSWORD}"
WIN_SIGN_REMOTE_DIR="${WIN_SIGN_REMOTE_DIR:-$WIN_BUILD_REMOTE_DIR}"

truthy() {
  local v="${1:-}"
  [[ "$v" == "1" || "$v" == "true" || "$v" == "TRUE" || "$v" == "yes" || "$v" == "YES" ]]
}

require_cmd() {
  local c="$1"
  command -v "$c" >/dev/null 2>&1 || {
    echo "Required command not found: $c" >&2
    exit 1
  }
}

require_cmd ssh
require_cmd rsync
require_cmd node
require_cmd yarn

VERSION="${RELEASE_VERSION:-$(node -p "require('./package.json').version")}"
RELEASE_TAG="${RELEASE_TAG:-v${VERSION}}"
STAMP="$(date +%Y%m%d-%H%M%S)"
STAGING_DIR="${RELEASE_STAGING_DIR:-${ROOT_DIR}/builds/release/${VERSION}}"

mkdir -p "$STAGING_DIR"/{linux,windows,mac}

SSH_STRICT_OPTS=(
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  -o ConnectTimeout=20
  -o ServerAliveInterval=20
  -o ServerAliveCountMax=4
)

needs_sshpass=0
for p in "${WIN_BUILD_PASSWORD:-}" "${WIN_SIGN_PASSWORD:-}" "${MAC_ARM_PASSWORD:-}" "${MAC_SIGN_PASSWORD:-}"; do
  if [[ -n "${p:-}" ]]; then
    needs_sshpass=1
    break
  fi
done
if [[ "$needs_sshpass" == "1" ]]; then
  require_cmd sshpass
fi

ssh_run() {
  local host="$1" user="$2" pass="$3" port="$4" cmd="$5"
  if [[ -n "$pass" ]]; then
    sshpass -p "$pass" ssh "${SSH_STRICT_OPTS[@]}" -p "$port" -l "$user" "$host" "$cmd"
  else
    ssh "${SSH_STRICT_OPTS[@]}" -p "$port" -l "$user" "$host" "$cmd"
  fi
}

ssh_run_tty() {
  local host="$1" user="$2" pass="$3" port="$4" cmd="$5"
  if [[ -n "$pass" ]]; then
    sshpass -p "$pass" ssh -tt "${SSH_STRICT_OPTS[@]}" -p "$port" -l "$user" "$host" "$cmd"
  else
    ssh -tt "${SSH_STRICT_OPTS[@]}" -p "$port" -l "$user" "$host" "$cmd"
  fi
}

rsync_to() {
  local host="$1" user="$2" pass="$3" port="$4" src="$5" dest="$6"
  local excludes="${RSYNC_EXCLUDES:-}"
  local delete_flag=()
  if truthy "${RSYNC_DELETE:-0}"; then
    delete_flag=(--delete)
  fi
  local ssh_user_escaped
  ssh_user_escaped="$(printf '%q' "$user")"
  if [[ -n "$pass" ]]; then
    sshpass -p "$pass" rsync -az "${delete_flag[@]}" \
      -e "ssh -p $port -l $ssh_user_escaped ${SSH_STRICT_OPTS[*]}" \
      $excludes \
      "$src" "${host}:$dest"
  else
    rsync -az "${delete_flag[@]}" \
      -e "ssh -p $port -l $ssh_user_escaped ${SSH_STRICT_OPTS[*]}" \
      $excludes \
      "$src" "${host}:$dest"
  fi
}

rsync_from() {
  local host="$1" user="$2" pass="$3" port="$4" src="$5" dest="$6"
  local ssh_user_escaped
  ssh_user_escaped="$(printf '%q' "$user")"
  if [[ -n "$pass" ]]; then
    sshpass -p "$pass" rsync -az \
      -e "ssh -p $port -l $ssh_user_escaped ${SSH_STRICT_OPTS[*]}" \
      "${host}:$src" "$dest"
  else
    rsync -az \
      -e "ssh -p $port -l $ssh_user_escaped ${SSH_STRICT_OPTS[*]}" \
      "${host}:$src" "$dest"
  fi
}

replace_sign_tokens() {
  local cmd="$1"
  cmd="${cmd//__INPUT_POSIX__/${WIN_SIGN_INPUT_POSIX}}"
  cmd="${cmd//__INPUT_WIN__/${WIN_SIGN_INPUT_WIN}}"
  cmd="${cmd//__OUTPUT_POSIX__/${WIN_SIGN_OUTPUT_POSIX}}"
  cmd="${cmd//__OUTPUT_WIN__/${WIN_SIGN_OUTPUT_WIN}}"
  cmd="${cmd//__BASENAME__/${WIN_SIGN_BASENAME}}"
  cmd="${cmd//__VERSION__/${VERSION}}"
  printf '%s' "$cmd"
}

echo "Release version: $VERSION"
echo "Release tag: $RELEASE_TAG"
echo "Staging dir: $STAGING_DIR"

if truthy "${RUN_LINUX_BUILD:-1}"; then
  echo "== Linux build =="
  LINUX_BUILD_CMD="${LINUX_BUILD_CMD:-yarn build:linux}"
  bash -lc "$LINUX_BUILD_CMD"

  shopt -s nullglob
  linux_artifacts=(dist/*-linux-*.deb dist/*-linux-*.rpm dist/latest-linux.yml)
  if [[ "${#linux_artifacts[@]}" -eq 0 ]]; then
    echo "No Linux artifacts found in dist/" >&2
    exit 1
  fi
  cp -f "${linux_artifacts[@]}" "$STAGING_DIR/linux/"
  shopt -u nullglob
fi

if truthy "${RUN_WINDOWS_BUILD:-1}"; then
  echo "== Windows build/sign =="
  : "${WIN_BUILD_HOST:?WIN_BUILD_HOST is required when RUN_WINDOWS_BUILD=1}"
  : "${WIN_BUILD_USER:?WIN_BUILD_USER is required when RUN_WINDOWS_BUILD=1}"
  : "${WIN_SIGN_HOST:?WIN_SIGN_HOST is required when RUN_WINDOWS_BUILD=1}"
  : "${WIN_SIGN_USER:?WIN_SIGN_USER is required when RUN_WINDOWS_BUILD=1}"

  WIN_BUILD_MODE="${WIN_BUILD_MODE:-git}" # git | rsync
  WIN_BUILD_GIT_PULL_CMD="${WIN_BUILD_GIT_PULL_CMD:-cd ${WIN_BUILD_REMOTE_DIR} && git pull --ff-only}"
  WIN_BUILD_CMD="${WIN_BUILD_CMD:-cd ${WIN_BUILD_REMOTE_DIR} && yarn install && yarn build:win}"
  WIN_BUILD_EXE_GLOB="${WIN_BUILD_EXE_GLOB:-${WIN_BUILD_REMOTE_DIR}/dist/*-win-*.exe}"

  mkdir -p "$STAGING_DIR/windows/unsigned" "$STAGING_DIR/windows/signed"

  if [[ "$WIN_BUILD_MODE" == "rsync" ]]; then
    if [[ -n "${WIN_BUILD_PREPARE_CMD:-}" ]]; then
      ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_PREPARE_CMD"
    fi
    RSYNC_EXCLUDES="--exclude=.git --exclude=dist --exclude=builds --exclude=node_modules --exclude=.env*"
    RSYNC_DELETE=1
    rsync_to "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "${ROOT_DIR}/" "${WIN_BUILD_REMOTE_DIR}/"
    RSYNC_DELETE=0
  else
    ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_GIT_PULL_CMD"
  fi

  ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_CMD"

  set +e
  rsync_from "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_EXE_GLOB" "$STAGING_DIR/windows/unsigned/"
  rsync_code=$?
  set -e
  if [[ "$rsync_code" -ne 0 ]]; then
    echo "Failed to fetch unsigned Windows EXE using WIN_BUILD_EXE_GLOB=$WIN_BUILD_EXE_GLOB" >&2
    exit 1
  fi

  shopt -s nullglob
  win_unsigned_exes=("$STAGING_DIR/windows/unsigned/"*.exe)
  shopt -u nullglob
  if [[ "${#win_unsigned_exes[@]}" -eq 0 ]]; then
    echo "No unsigned Windows EXE found in $STAGING_DIR/windows/unsigned" >&2
    exit 1
  fi
  WIN_UNSIGNED_EXE="$(ls -1t -- "${win_unsigned_exes[@]}" | head -n1)"
  WIN_SIGN_BASENAME="$(basename "$WIN_UNSIGNED_EXE")"

  WIN_SIGN_INPUT_POSIX="${WIN_SIGN_REMOTE_DIR%/}/${WIN_SIGN_BASENAME}"
  if [[ -n "${WIN_SIGN_WIN_DIR:-}" ]]; then
    WIN_SIGN_INPUT_WIN="${WIN_SIGN_WIN_DIR%\\}\\${WIN_SIGN_BASENAME}"
  else
    WIN_SIGN_INPUT_WIN="$WIN_SIGN_INPUT_POSIX"
  fi
  WIN_SIGN_OUTPUT_POSIX="${WIN_SIGN_OUTPUT_POSIX:-$WIN_SIGN_INPUT_POSIX}"
  WIN_SIGN_OUTPUT_WIN="${WIN_SIGN_OUTPUT_WIN:-$WIN_SIGN_INPUT_WIN}"

  ssh_run "$WIN_SIGN_HOST" "$WIN_SIGN_USER" "${WIN_SIGN_PASSWORD:-}" "$WIN_SIGN_PORT" "mkdir -p '${WIN_SIGN_REMOTE_DIR}'"
  RSYNC_EXCLUDES=""
  RSYNC_DELETE=0
  rsync_to "$WIN_SIGN_HOST" "$WIN_SIGN_USER" "${WIN_SIGN_PASSWORD:-}" "$WIN_SIGN_PORT" "$WIN_UNSIGNED_EXE" "${WIN_SIGN_INPUT_POSIX}"

  WIN_SIGN_CMD="${WIN_SIGN_CMD:-}"
  if [[ -n "$WIN_SIGN_CMD" ]]; then
    WIN_SIGN_CMD_RESOLVED="$(replace_sign_tokens "$WIN_SIGN_CMD")"
    if truthy "${WIN_SIGN_INTERACTIVE:-0}"; then
      ssh_run_tty "$WIN_SIGN_HOST" "$WIN_SIGN_USER" "${WIN_SIGN_PASSWORD:-}" "$WIN_SIGN_PORT" "$WIN_SIGN_CMD_RESOLVED"
    else
      ssh_run "$WIN_SIGN_HOST" "$WIN_SIGN_USER" "${WIN_SIGN_PASSWORD:-}" "$WIN_SIGN_PORT" "$WIN_SIGN_CMD_RESOLVED"
    fi
  else
    echo "WIN_SIGN_CMD is empty. Skipping remote sign command; expecting signed file to already exist."
  fi

  WIN_SIGN_FETCH_PATH="${WIN_SIGN_FETCH_PATH:-$WIN_SIGN_OUTPUT_POSIX}"
  set +e
  rsync_from "$WIN_SIGN_HOST" "$WIN_SIGN_USER" "${WIN_SIGN_PASSWORD:-}" "$WIN_SIGN_PORT" "$WIN_SIGN_FETCH_PATH" "$STAGING_DIR/windows/signed/"
  signed_fetch_code=$?
  set -e
  if [[ "$signed_fetch_code" -ne 0 ]]; then
    WIN_SIGN_FETCH_GLOB="${WIN_SIGN_FETCH_GLOB:-${WIN_SIGN_REMOTE_DIR%/}/*-win-*.exe}"
    set +e
    rsync_from "$WIN_SIGN_HOST" "$WIN_SIGN_USER" "${WIN_SIGN_PASSWORD:-}" "$WIN_SIGN_PORT" "$WIN_SIGN_FETCH_GLOB" "$STAGING_DIR/windows/signed/"
    signed_fetch_code=$?
    set -e
    if [[ "$signed_fetch_code" -ne 0 ]]; then
      echo "Failed to fetch signed Windows EXE. Checked WIN_SIGN_FETCH_PATH and WIN_SIGN_FETCH_GLOB." >&2
      exit 1
    fi
  fi

  shopt -s nullglob
  win_signed_exes=("$STAGING_DIR/windows/signed/"*.exe)
  shopt -u nullglob
  if [[ "${#win_signed_exes[@]}" -eq 0 ]]; then
    echo "No signed Windows EXE found in $STAGING_DIR/windows/signed" >&2
    exit 1
  fi
  WIN_PRIMARY_EXE="$(ls -1t -- "${win_signed_exes[@]}" | head -n1)"
  yarn release:gen-yml \
    --version "$VERSION" \
    --output "$STAGING_DIR/windows/latest.yml" \
    --file "$WIN_PRIMARY_EXE"
fi

if truthy "${RUN_MAC_BUILD:-1}"; then
  echo "== macOS build/sign/notarize =="
  : "${MAC_ARM_HOST:?MAC_ARM_HOST is required when RUN_MAC_BUILD=1}"
  : "${MAC_ARM_USER:?MAC_ARM_USER is required when RUN_MAC_BUILD=1}"
  : "${MAC_ARM_REPO_DIR:?MAC_ARM_REPO_DIR is required when RUN_MAC_BUILD=1}"
  : "${MAC_SIGN_HOST:?MAC_SIGN_HOST is required when RUN_MAC_BUILD=1}"
  : "${MAC_SIGN_USER:?MAC_SIGN_USER is required when RUN_MAC_BUILD=1}"
  : "${MAC_SIGN_OUTPUT_DIR:?MAC_SIGN_OUTPUT_DIR is required when RUN_MAC_BUILD=1}"

  MAC_ARM_PORT="${MAC_ARM_PORT:-22}"
  MAC_SIGN_PORT="${MAC_SIGN_PORT:-22}"
  MAC_BUILD_KIND="${MAC_BUILD_KIND:-universal}"
  BUNDLE_TAG="${MAC_BUNDLE_TAG:-mac-${MAC_BUILD_KIND}-${VERSION}-${STAMP}}"
  MAC_RELEASE_ENV_LOCAL="${MAC_RELEASE_ENV_LOCAL:-}"
  MAC_RELEASE_ENV_REMOTE="${MAC_RELEASE_ENV_REMOTE:-${MAC_ARM_REPO_DIR}/scripts/.env.release}"

  if [[ -n "$MAC_RELEASE_ENV_LOCAL" ]]; then
    RSYNC_EXCLUDES=""
    rsync_to "$MAC_ARM_HOST" "$MAC_ARM_USER" "${MAC_ARM_PASSWORD:-}" "$MAC_ARM_PORT" \
      "$MAC_RELEASE_ENV_LOCAL" "$MAC_RELEASE_ENV_REMOTE"
  fi

  MAC_REMOTE_CMD="cd '${MAC_ARM_REPO_DIR}' && BUNDLE_TAG_OVERRIDE='${BUNDLE_TAG}'"
  if [[ -n "$MAC_RELEASE_ENV_LOCAL" ]]; then
    MAC_REMOTE_CMD="${MAC_REMOTE_CMD} ENV_FILE='${MAC_RELEASE_ENV_REMOTE}'"
  fi
  MAC_REMOTE_CMD="${MAC_REMOTE_CMD} bash scripts/release-mac-build.sh"

  ssh_run "$MAC_ARM_HOST" "$MAC_ARM_USER" "${MAC_ARM_PASSWORD:-}" "$MAC_ARM_PORT" "$MAC_REMOTE_CMD"

  mkdir -p "$STAGING_DIR/mac"
  rsync_from "$MAC_SIGN_HOST" "$MAC_SIGN_USER" "${MAC_SIGN_PASSWORD:-}" "$MAC_SIGN_PORT" \
    "${MAC_SIGN_OUTPUT_DIR}/${BUNDLE_TAG}/" "$STAGING_DIR/mac/"

  shopt -s nullglob
  mac_zips=("$STAGING_DIR/mac/"*.zip)
  mac_dmgs=("$STAGING_DIR/mac/"*.dmg)
  shopt -u nullglob

  if [[ "${#mac_zips[@]}" -eq 0 ]]; then
    echo "No mac ZIP artifact found in $STAGING_DIR/mac" >&2
    exit 1
  fi

  MAC_PRIMARY_ZIP="$(ls -1t -- "${mac_zips[@]}" | head -n1)"

  gen_args=(
    --version "$VERSION"
    --output "$STAGING_DIR/mac/latest-mac.yml"
    --path "$(basename "$MAC_PRIMARY_ZIP")"
    --file "$MAC_PRIMARY_ZIP"
  )

  if [[ "${#mac_dmgs[@]}" -gt 0 ]]; then
    MAC_PRIMARY_DMG="$(ls -1t -- "${mac_dmgs[@]}" | head -n1)"
    gen_args+=(--file "$MAC_PRIMARY_DMG")
  fi

  yarn release:gen-yml "${gen_args[@]}"
fi

if truthy "${GH_UPLOAD_RELEASE:-0}" || truthy "${GH_PUBLISH_RELEASE:-0}" || truthy "${GH_CREATE_DRAFT:-0}"; then
  require_cmd gh
  GH_REPO="${GH_REPO:-45Drives/studio-share}"
  GH_TITLE="${GH_TITLE:-$RELEASE_TAG}"
  GH_NOTES="${GH_NOTES:-}"

  if truthy "${GH_CREATE_DRAFT:-0}"; then
    if ! gh release view "$RELEASE_TAG" --repo "$GH_REPO" >/dev/null 2>&1; then
      gh release create "$RELEASE_TAG" --repo "$GH_REPO" --title "$GH_TITLE" --notes "$GH_NOTES" --draft
    fi
  fi

  if truthy "${GH_UPLOAD_RELEASE:-0}"; then
    mapfile -t assets < <(find "$STAGING_DIR" -maxdepth 2 -type f \
      \( -name '*.yml' -o -name '*.exe' -o -name '*.zip' -o -name '*.dmg' -o -name '*.deb' -o -name '*.rpm' \) | sort)
    if [[ "${#assets[@]}" -eq 0 ]]; then
      echo "No assets found to upload from $STAGING_DIR" >&2
      exit 1
    fi
    gh release upload "$RELEASE_TAG" --repo "$GH_REPO" --clobber "${assets[@]}"
  fi

  if truthy "${GH_PUBLISH_RELEASE:-0}"; then
    gh release edit "$RELEASE_TAG" --repo "$GH_REPO" --draft=false
  fi
fi

echo "Release orchestration complete."
echo "Collected assets under: $STAGING_DIR"
