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

  const script = `
set -euo pipefail

PW=${q(PW)}

have_sudo() {
  sudo -n true 2>/dev/null
}

run_root() {
  if have_sudo; then
    sudo "$@"
  else
    # feed password via stdin for each sudo call
    printf '%s\\n' "$PW" | sudo -S -p '' "$@"
  fi
}

# already installed?
if command -v rpm >/dev/null 2>&1; then
  if rpm -q houston-broadcaster >/dev/null 2>&1; then exit 0; fi
elif command -v dpkg >/dev/null 2>&1; then
  if dpkg -s houston-broadcaster >/dev/null 2>&1; then exit 0; fi
fi

# pick pm + install
if command -v dnf >/dev/null 2>&1; then
  run_root dnf -y install houston-broadcaster
elif command -v yum >/dev/null 2>&1; then
  run_root yum -y install houston-broadcaster
elif command -v apt-get >/dev/null 2>&1; then
  run_root apt-get update -y
  DEBIAN_FRONTEND=noninteractive run_root apt-get install -y houston-broadcaster
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