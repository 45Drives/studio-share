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

# Preserve runtime env overrides so they win over values in ENV_FILE.
RUNTIME_OVERRIDE_KEYS=(
  RUN_LINUX_BUILD
  RUN_MAC_BUILD
  RUN_WINDOWS_BUILD
  WIN_PHASE
  RELEASE_VERSION
  RELEASE_TAG
  RELEASE_STAGING_DIR
  RELEASE_BUILDS_DIR
  GH_CREATE_DRAFT
  GH_UPLOAD_RELEASE
  GH_PUBLISH_RELEASE
)
declare -A RUNTIME_OVERRIDES=()
for _k in "${RUNTIME_OVERRIDE_KEYS[@]}"; do
  if [[ -n "${!_k+x}" ]]; then
    RUNTIME_OVERRIDES["$_k"]="${!_k}"
  fi
done

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for _k in "${!RUNTIME_OVERRIDES[@]}"; do
  printf -v "$_k" '%s' "${RUNTIME_OVERRIDES[$_k]}"
  export "$_k"
done

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
WIN_BUILD_DIST_DIR="${WIN_BUILD_DIST_DIR:-${WIN_BUILD_REMOTE_DIR%/}/dist/}"
WIN_BUILD_DISABLE_SIGN="${WIN_BUILD_DISABLE_SIGN:-1}"
WIN_BUILD_NO_SIGN_PREFIX="${WIN_BUILD_NO_SIGN_PREFIX:-set CSC_IDENTITY_AUTO_DISCOVERY=false&& set CSC_LINK=&& set CSC_KEY_PASSWORD=&& set WIN_CSC_LINK=&& set WIN_CSC_KEY_PASSWORD=&& set CSC_NAME=&& set WIN_CSC_NAME=&& }"
WIN_BUILD_NO_SIGN_PREFIX_POSIX="${WIN_BUILD_NO_SIGN_PREFIX_POSIX:-CSC_IDENTITY_AUTO_DISCOVERY=false CSC_LINK= CSC_KEY_PASSWORD= WIN_CSC_LINK= WIN_CSC_KEY_PASSWORD= CSC_NAME= WIN_CSC_NAME= }"

WIN_SIGN_WIN_DIR="${WIN_SIGN_WIN_DIR:-}"

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
require_cmd scp
require_cmd rsync
require_cmd node
require_cmd yarn

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
VERSION="$PACKAGE_VERSION"
if [[ -n "${RELEASE_VERSION:-}" && "${RELEASE_VERSION}" != "$PACKAGE_VERSION" ]]; then
  echo "RELEASE_VERSION (${RELEASE_VERSION}) does not match package.json (${PACKAGE_VERSION}); using package.json version." >&2
fi
RELEASE_TAG_RAW="${RELEASE_TAG:-v__VERSION__}"
RELEASE_TAG="${RELEASE_TAG_RAW//__VERSION__/${VERSION}}"
STAMP="$(date +%Y%m%d-%H%M%S)"
STAGING_DIR_RAW="${RELEASE_STAGING_DIR:-${ROOT_DIR}/builds/release/__VERSION__}"
STAGING_DIR="${STAGING_DIR_RAW//__VERSION__/${VERSION}}"
RELEASE_BUILDS_DIR="${RELEASE_BUILDS_DIR:-${ROOT_DIR}/release-builds}"

mkdir -p "$STAGING_DIR"/{linux,windows,mac}
mkdir -p "$RELEASE_BUILDS_DIR"

SSH_STRICT_OPTS=(
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  -o ConnectTimeout=20
  -o ServerAliveInterval=20
  -o ServerAliveCountMax=4
)

needs_sshpass=0
for p in "${WIN_BUILD_PASSWORD:-}" "${MAC_ARM_PASSWORD:-}" "${MAC_FETCH_PASSWORD:-}" "${MAC_SIGN_PASSWORD:-}"; do
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

scp_from_file() {
  local host="$1" user="$2" pass="$3" port="$4" remote_file="$5" local_file="$6"
  local remote_file_escaped="${remote_file// /\\ }"
  local remote_spec="${host}:${remote_file_escaped}"
  local user_ssh_opt="${user// /\\ }"
  if [[ -n "$pass" ]]; then
    sshpass -p "$pass" scp "${SSH_STRICT_OPTS[@]}" -o "User=${user_ssh_opt}" -P "$port" "$remote_spec" "$local_file"
  else
    scp "${SSH_STRICT_OPTS[@]}" -o "User=${user_ssh_opt}" -P "$port" "$remote_spec" "$local_file"
  fi
}

