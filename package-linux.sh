#!/usr/bin/env bash
set -euo pipefail

# ========= Settings (override via env if needed) =========
REMOTE_HOST="${REMOTE_HOST:-root@192.168.123.5}"
REMOTE_DIR="${REMOTE_DIR:-/tmp/studio-share-build}"
OUTPUT_DIR="${OUTPUT_DIR:-$PWD/builds/linux}"
ARCHES="${ARCHES:-x64}"          # "x64" or "x64,arm64"
PUBLISH="${PUBLISH:-never}"      # "never" | "onTag" | "always"
NODE_VERSION="${NODE_VERSION:-20}"
SSH_OPTS="-o StrictHostKeyChecking=no"

# Exclude big/ephemeral stuff from rsync to remote
EXCLUDES=(
  --exclude=".git"
  --exclude="dist"
  --exclude="builds"
  --exclude="node_modules"
  --exclude=".env*"
)

# ========= Helpers =========
remote() { ssh $SSH_OPTS "$REMOTE_HOST" "$@"; }

sync_source() {
  echo "→ Syncing source to $REMOTE_HOST:$REMOTE_DIR"
  remote "rm -rf '$REMOTE_DIR' && mkdir -p '$REMOTE_DIR'"
  rsync -avz --delete "${EXCLUDES[@]}" -e "ssh $SSH_OPTS" ./ "$REMOTE_HOST:$REMOTE_DIR/"
}

prepare_remote_env() {
  echo "→ Preparing remote Node/Yarn toolchain"
  remote bash -lc "set -e
    # Prefer nvm if available; otherwise use system Node
    if [ -s \"\$HOME/.nvm/nvm.sh\" ]; then
      . \"\$HOME/.nvm/nvm.sh\"
      nvm install $NODE_VERSION >/dev/null 2>&1 || true
      nvm use $NODE_VERSION
    fi

    # Ensure corepack/Yarn 4 matches your repo
    if ! command -v corepack >/dev/null 2>&1; then
      echo 'WARN: corepack not found; installing via npm if available' >&2
      command -v npm >/dev/null 2>&1 && npm i -g corepack || true
    fi
    corepack enable || true
    corepack prepare yarn@4.6.0 --activate

    # Common build deps (best-effort)
    if command -v dnf >/dev/null 2>&1; then
      sudo dnf -y install git gcc-c++ make python3 libX11-devel \
        libXext libXrender libXtst libxkbfile libsecret-devel \
        rpm-build dpkg >/dev/null 2>&1 || true
    elif command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -y >/dev/null 2>&1 || true
      sudo apt-get install -y build-essential python3 libsecret-1-dev \
        rpm dpkg fakeroot >/dev/null 2>&1 || true
    fi
  "
}

build_arch() {
  local arch="$1"
  echo "→ Building linux-$arch"
  remote bash -lc "set -e
    cd '$REMOTE_DIR'
    corepack enable || true
    corepack prepare yarn@4.6.0 --activate

    # Install from .yarn cache (zero-install friendly)
    yarn install --immutable

    yarn build:common
    node scripts/build.js

    # Ensure native deps (e.g., keytar) rebuilt for Electron ABI
    npx electron-builder install-app-deps --arch=$arch

    # Package (publishing controlled via \$PUBLISH + GH_TOKEN)
    npx electron-builder --linux --arch=$arch --config electron-builder.json --publish=$PUBLISH
  "
}

fetch_artifacts() {
  echo "→ Fetching artifacts"
  mkdir -p "$OUTPUT_DIR"
  # Grab everything; your artifactName yields names like:
  # "45Studio Filesharing-<ver>-linux-<arch>.{deb,rpm,pacman,AppImage?}"
  rsync -avz -e "ssh $SSH_OPTS" \
    "$REMOTE_HOST:$REMOTE_DIR/dist/" "$OUTPUT_DIR/"
}

# ========= Main =========
echo "🐧 Remote Linux build (ARCHES=$ARCHES, PUBLISH=$PUBLISH)"
sync_source
prepare_remote_env
IFS=',' read -ra A <<< "$ARCHES"
for arch in "${A[@]}"; do
  build_arch "$arch"
done
fetch_artifacts
echo "✅ Done. Artifacts in: $OUTPUT_DIR"
