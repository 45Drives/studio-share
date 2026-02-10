#!/usr/bin/env bash
set -e
set -x

# Remote Windows host that can build Electron apps (Node + Yarn installed)
WIN_HOST="user@192.168.207.55"

# Remote/local dirs
REMOTE_BUILD_DIR="build_studioshare_temp"
LOCAL_APP_DIR="$(cd "$(dirname "$0")"; pwd)"
LOCAL_OUTPUT_DIR="${LOCAL_APP_DIR}/builds/windows"

# Ensure output dir
mkdir -p "${LOCAL_OUTPUT_DIR}"

# 1) Prepare remote folder
ssh "${WIN_HOST}" "cmd.exe /c \"\
  if not exist ${REMOTE_BUILD_DIR} mkdir ${REMOTE_BUILD_DIR} && \
  if exist ${REMOTE_BUILD_DIR}\\dist rmdir /s /q ${REMOTE_BUILD_DIR}\\dist\
\""

# 2) Sync source (skip bulky dirs)
rsync -avz --delete \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='builds' \
  --exclude='node_modules' \
  --exclude='.env*' \
  "${LOCAL_APP_DIR}/" \
  "${WIN_HOST}:${REMOTE_BUILD_DIR}/"

# 3) Build on Windows
# package.json: "build:win": "yarn build:common && node scripts/build.js && electron-builder --win"
ssh "${WIN_HOST}" "cd ${REMOTE_BUILD_DIR} && yarn install && yarn build:win"

# 4) Pull artifacts back
# Your artifactName is: "${productName}-${version}-${os}-${arch}.${ext}"
# Example: "Flow-by-45Studio-1.2.3-win-x64.exe" (note the space!)
rsync -avz \
  "${WIN_HOST}:${REMOTE_BUILD_DIR}/dist/Flow-by-45Studio-*-win-*.exe" \
  "${LOCAL_OUTPUT_DIR}/" || true

# (Optional) pull auto-update files if you use electron-updater
rsync -avz \
  "${WIN_HOST}:${REMOTE_BUILD_DIR}/dist/Flow-by-45Studio-*-win-*.yml" \
  "${LOCAL_OUTPUT_DIR}/" || true

echo "✅ Windows build complete."
echo "Artifacts in: ${LOCAL_OUTPUT_DIR}"