copy_to_release_builds() {
  local file
  for file in "$@"; do
    [[ -f "$file" ]] || continue
    cp -f "$file" "$RELEASE_BUILDS_DIR/"
  done
}

echo "Release version: $VERSION"
echo "Release tag: $RELEASE_TAG"
echo "Staging dir: $STAGING_DIR"
echo "Release builds dir: $RELEASE_BUILDS_DIR"

if truthy "${RUN_LINUX_BUILD:-1}"; then
  echo "== Linux build =="
  LINUX_GIT_PULL_CMD="${LINUX_GIT_PULL_CMD:-git pull --ff-only}"
  bash -lc "$LINUX_GIT_PULL_CMD"
  LINUX_BUILD_CMD="${LINUX_BUILD_CMD:-yarn build:linux}"
  bash -lc "$LINUX_BUILD_CMD"

  LINUX_CLEAN_OUTPUTS="${LINUX_CLEAN_OUTPUTS:-1}"
  if truthy "$LINUX_CLEAN_OUTPUTS"; then
    shopt -s nullglob
    stale_staging_linux=("$STAGING_DIR/linux/"*.deb "$STAGING_DIR/linux/"*.rpm "$STAGING_DIR/linux/latest-linux.yml)
    if [[ "${#stale_staging_linux[@]}" -gt 0 ]]; then
      rm -f -- "${stale_staging_linux[@]}"
    fi
    stale_release_linux=("$RELEASE_BUILDS_DIR/"*-linux-*.deb "$RELEASE_BUILDS_DIR/"*-linux-*.rpm "$RELEASE_BUILDS_DIR/latest-linux.yml)
    if [[ "${#stale_release_linux[@]}" -gt 0 ]]; then
      rm -f -- "${stale_release_linux[@]}"
    fi
    shopt -u nullglob
  fi

  shopt -s nullglob
  linux_artifacts=(dist/*-linux-*.deb dist/*-linux-*.rpm dist/latest-linux.yml)
  if [[ "${#linux_artifacts[@]}" -eq 0 ]]; then
    echo "No Linux artifacts found in dist/" >&2
    exit 1
  fi
  cp -f "${linux_artifacts[@]}" "$STAGING_DIR/linux/"
  copy_to_release_builds "${linux_artifacts[@]}"
  shopt -u nullglob
fi

run_windows_flow() {
  if ! truthy "${RUN_WINDOWS_BUILD:-1}"; then
    return
  fi
  echo "== Windows build/sign =="
  WIN_PHASE="${WIN_PHASE:-stage}" # stage | finalize
  case "$WIN_PHASE" in
    stage|finalize) ;;
    auto)
      echo "WIN_PHASE=auto is deprecated; using WIN_PHASE=stage (manual signing flow)." >&2
      WIN_PHASE="stage"
      ;;
    *)
      echo "WIN_PHASE must be one of: stage, finalize (got '$WIN_PHASE')" >&2
      exit 1
      ;;
  esac

  : "${WIN_BUILD_HOST:?WIN_BUILD_HOST is required when RUN_WINDOWS_BUILD=1}"
  : "${WIN_BUILD_USER:?WIN_BUILD_USER is required when RUN_WINDOWS_BUILD=1}"
  : "${WIN_SIGN_WIN_DIR:?WIN_SIGN_WIN_DIR is required when RUN_WINDOWS_BUILD=1}"

  # GitHub release automation temporarily disabled.
  # if [[ "$WIN_PHASE" == "stage" ]] && (truthy "${GH_UPLOAD_RELEASE:-0}" || truthy "${GH_PUBLISH_RELEASE:-0}"); then
  #   echo "WIN_PHASE=stage cannot run with GH upload/publish enabled." >&2
  #   echo "Disable GH_UPLOAD_RELEASE/GH_PUBLISH_RELEASE or run WIN_PHASE=finalize." >&2
  #   exit 1
  # fi

  WIN_BUILD_MODE="${WIN_BUILD_MODE:-git}" # git | rsync
  WIN_BUILD_GIT_PULL_CMD="${WIN_BUILD_GIT_PULL_CMD:-cd ${WIN_BUILD_REMOTE_DIR} && git pull --ff-only}"
  WIN_BUILD_CMD="${WIN_BUILD_CMD:-cd ${WIN_BUILD_REMOTE_DIR} && yarn install && yarn build:win}"
  WIN_BUILD_EXE_GLOB="${WIN_BUILD_EXE_GLOB:-${WIN_BUILD_REMOTE_DIR}/dist/*-win-*.exe}"
  WIN_BUILD_DIST_DIR_WIN="${WIN_BUILD_DIST_DIR_WIN:-${WIN_BUILD_DIST_DIR:-${WIN_BUILD_REMOTE_DIR}\\dist}}"
  WIN_BUILD_DIST_DIR_WIN="${WIN_BUILD_DIST_DIR_WIN%\\}"
  WIN_BUILD_DIST_DIR_WIN="${WIN_BUILD_DIST_DIR_WIN%/}"

  mkdir -p "$STAGING_DIR/windows/unsigned" "$STAGING_DIR/windows/signed"

  if [[ "$WIN_PHASE" != "finalize" ]]; then
    ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_GIT_PULL_CMD"

    if [[ "$WIN_BUILD_MODE" == "rsync" ]]; then
      if [[ -n "${WIN_BUILD_PREPARE_CMD:-}" ]]; then
        ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_PREPARE_CMD"
      fi
      RSYNC_EXCLUDES="--exclude=.git --exclude=dist --exclude=builds --exclude=node_modules --exclude=.env*"
      RSYNC_DELETE=1
      rsync_to "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "${ROOT_DIR}/" "${WIN_BUILD_REMOTE_DIR}/"
      RSYNC_DELETE=0
    fi

    WIN_BUILD_CMD_EFFECTIVE="$WIN_BUILD_CMD"
    if truthy "${WIN_BUILD_DISABLE_SIGN:-1}"; then
      if [[ "$WIN_BUILD_CMD" =~ ^[[:space:]]*cmd\.exe[[:space:]]+/c[[:space:]]+\"(.*)\"[[:space:]]*$ ]]; then
        WIN_BUILD_CMD_INNER="${BASH_REMATCH[1]}"
        WIN_BUILD_CMD_EFFECTIVE="cmd.exe /c \"${WIN_BUILD_NO_SIGN_PREFIX}${WIN_BUILD_CMD_INNER}\""
      else
        WIN_BUILD_CMD_EFFECTIVE="${WIN_BUILD_NO_SIGN_PREFIX_POSIX}${WIN_BUILD_CMD}"
      fi
    fi
    ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_BUILD_CMD_EFFECTIVE"

    WIN_UNSIGNED_EXE_REMOTE_WIN="$(ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" \
      "powershell -NoProfile -Command \"\$f = Get-ChildItem -LiteralPath '${WIN_BUILD_DIST_DIR_WIN}' -Filter *.exe -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (-not \$f) { Write-Error 'No unsigned Windows EXE found'; exit 44 }; Write-Output \$f.FullName\"")"
    WIN_UNSIGNED_EXE_REMOTE_WIN="$(printf '%s' "$WIN_UNSIGNED_EXE_REMOTE_WIN" | tr -d '\r')"
    WIN_SIGN_BASENAME="$(printf '%s' "$WIN_UNSIGNED_EXE_REMOTE_WIN" | sed -E 's#.*[\\/]##')"

    WIN_SIGN_INPUT_WIN="${WIN_SIGN_WIN_DIR%\\}\\${WIN_SIGN_BASENAME}"
    ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" \
      "powershell -NoProfile -Command \"\$dst='${WIN_SIGN_WIN_DIR}'; New-Item -ItemType Directory -Force -Path \$dst | Out-Null; Copy-Item -LiteralPath '${WIN_UNSIGNED_EXE_REMOTE_WIN}' -Destination (Join-Path \$dst '${WIN_SIGN_BASENAME}') -Force\""
  fi

  if [[ "$WIN_PHASE" == "stage" ]]; then
    echo "Windows stage complete. Unsigned EXE copied to manual signing folder."
    echo "Sign manually on the Windows build/sign host, then rerun with WIN_PHASE=finalize."
    echo "Expected input path: ${WIN_SIGN_INPUT_WIN}"
    echo "Resume command:"
    echo "  WIN_PHASE=finalize bash scripts/release/orchestrate-release.sh '${ENV_FILE}'"
    exit 0
  fi

  if [[ "$WIN_PHASE" != "stage" ]]; then
    SIGN_FETCH_INFO="$(ssh_run "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" \
      "powershell -NoProfile -Command \"\$sign='${WIN_SIGN_WIN_DIR}'; \$dist='${WIN_BUILD_DIST_DIR_WIN}'; \$f = Get-ChildItem -LiteralPath \$sign -Filter *.exe -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (-not \$f) { Write-Error 'No signed Windows EXE found'; exit 45 }; New-Item -ItemType Directory -Force -Path \$dist | Out-Null; \$safeExe = Join-Path \$dist '__orchestrator_signed.exe'; Copy-Item -LiteralPath \$f.FullName -Destination \$safeExe -Force; \$bmSrc = \"\$([string]\$f.FullName).blockmap\"; \$safeBm = \"\$safeExe.blockmap\"; if (Test-Path -LiteralPath \$bmSrc) { Copy-Item -LiteralPath \$bmSrc -Destination \$safeBm -Force; Write-Output \"BLOCKMAP=\$safeBm\" } else { Write-Output \"BLOCKMAP=\" }; Write-Output \"EXE=\$safeExe\"; Write-Output \"NAME=\$([string]\$f.Name)\"\"")"
    SIGN_FETCH_INFO="$(printf '%s' "$SIGN_FETCH_INFO" | tr -d '\r')"
    WIN_PRIMARY_EXE_REMOTE_WIN="$(printf '%s\n' "$SIGN_FETCH_INFO" | awk -F= '/^EXE=/{print $2}' | tail -n1)"
    WIN_PRIMARY_BLOCKMAP_REMOTE_WIN="$(printf '%s\n' "$SIGN_FETCH_INFO" | awk -F= '/^BLOCKMAP=/{print $2}' | tail -n1)"
    WIN_PRIMARY_EXE_NAME="$(printf '%s\n' "$SIGN_FETCH_INFO" | awk -F= '/^NAME=/{print $2}' | tail -n1)"
    if [[ -z "$WIN_PRIMARY_EXE_REMOTE_WIN" ]]; then
      echo "Unable to resolve signed Windows EXE path from remote host." >&2
      exit 1
    fi
    if [[ -z "$WIN_PRIMARY_EXE_NAME" ]]; then
      WIN_PRIMARY_EXE_NAME="$(printf '%s' "$WIN_PRIMARY_EXE_REMOTE_WIN" | sed -E 's#.*[\\/]##')"
    fi
    WIN_PRIMARY_EXE_REMOTE_POSIX="${WIN_PRIMARY_EXE_REMOTE_WIN//\\//}"
    WIN_PRIMARY_EXE_LOCAL="$STAGING_DIR/windows/signed/${WIN_PRIMARY_EXE_NAME}"
    scp_from_file "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_PRIMARY_EXE_REMOTE_POSIX" "$WIN_PRIMARY_EXE_LOCAL"
    WIN_PRIMARY_EXE="$WIN_PRIMARY_EXE_LOCAL"

    WIN_PRIMARY_BLOCKMAP=""
    if [[ -n "$WIN_PRIMARY_BLOCKMAP_REMOTE_WIN" ]]; then
      WIN_PRIMARY_BLOCKMAP_REMOTE_POSIX="${WIN_PRIMARY_BLOCKMAP_REMOTE_WIN//\\//}"
      WIN_PRIMARY_BLOCKMAP="$STAGING_DIR/windows/signed/${WIN_PRIMARY_EXE_NAME}.blockmap"
      scp_from_file "$WIN_BUILD_HOST" "$WIN_BUILD_USER" "${WIN_BUILD_PASSWORD:-}" "$WIN_BUILD_PORT" "$WIN_PRIMARY_BLOCKMAP_REMOTE_POSIX" "$WIN_PRIMARY_BLOCKMAP"
    fi

    yarn release:gen-yml \
      --version "$VERSION" \
      --output "$STAGING_DIR/windows/latest.yml" \
      --file "$WIN_PRIMARY_EXE"
    copy_to_release_builds "$WIN_PRIMARY_EXE" "$STAGING_DIR/windows/latest.yml"
    if [[ -n "${WIN_PRIMARY_BLOCKMAP:-}" ]]; then
      copy_to_release_builds "$WIN_PRIMARY_BLOCKMAP"
    fi
  fi
}

if truthy "${RUN_MAC_BUILD:-1}"; then
  echo "== macOS build/sign/notarize =="
  : "${MAC_ARM_HOST:?MAC_ARM_HOST is required when RUN_MAC_BUILD=1}"
  : "${MAC_ARM_USER:?MAC_ARM_USER is required when RUN_MAC_BUILD=1}"
  : "${MAC_ARM_REPO_DIR:?MAC_ARM_REPO_DIR is required when RUN_MAC_BUILD=1}"

  MAC_ARM_PORT="${MAC_ARM_PORT:-22}"
  MAC_BUILD_KIND="${MAC_BUILD_KIND:-universal}"
  BUNDLE_TAG="${MAC_BUNDLE_TAG:-mac-${MAC_BUILD_KIND}-${VERSION}-${STAMP}}"
  MAC_RELEASE_ENV_LOCAL="${MAC_RELEASE_ENV_LOCAL:-}"
  MAC_RELEASE_ENV_REMOTE="${MAC_RELEASE_ENV_REMOTE:-${MAC_ARM_REPO_DIR}/scripts/.env.release}"
  MAC_ARM_GIT_PULL_CMD="${MAC_ARM_GIT_PULL_CMD:-cd '${MAC_ARM_REPO_DIR}' && git pull --ff-only}"
  MAC_FETCH_HOST="${MAC_FETCH_HOST:-$MAC_ARM_HOST}"
  MAC_FETCH_PORT="${MAC_FETCH_PORT:-$MAC_ARM_PORT}"
  MAC_FETCH_USER="${MAC_FETCH_USER:-$MAC_ARM_USER}"
  MAC_FETCH_PASSWORD="${MAC_FETCH_PASSWORD:-${MAC_ARM_PASSWORD:-}}"
  MAC_FETCH_DIR="${MAC_FETCH_DIR:-}"
  if [[ -z "$MAC_FETCH_DIR" ]]; then
    if [[ -n "${MAC_ARM_OUTPUT_DIR:-}" ]]; then
      MAC_FETCH_DIR="${MAC_ARM_OUTPUT_DIR%/}/${BUNDLE_TAG}/"
    elif [[ -n "${MAC_SIGN_OUTPUT_DIR:-}" ]]; then
      MAC_FETCH_DIR="${MAC_SIGN_OUTPUT_DIR%/}/${BUNDLE_TAG}/"
    else
      echo "Set MAC_FETCH_DIR (or MAC_ARM_OUTPUT_DIR / MAC_SIGN_OUTPUT_DIR) when RUN_MAC_BUILD=1." >&2
      exit 1
    fi
  fi
  MAC_FETCH_DIR="${MAC_FETCH_DIR//__BUNDLE_TAG__/${BUNDLE_TAG}}"

  if [[ -n "$MAC_RELEASE_ENV_LOCAL" ]]; then
    RSYNC_EXCLUDES=""
    rsync_to "$MAC_ARM_HOST" "$MAC_ARM_USER" "${MAC_ARM_PASSWORD:-}" "$MAC_ARM_PORT" \
      "$MAC_RELEASE_ENV_LOCAL" "$MAC_RELEASE_ENV_REMOTE"
  fi

  ssh_run "$MAC_ARM_HOST" "$MAC_ARM_USER" "${MAC_ARM_PASSWORD:-}" "$MAC_ARM_PORT" "$MAC_ARM_GIT_PULL_CMD"

  MAC_REMOTE_CMD="${MAC_REMOTE_CMD:-}"
  if [[ -z "$MAC_REMOTE_CMD" ]]; then
    MAC_REMOTE_SCRIPT="${MAC_REMOTE_SCRIPT:-scripts/release-mac-build.sh}"
    MAC_REMOTE_CMD="cd '${MAC_ARM_REPO_DIR}' && BUNDLE_TAG_OVERRIDE='${BUNDLE_TAG}'"
    if [[ -n "$MAC_RELEASE_ENV_LOCAL" ]]; then
      MAC_REMOTE_CMD="${MAC_REMOTE_CMD} ENV_FILE='${MAC_RELEASE_ENV_REMOTE}'"
    fi
    MAC_REMOTE_CMD="${MAC_REMOTE_CMD} bash ${MAC_REMOTE_SCRIPT}"
  else
    MAC_REMOTE_CMD="${MAC_REMOTE_CMD//__BUNDLE_TAG__/${BUNDLE_TAG}}"
    MAC_REMOTE_CMD="${MAC_REMOTE_CMD//__ENV_FILE__/${MAC_RELEASE_ENV_REMOTE}}"
  fi

  ssh_run "$MAC_ARM_HOST" "$MAC_ARM_USER" "${MAC_ARM_PASSWORD:-}" "$MAC_ARM_PORT" "$MAC_REMOTE_CMD"

  mkdir -p "$STAGING_DIR/mac"
  MAC_CLEAN_OUTPUTS="${MAC_CLEAN_OUTPUTS:-1}"
  if truthy "$MAC_CLEAN_OUTPUTS"; then
    shopt -s nullglob
    stale_staging_mac=("$STAGING_DIR/mac/"*)
    if [[ "${#stale_staging_mac[@]}" -gt 0 ]]; then
      rm -f -- "${stale_staging_mac[@]}"
    fi
    stale_release_mac=(
      "$RELEASE_BUILDS_DIR/"*-mac.zip
      "$RELEASE_BUILDS_DIR/"*-mac.zip.blockmap
      "$RELEASE_BUILDS_DIR/"*-mac.dmg
      "$RELEASE_BUILDS_DIR/"*-mac.dmg.blockmap
      "$RELEASE_BUILDS_DIR/latest-mac.yml"
    )
    if [[ "${#stale_release_mac[@]}" -gt 0 ]]; then
      rm -f -- "${stale_release_mac[@]}"
    fi
    shopt -u nullglob
  fi
  rsync_from "$MAC_FETCH_HOST" "$MAC_FETCH_USER" "${MAC_FETCH_PASSWORD:-}" "$MAC_FETCH_PORT" \
    "$MAC_FETCH_DIR" "$STAGING_DIR/mac/"

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
  shopt -s nullglob
  mac_blockmaps=("$STAGING_DIR/mac/"*.zip.blockmap "$STAGING_DIR/mac/"*.dmg.blockmap)
  shopt -u nullglob
  copy_to_release_builds "$MAC_PRIMARY_ZIP" "$STAGING_DIR/mac/latest-mac.yml"
  if [[ -n "${MAC_PRIMARY_DMG:-}" ]]; then
    copy_to_release_builds "$MAC_PRIMARY_DMG"
  fi
  if [[ "${#mac_blockmaps[@]}" -gt 0 ]]; then
    copy_to_release_builds "${mac_blockmaps[@]}"
  fi
fi

run_windows_flow

# GitHub release automation temporarily disabled.
# if truthy "${GH_UPLOAD_RELEASE:-0}" || truthy "${GH_PUBLISH_RELEASE:-0}" || truthy "${GH_CREATE_DRAFT:-0}"; then
#   require_cmd gh
#   GH_REPO="${GH_REPO:-45Drives/studio-share}"
#   GH_TITLE="${GH_TITLE:-$RELEASE_TAG}"
#   GH_NOTES="${GH_NOTES:-}"
#
#   if truthy "${GH_CREATE_DRAFT:-0}"; then
#     if ! gh release view "$RELEASE_TAG" --repo "$GH_REPO" >/dev/null 2>&1; then
#       gh release create "$RELEASE_TAG" --repo "$GH_REPO" --title "$GH_TITLE" --notes "$GH_NOTES" --draft
#     fi
#   fi
#
#   if truthy "${GH_UPLOAD_RELEASE:-0}"; then
#     mapfile -t assets < <(find "$STAGING_DIR" -maxdepth 2 -type f \
#       \( -name '*.yml' -o -name '*.exe' -o -name '*.blockmap' -o -name '*.zip' -o -name '*.dmg' -o -name '*.deb' -o -name '*.rpm' \) | sort)
#     if [[ "${#assets[@]}" -eq 0 ]]; then
#       echo "No assets found to upload from $STAGING_DIR" >&2
#       exit 1
#     fi
#     gh release upload "$RELEASE_TAG" --repo "$GH_REPO" --clobber "${assets[@]}"
#   fi
#
#   if truthy "${GH_PUBLISH_RELEASE:-0}"; then
#     gh release edit "$RELEASE_TAG" --repo "$GH_REPO" --draft=false
#   fi
# fi

echo "Release orchestration complete."
echo "Collected assets under: $STAGING_DIR"
echo "Final release-builds assets under: $RELEASE_BUILDS_DIR"
