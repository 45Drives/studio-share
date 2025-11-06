// setupSsh.ts
import fs from "fs";
import net from "net";
import path from "path";
import { app } from "electron";
import { NodeSSH } from "node-ssh";
import { getOS } from "./utils";
import { getKeyDir, ensureKeyPair } from "./crossPlatformSsh";

/** Quick TCP probe for port 22 */
export function checkSSH(host: string, timeout = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.connect(22, host);
  });
}

/** password auth (one-time) to plant our pubkey */
export async function connectWithPassword(args: { host: string; username: string; password: string; }) {
  const { host, username, password } = args;
  const ssh = new NodeSSH();
  await ssh.connect({
    host,
    username,
    password,
    tryKeyboard: true,
    onKeyboardInteractive(_n, _i, _l, prompts, finish) {
      finish(prompts.map(() => password));
    },
    readyTimeout: 20_000,
  });
  return ssh;
}

/** key/agent auth */
export async function connectWithKey(args: { host: string; username: string; privateKey: string; agent?: string }) {
  const { host, username, privateKey, agent } = args;

  // If a path was passed, load the file
  const keyData = privateKey.includes('BEGIN ')
    ? privateKey
    : fs.readFileSync(privateKey, 'utf8');  // <-- read contents

  const ssh = new NodeSSH();
  await ssh.connect({
    host,
    username,
    privateKey: keyData,              // pass contents
    agent,
    tryKeyboard: false,
    readyTimeout: 20_000,
    debug: (m: string) => console.log('ssh.debug', m),
  });
  return ssh;
}

/** Append public key to remote authorized_keys (idempotent) */
export async function setupSshKey(host: string, username: string, password: string): Promise<void> {
  // make sure we actually have a keypair locally
  const keyDir = getKeyDir();
  const priv = path.join(keyDir, "id_rsa");
  const pub = `${priv}.pub`;
  await ensureKeyPair(priv, pub);

  const ssh = await connectWithPassword({ host, username, password });

  const publicKey = fs.readFileSync(pub, "utf8").trim().replace(/["`]/g, "");

  await ssh.execCommand(
    [
      "mkdir -p ~/.ssh",
      "chmod 700 ~/.ssh",
      `grep -F "${publicKey}" ~/.ssh/authorized_keys 2>/dev/null || echo "${publicKey}" >> ~/.ssh/authorized_keys`,
      "chmod 600 ~/.ssh/authorized_keys",
    ].join(" && ")
  );

  ssh.dispose();
}

export async function ensureBroadcasterInstalled(
  ssh: NodeSSH,
  opts: { password?: string }
) {
  const q = (s: string) => `'${s.replace(/'/g, `'\"'\"'`)}'`;
  const PW = opts.password ?? "";

  const REQUIRED = "2.0.0";

  const script = `
set -euo pipefail

REQUIRED_VERSION=${q(REQUIRED)}
PW=${q(PW)}

have_sudo() { sudo -n true 2>/dev/null; }
run_root() {
  if have_sudo; then sudo "$@"; else printf '%s\\n' "$PW" | sudo -S -p '' "$@"; fi
}

# Generic version helpers (semver-ish), fine for x.y.z[-r] without epochs
version_ge() {  # $1 >= $2 ?
  [ "$(printf '%s\\n%s\\n' "$1" "$2" | sort -V | tail -n1)" = "$1" ]
}
version_gt() {  # $1 > $2 ?
  [ "$1" != "$2" ] && version_ge "$1" "$2"
}

installed_ver=""
candidate_ver=""

if command -v rpm >/dev/null 2>&1; then
  # ---------------- RPM family (RHEL/CentOS/Fedora/etc.) ----------------
  if rpm -q houston-broadcaster >/dev/null 2>&1; then
    installed_ver="$(rpm -q --qf '%{VERSION}-%{RELEASE}\\n' houston-broadcaster 2>/dev/null || true)"
  fi

  # Discover repo candidate
  if command -v dnf >/dev/null 2>&1; then
    # --refresh ensures fresh metadata; awk builds "version-release"
    candidate_ver="$(dnf -q --refresh info houston-broadcaster 2>/dev/null | awk -F': *' '
      /Version/ {v=$2} /Release/ {r=$2} END{ if (v) print v "-" r }')"
  elif command -v yum >/dev/null 2>&1; then
    candidate_ver="$(yum -q info houston-broadcaster 2>/dev/null | awk -F': *' '
      /Version/ {v=$2} /Release/ {r=$2} END{ if (v) print v "-" r }')"
  fi

  if [ -z "$candidate_ver" ]; then
    echo "Could not determine candidate version for houston-broadcaster" >&2
    exit 2
  fi

  # Ensure candidate meets minimum
  if ! version_ge "$candidate_ver" "$REQUIRED_VERSION"; then
    echo "Repository candidate ($candidate_ver) is older than required >= $REQUIRED_VERSION" >&2
    exit 2
  fi

  if [ -n "$installed_ver" ]; then
    # Installed: upgrade only if newer candidate exists
    if version_gt "$candidate_ver" "$installed_ver"; then
      if command -v dnf >/dev/null 2>&1; then
        run_root dnf -y --refresh install houston-broadcaster
      else
        run_root yum -y install houston-broadcaster
      fi
    fi
    exit 0
  fi

  # Not installed: install candidate (already validated against minimum)
  if command -v dnf >/dev/null 2>&1; then
    run_root dnf -y --refresh install houston-broadcaster
  else
    run_root yum -y install houston-broadcaster
  fi
  exit 0

elif command -v dpkg >/dev/null 2>&1; then
  # ---------------- Debian/Ubuntu family ----------------
  if dpkg -s houston-broadcaster >/dev/null 2>&1; then
    installed_ver="$(dpkg-query -W -f='\${Version}\\n' houston-broadcaster 2>/dev/null || true)"
  fi

  run_root apt-get update -y

  candidate_ver="$(apt-cache policy houston-broadcaster | awk '/Candidate:/ {print $2}')"
  if [ -z "$candidate_ver" ] || [ "$candidate_ver" = "(none)" ]; then
    echo "No install candidate for houston-broadcaster" >&2
    exit 2
  fi

  # Ensure candidate meets minimum
  if ! version_ge "$candidate_ver" "$REQUIRED_VERSION"; then
    echo "Repository candidate ($candidate_ver) is older than required >= $REQUIRED_VERSION" >&2
    exit 2
  fi

  if [ -n "$installed_ver" ]; then
    # Installed: upgrade only if newer candidate exists
    if version_gt "$candidate_ver" "$installed_ver"; then
      DEBIAN_FRONTEND=noninteractive run_root apt-get install -y houston-broadcaster
    fi
    exit 0
  fi

  # Not installed
  DEBIAN_FRONTEND=noninteractive run_root apt-get install -y houston-broadcaster
  exit 0

else
  echo "No supported package manager found" >&2
  exit 2
fi
`.trim();

  const res = await ssh.execCommand(`bash -lc ${q(script)}`);
  if ((res.code ?? 1) !== 0) {
    throw new Error(`install failed: ${res.stderr || res.stdout}`);
  }
}